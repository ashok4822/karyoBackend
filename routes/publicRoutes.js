import express from "express";
import { getActiveCategories } from "../controllers/categoryController.js";
import { getPublicVariantOptions, getPublicBrandOptions, getPublicProducts, getPublicProductById } from "../controllers/productController.js";

const router = express.Router();

// Public routes for user-facing components
router.get('/categories', getActiveCategories);
router.get('/products', getPublicProducts);
router.get('/products/variant-options', getPublicVariantOptions);
router.get('/products/brand-options', getPublicBrandOptions);
router.get('/products/:id', getPublicProductById);

export default router;
