import express from "express";
import { createOrder, getUserOrders, getOrderById, cancelOrder } from "../controllers/orderController.js";
import { verifyToken } from "../middleware/authMiddleware.js";

const router = express.Router();

// Order routes (all require authentication)
router.post("/", verifyToken, createOrder);
router.get("/", verifyToken, getUserOrders);
router.get("/:id", verifyToken, getOrderById);
router.patch("/:id/cancel", verifyToken, cancelOrder);

export default router; 