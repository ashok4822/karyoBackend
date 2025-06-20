import express from "express";
import validateUser from "../utils/validateUser.js";
import { loginUser, registerUser, requestOtp, verifyOtp, requestPasswordResetOtp, verifyPasswordResetOtp, resetPassword, refreshToken } from "../controllers/authController.js";
import { logout, adminLogout } from "../controllers/profileController.js";
import passport from "passport";

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
    // You can set a cookie or JWT here if needed
    res.redirect("http://localhost:8080/"); // Redirect to frontend after login
  }
);

export default router;
