import Offer from "../models/offerModel.js";
import Product from "../models/productModel.js";
import Category from "../models/categoryModel.js";
import User from "../models/userModel.js";
import Referral from "../models/referralModel.js";
import Coupon from "../models/couponModel.js";
import { statusCodes } from "../constants/statusCodes.js";

// Create a new offer
export const createOffer = async (req, res) => {
  try {
    const {
      name,
      description,
      offerType,
      discountType,
      discountValue,
      products,
      category,
      referralType,
      minimumAmount,
      maximumDiscount,
      validFrom,
      validTo,
      maxUsage,
      maxUsagePerUser,
    } = req.body;

    // Validate offer type specific fields
    if (offerType === "product" && (!products || products.length === 0)) {
      return res.status(statusCodes.BAD_REQUEST).json({
        success: false,
        message: "Products are required for product offers",
      });
    }

    if (offerType === "category" && !category) {
      return res.status(statusCodes.BAD_REQUEST).json({
        success: false,
        message: "Category is required for category offers",
      });
    }

    if (offerType === "referral" && !referralType) {
      return res.status(statusCodes.BAD_REQUEST).json({
        success: false,
        message: "Referral type is required for referral offers",
      });
    }

    // Validate products exist if provided
    if (products && products.length > 0) {
      const existingProducts = await Product.find({
        _id: { $in: products },
        isDeleted: false,
      });
      if (existingProducts.length !== products.length) {
        return res.status(statusCodes.BAD_REQUEST).json({
          success: false,
          message: "Some products do not exist",
        });
      }
    }

    // Validate category exists if provided
    if (category) {
      const existingCategory = await Category.findOne({
        _id: category,
        isDeleted: false,
      });
      if (!existingCategory) {
        return res.status(statusCodes.BAD_REQUEST).json({
          success: false,
          message: "Category does not exist",
        });
      }
    }

    const offer = new Offer({
      name,
      description,
      offerType,
      discountType,
      discountValue,
      products: offerType === "product" ? products : [],
      category: offerType === "category" ? category : null,
      referralType: offerType === "referral" ? referralType : null,
      minimumAmount,
      maximumDiscount,
      validFrom,
      validTo,
      maxUsage,
      maxUsagePerUser,
    });

    await offer.save();

    const populatedOffer = await offer.populate([
      { path: "products", select: "name brand" },
      { path: "category", select: "name" },
    ]);

    res.status(statusCodes.CREATED).json({
      success: true,
      message: "Offer created successfully",
      data: populatedOffer,
    });
  } catch (error) {
    console.error("Error creating offer:", error);
    res.status(statusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: "Failed to create offer",
      error: error.message,
    });
  }
};

// Get all offers with pagination and filters
export const getOffers = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      offerType,
      status,
      search,
      sortBy = "createdAt",
      sortOrder = "desc",
    } = req.query;

    const skip = (page - 1) * limit;
    const query = { isDeleted: false };

    // Apply filters
    if (offerType) query.offerType = offerType;
    if (status) query.status = status;
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: "i" } },
        { description: { $regex: search, $options: "i" } },
      ];
    }

    const sortOptions = {};
    sortOptions[sortBy] = sortOrder === "desc" ? -1 : 1;

    const offers = await Offer.find(query)
      .populate([
        { path: "products", select: "name brand" },
        { path: "category", select: "name" },
      ])
      .sort(sortOptions)
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Offer.countDocuments(query);

    res.status(statusCodes.OK).json({
      success: true,
      data: offers,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limit),
        totalItems: total,
        itemsPerPage: parseInt(limit),
      },
    });
  } catch (error) {
    console.error("Error fetching offers:", error);
    res.status(statusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: "Failed to fetch offers",
      error: error.message,
    });
  }
};

// Get offer by ID
export const getOfferById = async (req, res) => {
  try {
    const { id } = req.params;

    const offer = await Offer.findOne({ _id: id, isDeleted: false }).populate([
      { path: "products", select: "name brand category" },
      { path: "category", select: "name" },
    ]);

    if (!offer) {
      return res.status(statusCodes.NOT_FOUND).json({
        success: false,
        message: "Offer not found",
      });
    }

    res.status(statusCodes.OK).json({
      success: true,
      data: offer,
    });
  } catch (error) {
    console.error("Error fetching offer:", error);
    res.status(statusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: "Failed to fetch offer",
      error: error.message,
    });
  }
};

// Update offer
export const updateOffer = async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    const offer = await Offer.findOne({ _id: id, isDeleted: false });

    if (!offer) {
      return res.status(statusCodes.NOT_FOUND).json({
        success: false,
        message: "Offer not found",
      });
    }

    // Validate products exist if provided
    if (updateData.products && updateData.products.length > 0) {
      const existingProducts = await Product.find({
        _id: { $in: updateData.products },
        isDeleted: false,
      });
      if (existingProducts.length !== updateData.products.length) {
        return res.status(statusCodes.BAD_REQUEST).json({
          success: false,
          message: "Some products do not exist",
        });
      }
    }

    // Validate category exists if provided
    if (updateData.category) {
      const existingCategory = await Category.findOne({
        _id: updateData.category,
        isDeleted: false,
      });
      if (!existingCategory) {
        return res.status(statusCodes.BAD_REQUEST).json({
          success: false,
          message: "Category does not exist",
        });
      }
    }

    Object.assign(offer, updateData);
    await offer.save();

    const updatedOffer = await offer.populate([
      { path: "products", select: "name brand" },
      { path: "category", select: "name" },
    ]);

    res.status(statusCodes.OK).json({
      success: true,
      message: "Offer updated successfully",
      data: updatedOffer,
    });
  } catch (error) {
    console.error("Error updating offer:", error);
    res.status(statusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: "Failed to update offer",
      error: error.message,
    });
  }
};

