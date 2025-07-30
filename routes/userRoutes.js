import express from "express";
import { getProfile, updateProfile, uploadProfileImage, createShippingAddress, getShippingAddresses, setDefaultShippingAddress, updateShippingAddress, deleteShippingAddress, requestEmailChangeOtp, verifyEmailChangeOtp } from "../controllers/profileController.js";
import { getUserEligibleDiscounts, validateCouponCode } from "../controllers/discountController.js";
import { verifyToken } from "../middleware/authMiddleware.js";
import { returnOrder } from '../controllers/orderController.js';
import { getWallet, addFunds, deductFunds, getTransactions, createWalletRazorpayOrder, verifyWalletPayment } from "../controllers/walletController.js";
import { upload } from "../middleware/upload.js";

const router = express.Router();

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
router.post("/validate-coupon", verifyToken, validateCouponCode);
router.post('/orders/:id/return', verifyToken, returnOrder);
router.get("/wallet", verifyToken, getWallet);
router.post("/wallet/add", verifyToken, addFunds);
router.post("/wallet/deduct", verifyToken, deductFunds);
router.get("/wallet/transactions", verifyToken, getTransactions);
router.post("/wallet/razorpay/order", verifyToken, createWalletRazorpayOrder);
router.post("/wallet/razorpay/verify", verifyToken, verifyWalletPayment);

export default router;


