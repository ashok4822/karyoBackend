import express from "express";
import {
  createOffer,
  getOffers,
  getOfferById,
  updateOffer,
  deleteOffer,
  getBestOfferForProduct,
  getOffersByCategory,
  getOffersByProducts,
  toggleOfferStatus,
  getOfferStats,
} from "../controllers/offerController.js";
import { verifyAdmin } from "../middleware/authMiddleware.js";

const router = express.Router();

// Public/User routes (must come before admin routes to avoid conflicts)
// Get all active offers for users
router.get("/offers", getOffers);

// Get best offer for a product
router.get("/offers/product/:productId", getBestOfferForProduct);

// Get offers for a category
router.get("/offers/category/:categoryId", getOffersByCategory);

// Get offers for specific products
router.post("/offers/products", getOffersByProducts);

// Admin routes (protected)
router.use("/admin", verifyAdmin);

// Create offer
router.post("/admin/offers", createOffer);

// Get all offers with filters
router.get("/admin/offers", getOffers);

// Get offer by ID
router.get("/admin/offers/:id", getOfferById);

// Update offer
router.put("/admin/offers/:id", updateOffer);

// Delete offer
router.delete("/admin/offers/:id", deleteOffer);

// Toggle offer status
router.patch("/admin/offers/:id/status", toggleOfferStatus);

// Get offer statistics
router.get("/admin/offers/stats", getOfferStats);

export default router; 