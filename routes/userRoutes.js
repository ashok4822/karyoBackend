import express from "express";
import multer from "multer";
import path from "path";
// import { registerUser, loginUser } from "../controllers/userController.js";
import { getProfile, updateProfile, uploadProfileImage, createShippingAddress, getShippingAddresses, setDefaultShippingAddress, updateShippingAddress, deleteShippingAddress, requestEmailChangeOtp, verifyEmailChangeOtp } from "../controllers/profileController.js";
import { getUserEligibleDiscounts } from "../controllers/discountController.js";
import { verifyToken } from "../middleware/authMiddleware.js";
import { returnOrder } from '../controllers/orderController.js';

const router = express.Router();

// Multer setup for local temp storage
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, "uploads/");
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + path.extname(file.originalname));
  },
});
const upload = multer({ storage });

router.get("/profile", verifyToken, getProfile);
router.put("/profile", verifyToken, updateProfile);
router.put("/profile-image", verifyToken, upload.single("image"), uploadProfileImage);
router.post("/shipping-address", verifyToken, createShippingAddress);
router.get("/shipping-addresses", verifyToken, getShippingAddresses);
router.put("/shipping-address/:id/default", verifyToken, setDefaultShippingAddress);
router.put("/shipping-address/:id", verifyToken, updateShippingAddress);
router.delete("/shipping-address/:id", verifyToken, deleteShippingAddress);
router.post("/request-email-change-otp", verifyToken, requestEmailChangeOtp);
router.post("/verify-email-change-otp", verifyToken, verifyEmailChangeOtp);
router.get("/discounts/eligible", verifyToken, getUserEligibleDiscounts);
router.post('/orders/:id/return', verifyToken, returnOrder);

export default router;

// @route   POST /api/users/register
// @desc    Register a new user
// @access  Public
// router.post('/register', registerUser);

// @route   POST /api/users/login
// @desc    Login user
// @access  Public
// router.post('/login', loginUser);
