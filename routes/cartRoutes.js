import express from "express";
import * as cartController from "../controllers/cartController.js";
import { verifyToken } from "../middleware/authMiddleware.js";

const router = express.Router();

// All cart routes require authentication
router.use(verifyToken);

// Add item to cart
router.post("/add", cartController.addToCart);

// Get user's cart
router.get("/", cartController.getCart);

// Update cart item quantity
router.put("/update", cartController.updateCartItem);

// Remove item from cart
router.delete("/remove", cartController.removeFromCart);

// Clear entire cart
router.delete("/clear", cartController.clearCart);

// Get available stock for a product (considering cart quantities)
router.get("/available-stock/:productId", cartController.getAvailableStock);

export default router;
