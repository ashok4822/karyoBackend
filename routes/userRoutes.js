import express from "express";
// import { registerUser, loginUser } from "../controllers/userController.js";
import { getProfile } from "../controllers/profileController.js";
import { verifyToken } from "../middleware/authMiddleware.js";

const router = express.Router();

router.get("/profile", verifyToken, getProfile);

export default router;

// @route   POST /api/users/register
// @desc    Register a new user
// @access  Public
// router.post('/register', registerUser);

// @route   POST /api/users/login
// @desc    Login user
// @access  Public
// router.post('/login', loginUser);
