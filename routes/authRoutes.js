import express from "express";
import validateUser from "../utils/validateUser.js";
import {
  loginUser,
  registerUser,
  requestOtp,
  verifyOtp,
  requestPasswordResetOtp,
  verifyPasswordResetOtp,
  resetPassword,
  refreshToken,
} from "../controllers/authController.js";
import { logout, adminLogout } from "../controllers/profileController.js";
import passport from "passport";
import { generateAccessToken, generateRefreshToken } from "../utils/jwt.js";
import User from "../models/userModel.js";
import { loginLimiter, refreshLimiter } from "../middleware/rateLimiter.js";

const router = express.Router();

router.post("/register", validateUser, registerUser);
router.post("/login", loginLimiter, loginUser);
router.post("/request-otp", requestOtp);
router.post("/verify-otp", verifyOtp);
// Forgot password routes
router.post("/request-password-reset-otp", requestPasswordResetOtp);
router.post("/verify-password-reset-otp", verifyPasswordResetOtp);
router.post("/reset-password", resetPassword);
router.post("/refresh-token", refreshToken);
router.post("/logout", logout);
router.post("/admin/logout", adminLogout);

// Development route to clear rate limits (remove in production)
if (process.env.NODE_ENV !== "production") {
  router.post("/clear-rate-limits", (req, res) => {
    // This would need to be implemented with the actual rate limiter store
    // For now, just return success
    res.json({ message: "Rate limits cleared (development only)" });
  });
}

router.get(
  "/google",
  (req, res, next) => {
    // Capture referral token/code from ?ref=... and store globally for the OAuth callback
    if (req.query.ref) {
      global._passport_oauth_referral = {
        referralToken: req.query.ref,
        referralCode: req.query.ref,
      };
    } else {
      global._passport_oauth_referral = null;
    }
    next();
  },
  passport.authenticate("google", { scope: ["profile", "email"] })
);

router.get(
  "/google/callback",
  (req, res, next) => {
    passport.authenticate("google", { session: false }, (err, user, info) => {
      if (err) {
        // Handle authentication errors (like blocked user)
        const failureRedirectUrl = process.env.LOGIN_FAILURE_REDIRECT_URL || "http://localhost:8080/login";
        const errorMessage = encodeURIComponent(err.message || "Authentication failed");
        return res.redirect(`${failureRedirectUrl}?error=${errorMessage}`);
      }
      
      if (!user) {
        // Handle case where no user is returned
        const failureRedirectUrl = process.env.LOGIN_FAILURE_REDIRECT_URL || "http://localhost:8080/login";
        const errorMessage = encodeURIComponent("Authentication failed");
        return res.redirect(`${failureRedirectUrl}?error=${errorMessage}`);
      }
      
      // Check if user is blocked
      if (user.isDeleted) {
        const failureRedirectUrl = process.env.LOGIN_FAILURE_REDIRECT_URL || "http://localhost:8080/login";
        const errorMessage = encodeURIComponent("Your account has been blocked. Please contact support.");
        return res.redirect(`${failureRedirectUrl}?error=${errorMessage}`);
      }
      
      // Check if user is admin
      if (user.role === "admin") {
        const failureRedirectUrl = process.env.LOGIN_FAILURE_REDIRECT_URL || "http://localhost:8080/login";
        const errorMessage = encodeURIComponent("Admins must log in through the admin login page.");
        return res.redirect(`${failureRedirectUrl}?error=${errorMessage}`);
      }
      
      // Store user in request for the next middleware
      req.user = user;
      next();
    })(req, res, next);
  },
  (req, res) => {
    // Generate JWT tokens
    const accessToken = generateAccessToken(req.user);
    const refreshToken = generateRefreshToken(req.user);
    const isProduction = process.env.NODE_ENV === "production";
    res.cookie("refreshToken", refreshToken, {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? "Strict" : "Lax",
      path: "/",
      maxAge:
        (parseInt(process.env.COOKIE_MAX_AGE_DAYS) || 7) * 24 * 60 * 60 * 1000, // 7 days
    });
    // Save refresh token to user document
    User.updateOne({ _id: req.user._id }, { $set: { refreshToken } }).then(
      () => {
        // Redirect to frontend with access token in URL
        const successRedirectUrl =
          process.env.GOOGLE_AUTH_SUCCESS_REDIRECT_URL ||
          "http://localhost:8080/google-auth-success";
        res.redirect(`${successRedirectUrl}?token=${accessToken}`);
      }
    );
  }
);

export default router;