// Delete offer (soft delete)
export const deleteOffer = async (req, res) => {
  try {
    const { id } = req.params;

    const offer = await Offer.findOne({ _id: id, isDeleted: false });

    if (!offer) {
      return res.status(statusCodes.NOT_FOUND).json({
        success: false,
        message: "Offer not found",
      });
    }

    offer.isDeleted = true;
    await offer.save();

    res.status(statusCodes.OK).json({
      success: true,
      message: "Offer deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting offer:", error);
    res.status(statusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: "Failed to delete offer",
      error: error.message,
    });
  }
};

// Get best offer for a product
export const getBestOfferForProduct = async (req, res) => {
  try {
    const { productId } = req.params;

    const product = await Product.findOne({
      _id: productId,
      isDeleted: false,
    }).populate("category");

    if (!product) {
      return res.status(statusCodes.NOT_FOUND).json({
        success: false,
        message: "Product not found",
      });
    }

    const bestOffer = await Offer.getBestOfferForProduct(
      productId,
      product.category._id
    );

    res.status(statusCodes.OK).json({
      success: true,
      data: bestOffer,
    });
  } catch (error) {
    console.error("Error fetching best offer:", error);
    res.status(statusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: "Failed to fetch best offer",
      error: error.message,
    });
  }
};

// Get offers for a specific category
export const getOffersByCategory = async (req, res) => {
  try {
    const { categoryId } = req.params;
    const { page = 1, limit = 10 } = req.query;

    const skip = (page - 1) * limit;

    const offers = await Offer.find({
      category: categoryId,
      status: "active",
      isDeleted: false,
      validFrom: { $lte: new Date() },
      validTo: { $gte: new Date() },
    })
      .populate("category", "name")
      .sort({ discountValue: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Offer.countDocuments({
      category: categoryId,
      status: "active",
      isDeleted: false,
      validFrom: { $lte: new Date() },
      validTo: { $gte: new Date() },
    });

    res.status(statusCodes.OK).json({
      success: true,
      data: offers,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limit),
        totalItems: total,
        itemsPerPage: parseInt(limit),
      },
    });
  } catch (error) {
    console.error("Error fetching category offers:", error);
    res.status(statusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: "Failed to fetch category offers",
      error: error.message,
    });
  }
};

// Get offers for specific products
export const getOffersByProducts = async (req, res) => {
  try {
    const { productIds } = req.body;

    if (!productIds || !Array.isArray(productIds)) {
      return res.status(statusCodes.BAD_REQUEST).json({
        success: false,
        message: "Product IDs array is required",
      });
    }

    const offers = await Offer.find({
      products: { $in: productIds },
      status: "active",
      isDeleted: false,
      validFrom: { $lte: new Date() },
      validTo: { $gte: new Date() },
    }).populate([
      { path: "products", select: "name brand" },
      { path: "category", select: "name" },
    ]);

    res.status(statusCodes.OK).json({
      success: true,
      data: offers,
    });
  } catch (error) {
    console.error("Error fetching product offers:", error);
    res.status(statusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: "Failed to fetch product offers",
      error: error.message,
    });
  }
};

// Toggle offer status
export const toggleOfferStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!["active", "inactive", "expired"].includes(status)) {
      return res.status(statusCodes.BAD_REQUEST).json({
        success: false,
        message: "Invalid status. Must be active, inactive, or expired",
      });
    }

    const offer = await Offer.findOne({ _id: id, isDeleted: false });

    if (!offer) {
      return res.status(statusCodes.NOT_FOUND).json({
        success: false,
        message: "Offer not found",
      });
    }

    offer.status = status;
    await offer.save();

    res.status(statusCodes.OK).json({
      success: true,
      message: "Offer status updated successfully",
      data: offer,
    });
  } catch (error) {
    console.error("Error toggling offer status:", error);
    res.status(statusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: "Failed to update offer status",
      error: error.message,
    });
  }
};

// Get offer statistics
export const getOfferStats = async (req, res) => {
  try {
    const now = new Date();

    const stats = await Offer.aggregate([
      { $match: { isDeleted: false } },
      {
        $group: {
          _id: "$offerType",
          count: { $sum: 1 },
          activeCount: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $eq: ["$status", "active"] },
                    { $lte: ["$validFrom", now] },
                    { $gte: ["$validTo", now] },
                  ],
                },
                1,
                0,
              ],
            },
          },
          totalUsage: { $sum: "$usageCount" },
        },
      },
    ]);

    const totalOffers = await Offer.countDocuments({ isDeleted: false });
    const activeOffers = await Offer.countDocuments({
      isDeleted: false,
      status: "active",
      validFrom: { $lte: now },
      validTo: { $gte: now },
    });

    res.status(statusCodes.OK).json({
      success: true,
      data: {
        totalOffers,
        activeOffers,
        byType: stats,
      },
    });
  } catch (error) {
    console.error("Error fetching offer stats:", error);
    res.status(statusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: "Failed to fetch offer statistics",
      error: error.message,
    });
  }
}; 
