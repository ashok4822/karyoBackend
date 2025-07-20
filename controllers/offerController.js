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

    // Restrict to only one active referral offer at a time
    if (offerType === "referral") {
      const existingActiveReferralOffer = await Offer.findOne({
        offerType: "referral",
        status: "active",
        isDeleted: false,
        validFrom: { $lte: new Date(validTo) }, // Overlapping period
        validTo: { $gte: new Date(validFrom) },
      });
      if (existingActiveReferralOffer) {
        return res.status(statusCodes.BAD_REQUEST).json({
          success: false,
          message: "An active referral offer already exists. Please deactivate or delete it before creating a new one.",
        });
      }
    }

    // --- Offer Discount Validation ---
    if (minimumAmount !== undefined && minimumAmount !== null && parseFloat(minimumAmount) > 0 && parseFloat(discountValue) >= parseFloat(minimumAmount)) {
      return res.status(statusCodes.BAD_REQUEST).json({
        success: false,
        message: "Discount value must be less than minimum amount",
      });
    }
    if (discountType === "percentage") {
      if (parseFloat(discountValue) < 0 || parseFloat(discountValue) > 100) {
        return res.status(statusCodes.BAD_REQUEST).json({
          success: false,
          message: "Percentage discount must be between 0 and 100",
        });
      }
      if (maximumDiscount === undefined || maximumDiscount === null || maximumDiscount === "") {
        return res.status(statusCodes.BAD_REQUEST).json({
          success: false,
          message: "Maximum discount is required for percentage offers",
        });
      }
      if (parseFloat(maximumDiscount) <= parseFloat(discountValue)) {
        return res.status(statusCodes.BAD_REQUEST).json({
          success: false,
          message: "Maximum discount must be greater than discount value",
        });
      }
      if (minimumAmount !== undefined && minimumAmount !== null && parseFloat(minimumAmount) > 0 && parseFloat(maximumDiscount) >= parseFloat(minimumAmount)) {
        return res.status(statusCodes.BAD_REQUEST).json({
          success: false,
          message: "Maximum discount must be less than minimum amount",
        });
      }
    }
    if (discountType === "fixed") {
      if (maximumDiscount !== undefined && maximumDiscount !== null && maximumDiscount !== "") {
        if (parseFloat(maximumDiscount) < parseFloat(discountValue)) {
          return res.status(statusCodes.BAD_REQUEST).json({
            success: false,
            message: "Maximum discount cannot be less than discount value for fixed offers",
          });
        }
        if (minimumAmount !== undefined && minimumAmount !== null && parseFloat(minimumAmount) > 0 && parseFloat(maximumDiscount) >= parseFloat(minimumAmount)) {
          return res.status(statusCodes.BAD_REQUEST).json({
            success: false,
            message: "Maximum discount must be less than minimum amount",
          });
        }
      }
    }
    // --- End Offer Discount Validation ---

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

// Function to automatically update expired offers
const updateExpiredOffers = async () => {
  const now = new Date();
  const result = await Offer.updateMany(
    {
      status: { $in: ["active", "inactive"] },
      validTo: { $lt: now },
      isDeleted: false
    },
    { $set: { status: "expired" } }
  );
  if (result.modifiedCount > 0) {
    console.log(`Updated ${result.modifiedCount} expired offers`);
  }
};

// Get all offers with pagination and filters
export const getOffers = async (req, res) => {
  try {
    console.log("getOffers called with query:", req.query);
    console.log("User:", req.user);
    
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

    // Check if this is a public request (no admin authentication)
    const isPublicRequest = !req.user || req.user.role !== 'admin';
    console.log("Is public request:", isPublicRequest);
    
    // Auto-update expired offers for admin requests
    if (!isPublicRequest) {
      await updateExpiredOffers();
    }

    if (isPublicRequest) {
      // For public requests, only show active offers that are currently valid
      const now = new Date();
      query.status = "active";
      query.validFrom = { $lte: now };
      query.validTo = { $gte: now };
      console.log("Public query filters:", query);
    } else {
      // For admin requests, apply status filter if provided
      if (status) query.status = status;
    }

    // Apply filters
    if (offerType) query.offerType = offerType;
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: "i" } },
        { description: { $regex: search, $options: "i" } },
      ];
    }

    const sortOptions = {};
    sortOptions[sortBy] = sortOrder === "desc" ? -1 : 1;

    console.log("Final query:", JSON.stringify(query, null, 2));

    const offers = await Offer.find(query)
      .populate([
        { path: "products", select: "name brand" },
        { path: "category", select: "name" },
      ])
      .sort(sortOptions)
      .skip(skip)
      .limit(parseInt(limit));

    console.log("Found offers:", offers.length);

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

    console.log("Update offer request received");
    console.log("ID:", id);
    console.log("Update data:", JSON.stringify(updateData, null, 2));
    console.log("Request headers:", req.headers);

    const offer = await Offer.findOne({ _id: id, isDeleted: false });

    if (!offer) {
      return res.status(statusCodes.NOT_FOUND).json({
        success: false,
        message: "Offer not found",
      });
    }

    console.log("Found offer:", offer);

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

    console.log("About to update offer with data:", updateData);
    Object.assign(offer, updateData);
    console.log("Offer after Object.assign:", offer);

    // If the offer was expired but now has a future validTo, reset status
    const now = new Date();
    if (offer.validTo > now && offer.status === "expired") {
      offer.status = "active";
      console.log('DEBUG: Offer status forcibly set to active.');
    }
    
    await offer.save();
    console.log("Offer saved successfully");

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
