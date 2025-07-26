import express from "express";
import { isAdmin, verifyToken, verifyAdmin } from "../middleware/authMiddleware.js";
import { getUsers } from "../controllers/userController.js";
import {
  adminLogin,
  getUsersPaginated,
  blockUnblockUser,
  adminRefreshToken,
} from "../controllers/adminController.js";
import { adminLogout } from "../controllers/profileController.js";
import {
  listCategories,
  addCategory,
  editCategory,
  deleteCategory,
  restoreCategory,
  getActiveCategories,
} from "../controllers/categoryController.js";
import {
  listDiscounts,
  addDiscount,
  getDiscountById,
  editDiscount,
  deleteDiscount,
  restoreDiscount,
  getActiveDiscounts,
  updateDiscountUsage,
  getUserDiscountUsage,
  getAllDiscountUsageStats,
} from "../controllers/discountController.js";
import { getDashboard, generateLedgerBook } from "../controllers/adminDashboard.js";
import {
  addProduct,
  listProducts,
  getProductById,
  editProduct,
  deleteProduct,
  deleteVariant,
  updateVariant,
  getVariantOptions,
  getBrandOptions,
  addVariant,
} from "../controllers/productController.js";
import fs from "fs";
import path from "path";
import {
  getAllOrders,
  getOrderByIdForAdmin,
  updateOrderStatus,
  updatePaymentStatus,
  deleteOrder,
  verifyReturnRequest,
  rejectReturnRequest,
  verifyReturnWithoutRefund,
  updateOrderItemStatus,
} from "../controllers/orderController.js";
import {
  listCoupons,
  addCoupon,
  editCoupon,
  deleteCoupon,
  restoreCoupon,
  triggerExpiredCouponUpdate,
} from "../controllers/couponController.js";
import {
  getOffers as listOffers,
  createOffer as addOffer,
  getOfferById,
  updateOffer as editOffer,
  deleteOffer,
  toggleOfferStatus,
  getBestOfferForProduct,
  getOffersByCategory,
  getOffersByProducts,
} from "../controllers/offerController.js";
import { getAllReferrals as listReferrals } from "../controllers/referralController.js";
import { uploadProduct, handleMulterError } from "../middleware/upload.js";

const router = express.Router();

router.post("/login", adminLogin);
router.get("/getUsers", verifyAdmin, getUsers);
router.get("/dashboard", verifyAdmin, getDashboard);
router.get("/ledger", verifyAdmin, generateLedgerBook);
router.get("/users", verifyAdmin, getUsersPaginated);
router.patch("/users/:id/block", verifyToken, isAdmin, blockUnblockUser);
router.post("/logout", adminLogout);
router.get("/categories", verifyToken, isAdmin, listCategories);
router.get("/categories/active", verifyToken, isAdmin, getActiveCategories);
router.post("/categories", verifyToken, isAdmin, addCategory);
router.put("/categories/:id", verifyToken, isAdmin, editCategory);
router.delete("/categories/:id", verifyToken, isAdmin, deleteCategory);
router.patch("/categories/:id/restore", verifyToken, isAdmin, restoreCategory);
router.post(
  "/products",
  verifyAdmin,
  uploadProduct,
  handleMulterError,
  addProduct
);
router.get("/products", verifyAdmin, listProducts);
router.get("/products/variant-options", verifyAdmin, getVariantOptions);
router.get("/products/brand-options", verifyAdmin, getBrandOptions);
router.get("/products/:id", verifyAdmin, getProductById);
router.put(
  "/products/:id",
  verifyAdmin,
  uploadProduct,
  handleMulterError,
  editProduct
);
router.delete("/products/:id", verifyAdmin, deleteProduct);
router.post(
  "/products/:productId/variants",
  verifyAdmin,
  uploadProduct,
  handleMulterError,
  addVariant
);
router.delete(
  "/products/:productId/variants/:variantId",
  verifyAdmin,
  deleteVariant
);
router.put(
  "/products/:productId/variants/:variantId",
  verifyAdmin,
  uploadProduct,
  handleMulterError,
  updateVariant
);
router.post("/refresh-token", adminRefreshToken);

// Discount routes
router.get("/discounts", verifyToken, isAdmin, listDiscounts);
router.post("/discounts", verifyToken, isAdmin, addDiscount);
router.get("/discounts/active/all", verifyAdmin, getActiveDiscounts);
router.get(
  "/discounts/usage-stats",
  verifyToken,
  isAdmin,
  getAllDiscountUsageStats
);
router.get("/discounts/:id", verifyToken, isAdmin, getDiscountById);
router.put("/discounts/:id", verifyToken, isAdmin, editDiscount);
router.delete("/discounts/:id", verifyToken, isAdmin, deleteDiscount);
router.patch("/discounts/:id/restore", verifyToken, isAdmin, restoreDiscount);
router.patch("/discounts/:id/usage", verifyAdmin, updateDiscountUsage);
router.get(
  "/discounts/:discountId/user-usage",
  verifyToken,
  isAdmin,
  getUserDiscountUsage
);

router.get("/orders", verifyToken, isAdmin, getAllOrders);
router.get("/orders/:id", verifyToken, isAdmin, getOrderByIdForAdmin);
router.put("/orders/:id/status", verifyToken, isAdmin, updateOrderStatus);
router.put(
  "/orders/:id/payment-status",
  verifyToken,
  isAdmin,
  updatePaymentStatus
);
router.delete("/orders/:id", verifyToken, isAdmin, deleteOrder);
router.put(
  "/orders/:id/verify-return",
  verifyToken,
  isAdmin,
  verifyReturnRequest
);
router.put(
  "/orders/:id/verify-return-no-refund",
  verifyToken,
  isAdmin,
  verifyReturnWithoutRefund
);
router.put(
  "/orders/:id/reject-return",
  verifyToken,
  isAdmin,
  rejectReturnRequest
);
// Per-item status update
router.put(
  "/orders/:orderId/items/:itemId/status",
  verifyToken,
  isAdmin,
  updateOrderItemStatus
);

// Coupon routes
router.get("/coupons", verifyToken, isAdmin, listCoupons);
router.post("/coupons", verifyToken, isAdmin, addCoupon);
router.put("/coupons/:id", verifyToken, isAdmin, editCoupon);
router.delete("/coupons/:id", verifyToken, isAdmin, deleteCoupon);
router.patch("/coupons/:id/restore", verifyToken, isAdmin, restoreCoupon);
router.post(
  "/coupons/update-expired",
  verifyToken,
  isAdmin,
  triggerExpiredCouponUpdate
);

// Test route
router.get("/test", (req, res) => {
  res.json({ message: "Admin routes are working" });
});

// Offer routes
router.get("/offers", verifyToken, isAdmin, listOffers);
router.post("/offers", verifyToken, isAdmin, addOffer);
router.get(
  "/offers/product/:productId",
  verifyToken,
  isAdmin,
  getBestOfferForProduct
);
router.get(
  "/offers/category/:categoryId",
  verifyToken,
  isAdmin,
  getOffersByCategory
);
router.post("/offers/products", verifyToken, isAdmin, getOffersByProducts);
router.patch("/offers/:id/status", verifyToken, isAdmin, toggleOfferStatus);
router.get("/offers/:id", verifyToken, isAdmin, getOfferById);
router.put("/offers/:id", verifyToken, isAdmin, editOffer);
router.delete("/offers/:id", verifyToken, isAdmin, deleteOffer);

// Referral routes
router.get("/api/referrals", verifyToken, isAdmin, listReferrals);

export default router;
