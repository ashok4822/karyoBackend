import express from "express";
import multer from "multer";
import path from "path";
// import { registerUser, loginUser } from "../controllers/userController.js";
import { getProfile, updateProfile, uploadProfileImage, createShippingAddress, getShippingAddresses, setDefaultShippingAddress } from "../controllers/profileController.js";
import { verifyToken } from "../middleware/authMiddleware.js";

const router = express.Router();

// Multer setup for local temp storage
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, "uploads/");
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + path.extname(file.originalname));
  },
});
const upload = multer({ storage });

router.get("/profile", verifyToken, getProfile);
router.put("/profile", verifyToken, updateProfile);
router.put("/profile-image", verifyToken, upload.single("image"), uploadProfileImage);
router.post("/shipping-address", verifyToken, createShippingAddress);
router.get("/shipping-addresses", verifyToken, getShippingAddresses);
router.put("/shipping-address/:id/default", verifyToken, setDefaultShippingAddress);

export default router;

// @route   POST /api/users/register
// @desc    Register a new user
// @access  Public
// router.post('/register', registerUser);

// @route   POST /api/users/login
// @desc    Login user
// @access  Public
// router.post('/login', loginUser);
