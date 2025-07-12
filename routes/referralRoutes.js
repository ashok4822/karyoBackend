import express from "express";
import {
  generateReferralCode,
  getReferralCode,
  generateReferralLink,
  validateReferral,
  processReferral,
  getReferralHistory,
  getReferralStats,
  getAllReferrals,
} from "../controllers/referralController.js";
import { verifyToken } from "../middleware/authMiddleware.js";
import { verifyAdmin } from "../middleware/authMiddleware.js";

const router = express.Router();

// User routes (protected)
router.use("/user", verifyToken);

// Generate referral code
router.post("/user/referral/generate-code", generateReferralCode);

// Get user's referral code and stats
router.get("/user/referral/code", getReferralCode);

// Generate referral link with token
router.post("/user/referral/generate-link", generateReferralLink);

// Get user's referral history
router.get("/user/referral/history", getReferralHistory);

// Get user's referral statistics
router.get("/user/referral/stats", getReferralStats);

// Public routes
// Validate referral code/token
router.post("/referral/validate", validateReferral);

// Process referral completion
router.post("/referral/process", processReferral);

// Admin routes (protected)
router.use("/admin", verifyAdmin);

// Get all referrals
router.get("/admin/referrals", getAllReferrals);

export default router; 