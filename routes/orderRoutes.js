import express from "express";
import { createOrder, getUserOrders, getOrderById, cancelOrder, checkCODAvailability, createRazorpayOrder, verifyRazorpayPayment, updateOnlinePaymentStatus, checkOrderStock } from "../controllers/orderController.js";
import { verifyToken } from "../middleware/authMiddleware.js";

const router = express.Router();

// Order routes (all require authentication)
router.post("/", verifyToken, createOrder);
router.post("/check-cod", verifyToken, checkCODAvailability);
router.post("/razorpay/order", verifyToken, createRazorpayOrder);
router.post("/razorpay/verify", verifyToken, verifyRazorpayPayment);
router.post("/check-stock", verifyToken, checkOrderStock);
router.get("/", verifyToken, getUserOrders);
router.get("/:id", verifyToken, getOrderById);
router.patch("/:id/cancel", verifyToken, cancelOrder);
router.patch("/:id/payment-status", verifyToken, updateOnlinePaymentStatus);

export default router; 