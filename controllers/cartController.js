import Cart from "../models/cartModel.js";
import ProductVariant from "../models/productVariantModel.js";
import Product from "../models/productModel.js";
import Category from "../models/categoryModel.js";
import WishlistItem from "../models/wishlistModel.js";

// Add item to cart
export const addToCart = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { productVariantId, quantity = 1 } = req.body;

    // Validate input
    if (!productVariantId || quantity < 1 || quantity > 5) {
      return res.status(400).json({ 
        error: "Invalid input. Product variant ID is required and quantity must be between 1 and 5." 
      });
    }

    // Find the product variant
    const variant = await ProductVariant.findById(productVariantId)
      .populate('product')
      .lean();

    if (!variant) {
      return res.status(404).json({ error: "Product variant not found" });
    }

    // Check if product exists
    if (!variant.product) {
      return res.status(404).json({ error: "Product not found" });
    }

    // Check if product is active and not blocked
    if (variant.product.status !== "active" || variant.product.blocked || variant.product.unavailable) {
      return res.status(400).json({ error: "Product is not available for purchase" });
    }

    // Check if category is active
    if (variant.product.category) {
      const category = await Category.findById(variant.product.category).lean();
      if (category && (category.status !== "active" || category.blocked)) {
        return res.status(400).json({ error: "Product category is not available" });
      }
    }

    // Check if variant is active
    if (variant.status !== "active") {
      return res.status(400).json({ error: "Product variant is not available" });
    }

    // Check stock availability
    if (variant.stock < quantity) {
      return res.status(400).json({ 
        error: `Insufficient stock. Only ${variant.stock} items available.` 
      });
    }

    // Find or create user's cart
    let cart = await Cart.findOne({ userId });
    if (!cart) {
      cart = new Cart({ userId, items: [] });
    }

    // Check if item already exists in cart
    const existingItemIndex = cart.items.findIndex(
      item => item.productVariantId.toString() === productVariantId
    );

    if (existingItemIndex !== -1) {
      // Item exists, update quantity
      const newQuantity = cart.items[existingItemIndex].quantity + quantity;
      
      // Check if new quantity exceeds stock
      if (newQuantity > variant.stock) {
        return res.status(400).json({ 
          error: `Cannot add more items. Maximum available: ${variant.stock}` 
        });
      }

      // Check if new quantity exceeds max limit (5)
      if (newQuantity > 5) {
        return res.status(400).json({ 
          error: "Maximum quantity limit is 5 items per variant" 
        });
      }

      cart.items[existingItemIndex].quantity = newQuantity;
    } else {
      // Add new item to cart
      cart.items.push({
        productVariantId,
        quantity,
        price: variant.price
      });
    }

    await cart.save();

    // Remove from wishlist if exists
    try {
      await WishlistItem.deleteOne({
        user: userId,
        product: variant.product._id,
        variant: productVariantId
      });
    } catch (wishlistError) {
      console.log("Error removing from wishlist:", wishlistError);
      // Don't fail the cart operation if wishlist removal fails
    }

    // Populate cart with product details for response
    const populatedCart = await Cart.findById(cart._id)
      .populate({
        path: 'items.productVariantId',
        populate: {
          path: 'product',
          select: 'name status'
        }
      });

    res.status(200).json({
      message: "Item added to cart successfully",
      cart: populatedCart
    });

  } catch (error) {
    console.error("Add to cart error:", error);
    res.status(500).json({ error: "Failed to add item to cart" });
  }
};

// Get user's cart
export const getCart = async (req, res) => {
  try {
    const userId = req.user.userId;
    const cart = await Cart.findOne({ userId })
      .populate({
        path: 'items.productVariantId',
        populate: {
          path: 'product',
          select: 'name status blocked unavailable'
        }
      });

    if (!cart) {
      return res.json({ items: [] });
    }

    res.json(cart);
  } catch (error) {
    console.error("Get cart error:", error);
    res.status(500).json({ error: "Failed to fetch cart" });
  }
};

