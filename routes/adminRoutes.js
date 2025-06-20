import express from "express";
import { isAdmin, verifyToken } from "../middleware/authMiddleware.js";
import { getUsers } from "../controllers/userController.js";
import {
  adminLogin,
  getUsersPaginated,
  blockUnblockUser,
} from "../controllers/adminController.js";
import { adminLogout } from "../controllers/profileController.js";
import { listCategories, addCategory, editCategory, deleteCategory } from "../controllers/categoryController.js";
import multer from 'multer';
import { addProduct, listProducts, getProductById, editProduct, deleteProduct } from '../controllers/productController.js';
import { verifyAdmin } from '../middleware/authMiddleware.js';

const router = express.Router();

const upload = multer({ dest: 'uploads/' });

router.post("/login", adminLogin);
router.get("/getUsers", getUsers);
router.get("/users", getUsersPaginated); //verifyToken, isAdmin,
router.patch("/users/:id/block", verifyToken, isAdmin, blockUnblockUser);
router.post("/logout", adminLogout);
router.get("/categories", verifyToken, isAdmin, listCategories);
router.post("/categories", verifyToken, isAdmin, addCategory);
router.put("/categories/:id", verifyToken, isAdmin, editCategory);
router.delete("/categories/:id", verifyToken, isAdmin, deleteCategory);
router.post('/products', verifyAdmin, upload.array('images', 10), addProduct);
router.get('/products', verifyAdmin, listProducts);
router.get('/products/:id', verifyAdmin, getProductById);
router.put('/products/:id', verifyAdmin, upload.array('images', 10), editProduct);
router.delete('/products/:id', verifyAdmin, deleteProduct);

export default router;
