import express from 'express';
import * as wishlistController from '../controllers/wishlistController.js';
import { verifyToken } from '../middleware/authMiddleware.js';

const router = express.Router();

// Get all wishlist items for the logged-in user
router.get('/', verifyToken, wishlistController.getWishlist);

// Add an item to wishlist
router.post('/add', verifyToken, wishlistController.addToWishlist);

// Remove an item from wishlist
router.post('/remove', verifyToken, wishlistController.removeFromWishlist);

export default router; 