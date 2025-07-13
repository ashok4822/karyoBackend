import express from "express";
import { isAdmin, verifyToken } from "../middleware/authMiddleware.js";
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
import multer from "multer";
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
import { verifyAdmin } from "../middleware/authMiddleware.js";
import fs from "fs";
import path from "path";
import { getDashboard } from "../controllers/adminDashboard.js";
import { getAllOrders, getOrderByIdForAdmin, updateOrderStatus, updatePaymentStatus, deleteOrder, verifyReturnRequest, rejectReturnRequest, verifyReturnWithoutRefund, updateOrderItemStatus } from "../controllers/orderController.js";
import { listCoupons, addCoupon, editCoupon, deleteCoupon, restoreCoupon, triggerExpiredCouponUpdate } from "../controllers/couponController.js";
import { 
  getOffers as listOffers, 
  createOffer as addOffer, 
  getOfferById, 
  updateOffer as editOffer, 
  deleteOffer, 
  toggleOfferStatus,
  getBestOfferForProduct,
  getOffersByCategory,
  getOffersByProducts
} from "../controllers/offerController.js";
import { 
  getAllReferrals as listReferrals 
} from "../controllers/referralController.js";

const router = express.Router();

// Ensure uploads directory exists
const uploadsDir = path.join(process.cwd(), "uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Configure multer with error handling for multiple field types
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadsDir);
  },
  filename: function (req, file, cb) {
    // Generate unique filename
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(
      null,
      file.fieldname + "-" + uniqueSuffix + path.extname(file.originalname)
    );
  },
});

const fileFilter = (req, file, cb) => {
  // Accept only image files
  if (file.mimetype.startsWith("image/")) {
    cb(null, true);
  } else {
    cb(new Error("Only image files are allowed!"), false);
  }
};

const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
    files: 50, // Increased limit for multiple variants
  },
});

// Custom multer configuration for products with variants
const uploadProduct = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
    files: 50, // Increased limit for multiple variants
  },
}).fields([
  { name: "images", maxCount: 10 }, // Product-level images
  { name: "variantImages_0", maxCount: 10 }, // Variant 0 images
  { name: "variantImages_1", maxCount: 10 }, // Variant 1 images
  { name: "variantImages_2", maxCount: 10 }, // Variant 2 images
  { name: "variantImages_3", maxCount: 10 }, // Variant 3 images
  { name: "variantImages_4", maxCount: 10 }, // Variant 4 images
  { name: "variantImages_5", maxCount: 10 }, // Variant 5 images
  { name: "variantImages_6", maxCount: 10 }, // Variant 6 images
  { name: "variantImages_7", maxCount: 10 }, // Variant 7 images
  { name: "variantImages_8", maxCount: 10 }, // Variant 8 images
  { name: "variantImages_9", maxCount: 10 }, // Variant 9 images
]);

// Error handling middleware for multer
const handleMulterError = (error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === "LIMIT_FILE_SIZE") {
      return res
        .status(400)
        .json({ message: "File too large. Maximum size is 5MB." });
    }
    if (error.code === "LIMIT_FILE_COUNT") {
      return res
        .status(400)
        .json({ message: "Too many files. Maximum is 50 files." });
    }
    if (error.code === "LIMIT_UNEXPECTED_FILE") {
      return res.status(400).json({ message: "Unexpected file field." });
    }
    return res.status(400).json({ message: `Upload error: ${error.message}` });
  }

  if (error) {
    return res.status(400).json({ message: error.message });
  }

  next();
};

router.post("/login", adminLogin);
router.get("/getUsers", verifyAdmin, getUsers);
router.get("/dashboard", verifyAdmin, getDashboard);
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
router.get("/discounts/usage-stats", verifyToken, isAdmin, getAllDiscountUsageStats);
router.get("/discounts/:id", verifyToken, isAdmin, getDiscountById);
router.put("/discounts/:id", verifyToken, isAdmin, editDiscount);
router.delete("/discounts/:id", verifyToken, isAdmin, deleteDiscount);
router.patch("/discounts/:id/restore", verifyToken, isAdmin, restoreDiscount);
router.patch("/discounts/:id/usage", verifyAdmin, updateDiscountUsage);
router.get("/discounts/:discountId/user-usage", verifyToken, isAdmin, getUserDiscountUsage);

router.get("/orders", verifyToken, isAdmin, getAllOrders);
router.get("/orders/:id", verifyToken, isAdmin, getOrderByIdForAdmin);
router.put("/orders/:id/status", verifyToken, isAdmin, updateOrderStatus);
router.put("/orders/:id/payment-status", verifyToken, isAdmin, updatePaymentStatus);
router.delete("/orders/:id", verifyToken, isAdmin, deleteOrder);
router.put("/orders/:id/verify-return", verifyToken, isAdmin, verifyReturnRequest);
router.put("/orders/:id/verify-return-no-refund", verifyToken, isAdmin, verifyReturnWithoutRefund);
router.put("/orders/:id/reject-return", verifyToken, isAdmin, rejectReturnRequest);
// Per-item status update
router.put("/orders/:orderId/items/:itemId/status", verifyToken, isAdmin, updateOrderItemStatus);

// Coupon routes
router.get("/coupons", verifyToken, isAdmin, listCoupons);
router.post("/coupons", verifyToken, isAdmin, addCoupon);
router.put("/coupons/:id", verifyToken, isAdmin, editCoupon);
router.delete("/coupons/:id", verifyToken, isAdmin, deleteCoupon);
router.patch("/coupons/:id/restore", verifyToken, isAdmin, restoreCoupon);
router.post("/coupons/update-expired", verifyToken, isAdmin, triggerExpiredCouponUpdate);

// Test route
router.get("/test", (req, res) => {
  res.json({ message: "Admin routes are working" });
});

// Offer routes
router.get("/offers", verifyToken, isAdmin, listOffers);
router.post("/offers", verifyToken, isAdmin, addOffer);
router.get("/offers/product/:productId", verifyToken, isAdmin, getBestOfferForProduct);
router.get("/offers/category/:categoryId", verifyToken, isAdmin, getOffersByCategory);
router.post("/offers/products", verifyToken, isAdmin, getOffersByProducts);
router.patch("/offers/:id/status", verifyToken, isAdmin, toggleOfferStatus);
router.get("/offers/:id", verifyToken, isAdmin, getOfferById);
router.put("/offers/:id", verifyToken, isAdmin, editOffer);
router.delete("/offers/:id", verifyToken, isAdmin, deleteOffer);

// Referral routes
router.get("/api/referrals", verifyToken, isAdmin, listReferrals);

export default router;