// Update cart item quantity
export const updateCartItem = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { productVariantId, quantity } = req.body;

    if (!productVariantId || quantity < 0 || quantity > 5) {
      return res.status(400).json({ 
        error: "Invalid input. Quantity must be between 0 and 5." 
      });
    }

    const cart = await Cart.findOne({ userId });
    if (!cart) {
      return res.status(404).json({ error: "Cart not found" });
    }

    if (quantity === 0) {
      // Remove item from cart
      cart.items = cart.items.filter(
        item => item.productVariantId.toString() !== productVariantId
      );
    } else {
      // Update quantity
      const itemIndex = cart.items.findIndex(
        item => item.productVariantId.toString() === productVariantId
      );

      if (itemIndex === -1) {
        return res.status(404).json({ error: "Item not found in cart" });
      }

      // Check stock availability
      const variant = await ProductVariant.findById(productVariantId);
      if (!variant || variant.stock < quantity) {
        return res.status(400).json({ 
          error: `Insufficient stock. Only ${variant?.stock || 0} items available.` 
        });
      }

      cart.items[itemIndex].quantity = quantity;
    }

    await cart.save();

    const updatedCart = await Cart.findById(cart._id)
      .populate({
        path: 'items.productVariantId',
        populate: {
          path: 'product',
          select: 'name status'
        }
      });

    res.json({
      message: "Cart updated successfully",
      cart: updatedCart
    });

  } catch (error) {
    console.error("Update cart error:", error);
    res.status(500).json({ error: "Failed to update cart" });
  }
};

// Remove item from cart
export const removeFromCart = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { productVariantId } = req.body;

    if (!productVariantId) {
      return res.status(400).json({ error: "Product variant ID is required" });
    }

    const cart = await Cart.findOne({ userId });
    if (!cart) {
      return res.status(404).json({ error: "Cart not found" });
    }

    cart.items = cart.items.filter(
      item => item.productVariantId.toString() !== productVariantId
    );

    await cart.save();

    res.json({
      message: "Item removed from cart successfully",
      cart
    });

  } catch (error) {
    console.error("Remove from cart error:", error);
    res.status(500).json({ error: "Failed to remove item from cart" });
  }
};

// Clear cart
export const clearCart = async (req, res) => {
  try {
    // console.log("clearCart called, user:", req.user);
    const userId = req.user.userId;

    // Use findOneAndUpdate for atomic update
    const cart = await Cart.findOneAndUpdate(
      { userId },
      { $set: { items: [] } },
      { new: true }
    );
    // console.log("Cart found and cleared:", cart);

    if (!cart) {
      // console.log("No cart found for user:", userId);
      return res.status(404).json({ error: "Cart not found" });
    }

    res.json({
      message: "Cart cleared successfully",
      cart
    });
  } catch (error) {
    console.error("Clear cart error:", error);
    res.status(500).json({ error: "Failed to clear cart" });
  }
};

// Get available stock for a product (considering cart quantities)
export const getAvailableStock = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { productId } = req.params;

    if (!productId) {
      return res.status(400).json({ error: "Product ID is required" });
    }

    // Get user's cart
    const cart = await Cart.findOne({ userId })
      .populate({
        path: 'items.productVariantId',
        populate: {
          path: 'product',
          select: 'name status blocked unavailable'
        }
      });

    // Get product variants
    const variants = await ProductVariant.find({ product: productId })
      .populate('product', 'name status blocked unavailable');

    // Calculate available stock for each variant
    const availableStock = variants.map(variant => {
      // Find if this variant is in user's cart
      const cartItem = cart?.items.find(item => 
        item.productVariantId._id.toString() === variant._id.toString()
      );
      
      const cartQuantity = cartItem ? cartItem.quantity : 0;
      const availableQuantity = Math.max(0, variant.stock - cartQuantity);

      return {
        variantId: variant._id,
        colour: variant.colour,
        capacity: variant.capacity,
        totalStock: variant.stock,
        cartQuantity: cartQuantity,
        availableStock: availableQuantity,
        price: variant.price,
        status: variant.status
      };
    });

    res.json({
      productId,
      variants: availableStock
    });

  } catch (error) {
    console.error("Get available stock error:", error);
    res.status(500).json({ error: "Failed to get available stock" });
  }
}; 