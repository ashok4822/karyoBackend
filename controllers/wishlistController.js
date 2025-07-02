import WishlistItem from "../models/wishlistModel.js";
import ProductVariant from "../models/productVariantModel.js";

// Get all wishlist items for a user
export const getWishlist = async (req, res) => {
  try {
    const userId = req.user.userId;
    const items = await WishlistItem.find({ user: userId })
      .populate("product")
      .lean();

    // For each item, find the variant and attach the first image
    const itemsWithImage = await Promise.all(
      items.map(async (item) => {
        let image = null;
        let variantPrice = null;
        let variantName = null;
        
        if (item.product && item.variant) {
          const variant = await ProductVariant.findOne({
            product: item.product._id,
            _id: item.variant,
          }).lean();
          
          if (variant) {
            if (variant.imageUrls && variant.imageUrls.length > 0) {
              image = variant.imageUrls[0];
            }
            variantPrice = variant.price;
            variantName = `${variant.colour} - ${variant.capacity}`;
          }
        }
        
        return { 
          ...item, 
          image,
          variantPrice,
          variantName
        };
      })
    );

    res.json(itemsWithImage);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch wishlist" });
  }
};

// Add an item to wishlist
export const addToWishlist = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { product, variant } = req.body;
    // Prevent duplicates
    const exists = await WishlistItem.findOne({
      user: userId,
      product,
      variant,
    });
    if (exists) return res.status(200).json(exists);
    const item = await WishlistItem.create({ user: userId, product, variant });
    res.status(201).json(item);
  } catch (err) {
    console.error("Wishlist add error:", err);
    res.status(500).json({ error: "Failed to add to wishlist" });
  }
};

// Remove an item from wishlist
export const removeFromWishlist = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { product, variant } = req.body;
    await WishlistItem.deleteOne({ user: userId, product, variant });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to remove from wishlist" });
  }
};
