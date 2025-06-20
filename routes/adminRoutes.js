import express from "express";
import { isAdmin, verifyToken } from "../middleware/authMiddleware.js";
import { getUsers } from "../controllers/userController.js";
import { adminLogin, getUsersPaginated, blockUnblockUser } from "../controllers/adminController.js";

const router = express.Router();

router.post("/login", adminLogin);
router.get("/getUsers", getUsers);
router.get("/users", verifyToken, isAdmin, getUsersPaginated);
router.patch("/users/:id/block", verifyToken, isAdmin, blockUnblockUser);

export default router;
