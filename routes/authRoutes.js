import express from "express";
import validateUser from "../utils/validateUser.js";
import { loginUser, registerUser, requestOtp, verifyOtp, requestPasswordResetOtp, verifyPasswordResetOtp, resetPassword, refreshToken } from "../controllers/authController.js";
import { logout, adminLogout } from "../controllers/profileController.js";
import passport from "passport";
import { generateAccessToken, generateRefreshToken } from "../utils/jwt.js";
import User from "../models/userModel.js";

const router = express.Router();

router.post("/register", validateUser, registerUser);
router.post("/login", loginUser);
router.post("/request-otp", requestOtp);
router.post("/verify-otp", verifyOtp);
// Forgot password routes
router.post("/request-password-reset-otp", requestPasswordResetOtp);
router.post("/verify-password-reset-otp", verifyPasswordResetOtp);
router.post("/reset-password", resetPassword);
router.post("/refresh-token", refreshToken);
router.post("/logout", logout);
router.post("/admin/logout", adminLogout);

router.get("/google", passport.authenticate("google", { scope: ["profile", "email"] }));

router.get(
  "/google/callback",
  passport.authenticate("google", { failureRedirect: "/login", session: false }),
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
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    });
    // Save refresh token to user document
    User.updateOne({ _id: req.user._id }, { $set: { refreshToken } }).then(() => {
      // Redirect to frontend with access token in URL
      res.redirect(`http://localhost:8080/google-auth-success?token=${accessToken}`);
    });
  }
);

export default router;
