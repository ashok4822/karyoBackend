import Discount from "../models/discountModel.js";
import User from "../models/userModel.js";
import UserDiscountUsage from "../models/userDiscountUsageModel.js";

// List discounts with search, pagination, sort, and filter by status
export const listDiscounts = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const search = req.query.search || "";
    const status = req.query.status; // 'active', 'inactive', 'expired', or 'all'
    const sortBy = req.query.sortBy || "createdAt";
    const sortOrder = req.query.sortOrder === "asc" ? 1 : -1;

    const query = {
      isDeleted: false,
    };

    // Add search filter
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: "i" } },
        { description: { $regex: search, $options: "i" } },
      ];
    }

    // Filter by status
    if (status && status !== "all") {
      if (status === "expired") {
        query.$and = [
          { validTo: { $lt: new Date() } },
          { status: { $in: ["active", "inactive"] } },
        ];
      } else {
        query.status = status;
      }
    }

    const total = await Discount.countDocuments(query);
    const discounts = await Discount.find(query)
      .sort({ [sortBy]: sortOrder })
      .skip((page - 1) * limit)
      .limit(limit);

    // Add virtual fields for frontend
    const discountsWithVirtuals = discounts.map((discount) => {
      const discountObj = discount.toObject();
      discountObj.isValid = discount.isValid;
      return discountObj;
    });

    res.json({
      discounts: discountsWithVirtuals,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error) {
    console.error("Error listing discounts:", error);
    res
      .status(500)
      .json({ message: `Internal Server Error: ${error.message}` });
  }
};

// Add new discount
export const addDiscount = async (req, res) => {
  try {
    console.log("[addDiscount] Incoming request body:", req.body); // Log incoming data
    const {
      name,
      description,
      discountType,
      discountValue,
      minimumAmount,
      maximumDiscount,
      validFrom,
      validTo,
      status,
      maxUsage,
      maxUsagePerUser,
      code, // log code as well
    } = req.body;

    // Validation
    if (!name) {
      return res.status(400).json({ message: "Discount name is required" });
    }

    if (!discountType || !["percentage", "fixed"].includes(discountType)) {
      return res.status(400).json({
        message: "Discount type must be 'percentage' or 'fixed'",
      });
    }

    if (!discountValue || discountValue <= 0) {
      return res.status(400).json({
        message: "Discount value must be greater than 0",
      });
    }

    if (discountType === "percentage" && discountValue > 100) {
      return res.status(400).json({
        message: "Percentage discount cannot exceed 100%",
      });
    }

    if (!validFrom || !validTo) {
      return res.status(400).json({
        message: "Valid from and valid to dates are required",
      });
    }

    if (new Date(validFrom) >= new Date(validTo)) {
      return res.status(400).json({
        message: "Valid to date must be after valid from date",
      });
    }

    if (maximumDiscount !== undefined && maximumDiscount !== null && maximumDiscount !== "") {
      const maxDisc = parseFloat(maximumDiscount);
      const minAmt = minimumAmount ? parseFloat(minimumAmount) : 0;
      const discVal = parseFloat(discountValue);
      if (maxDisc > minAmt) {
        return res.status(400).json({
          message: "Maximum discount cannot be greater than minimum amount."
        });
      }
      if (maxDisc <= discVal) {
        return res.status(400).json({
          message: "Maximum discount must be greater than discount value."
        });
      }
    }

    // Check if discount name already exists (excluding deleted ones)
    const existingDiscount = await Discount.findOne({
      name: { $regex: `^${name}$`, $options: "i" },
      isDeleted: false,
    });

    if (existingDiscount) {
      return res.status(400).json({
        message: "Discount with this name already exists",
      });
    }

    // Check if coupon code already exists (excluding deleted ones)
    const existingCode = await Discount.findOne({
      code: req.body.code?.trim().toUpperCase(),
      isDeleted: false,
    });
    if (existingCode) {
      return res.status(400).json({
        message: "Coupon code already exists. Please use a unique code.",
      });
    }

    // Create new discount
    const discount = new Discount({
      code: code.trim().toUpperCase(), // <-- Ensure code is saved and uppercased
      name,
      description,
      discountType,
      discountValue: parseFloat(discountValue),
      minimumAmount: minimumAmount ? parseFloat(minimumAmount) : 0,
      maximumDiscount: maximumDiscount ? parseFloat(maximumDiscount) : null,
      validFrom: new Date(validFrom),
      validTo: new Date(validTo),
      status: status || "active",
      maxUsage: maxUsage ? parseInt(maxUsage) : null,
      maxUsagePerUser: maxUsagePerUser ? parseInt(maxUsagePerUser) : null,
    });

    await discount.save();

    // Return discount with virtual fields
    const discountWithVirtuals = discount.toObject();
    discountWithVirtuals.isValid = discount.isValid;

    res.status(201).json({
      message: "Discount created successfully",
      discount: discountWithVirtuals,
    });
  } catch (error) {
    console.error("[addDiscount] Error adding discount:", error);
    if (error.stack) {
      console.error("[addDiscount] Stack trace:", error.stack);
    }
    res
      .status(500)
      .json({ message: `Internal Server Error: ${error.message}` });
  }
};

// Get discount by ID
export const getDiscountById = async (req, res) => {
  try {
    const { id } = req.params;
    const discount = await Discount.findOne({ _id: id, isDeleted: false });

    if (!discount) {
      return res.status(404).json({ message: "Discount not found" });
    }

    // Return discount with virtual fields
    const discountWithVirtuals = discount.toObject();
    discountWithVirtuals.isValid = discount.isValid;

    res.json({ discount: discountWithVirtuals });
  } catch (error) {
    console.error("Error getting discount:", error);
    res
      .status(500)
      .json({ message: `Internal Server Error: ${error.message}` });
  }
};

// Edit discount
export const editDiscount = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      name,
      description,
      discountType,
      discountValue,
      minimumAmount,
      maximumDiscount,
      validFrom,
      validTo,
      status,
      maxUsage,
      maxUsagePerUser,
    } = req.body;

    const discount = await Discount.findOne({ _id: id, isDeleted: false });
    if (!discount) {
      return res.status(404).json({ message: "Discount not found" });
    }

    // Validation
    if (discountType && !["percentage", "fixed"].includes(discountType)) {
      return res.status(400).json({
        message: "Discount type must be 'percentage' or 'fixed'",
      });
    }

    if (discountValue !== undefined && discountValue <= 0) {
      return res.status(400).json({
        message: "Discount value must be greater than 0",
      });
    }

    if (discountType === "percentage" && discountValue > 100) {
      return res.status(400).json({
        message: "Percentage discount cannot exceed 100%",
      });
    }

    if (validFrom && validTo && new Date(validFrom) >= new Date(validTo)) {
      return res.status(400).json({
        message: "Valid to date must be after valid from date",
      });
    }

    // Check if name already exists (excluding current discount and deleted ones)
    if (name && name !== discount.name) {
      const existingDiscount = await Discount.findOne({
        name: { $regex: `^${name}$`, $options: "i" },
        _id: { $ne: id },
        isDeleted: false,
      });

      if (existingDiscount) {
        return res.status(400).json({
          message: "Discount with this name already exists",
        });
      }
    }

    if (req.body.code && req.body.code.trim().toUpperCase() !== discount.code) {
      const existingCode = await Discount.findOne({
        code: req.body.code.trim().toUpperCase(),
        _id: { $ne: id },
        isDeleted: false,
      });
      if (existingCode) {
        return res.status(400).json({
          message: "Coupon code already exists. Please use a unique code.",
        });
      }
    }

    // Update fields
    if (name !== undefined) discount.name = name;
    if (description !== undefined) discount.description = description;
    if (discountType !== undefined) discount.discountType = discountType;
    if (discountValue !== undefined)
      discount.discountValue = parseFloat(discountValue);
    if (minimumAmount !== undefined)
      discount.minimumAmount = parseFloat(minimumAmount);
    if (maximumDiscount !== undefined)
      discount.maximumDiscount = maximumDiscount
        ? parseFloat(maximumDiscount)
        : null;
    if (validFrom !== undefined) discount.validFrom = new Date(validFrom);
    if (validTo !== undefined) discount.validTo = new Date(validTo);
    if (status !== undefined) discount.status = status;
    if (maxUsage !== undefined)
      discount.maxUsage = maxUsage ? parseInt(maxUsage) : null;
    if (maxUsagePerUser !== undefined)
      discount.maxUsagePerUser = maxUsagePerUser
        ? parseInt(maxUsagePerUser)
        : null;

    await discount.save();

    // Return discount with virtual fields
    const discountWithVirtuals = discount.toObject();
    discountWithVirtuals.isValid = discount.isValid;

    res.json({
      message: "Discount updated successfully",
      discount: discountWithVirtuals,
    });
  } catch (error) {
    console.error("Error editing discount:", error);
    res
      .status(500)
      .json({ message: `Internal Server Error: ${error.message}` });
  }
};

// Delete discount (soft delete)
export const deleteDiscount = async (req, res) => {
  try {
    const { id } = req.params;
    const discount = await Discount.findOne({ _id: id, isDeleted: false });

    if (!discount) {
      return res.status(404).json({ message: "Discount not found" });
    }

    discount.isDeleted = true;
    await discount.save();

    res.json({ message: "Discount deleted successfully" });
  } catch (error) {
    console.error("Error deleting discount:", error);
    res
      .status(500)
      .json({ message: `Internal Server Error: ${error.message}` });
  }
};

// Restore deleted discount
export const restoreDiscount = async (req, res) => {
  try {
    const { id } = req.params;
    const discount = await Discount.findOne({ _id: id, isDeleted: true });

    if (!discount) {
      return res.status(404).json({ message: "Deleted discount not found" });
    }

    discount.isDeleted = false;
    await discount.save();

    // Return discount with virtual fields
    const discountWithVirtuals = discount.toObject();
    discountWithVirtuals.isValid = discount.isValid;

    res.json({
      message: "Discount restored successfully",
      discount: discountWithVirtuals,
    });
  } catch (error) {
    console.error("Error restoring discount:", error);
    res
      .status(500)
      .json({ message: `Internal Server Error: ${error.message}` });
  }
};

// Get all active and valid discounts for user-facing components
export const getActiveDiscounts = async (req, res) => {
  try {
    const now = new Date();
    const discounts = await Discount.find({
      status: "active",
      validFrom: { $lte: now },
      validTo: { $gte: now },
      isDeleted: false,
    }).sort({ createdAt: -1 });

    // Return discounts with virtual fields
    const discountsWithVirtuals = discounts.map((discount) => {
      const discountObj = discount.toObject();
      discountObj.isValid = discount.isValid;
      return discountObj;
    });

    res.json({ discounts: discountsWithVirtuals });
  } catch (error) {
    console.error("Error getting active discounts:", error);
    res
      .status(500)
      .json({ message: `Internal Server Error: ${error.message}` });
  }
};

// Get user-eligible discounts (checks all eligibility criteria)
export const getUserEligibleDiscounts = async (req, res) => {
  try {
    const userId = req.user.userId;
    // console.log("--------backend user in discount: ", userId);
    const now = new Date();

    // Get all active and valid discounts
    const discounts = await Discount.find({
      status: "active",
      validFrom: { $lte: now },
      validTo: { $gte: now },
      isDeleted: false,
    }).sort({ createdAt: -1 });

    // Get user's discount usage for all discounts
    const userUsages = await UserDiscountUsage.find({ user: userId });
    const userUsageMap = new Map();
    userUsages.forEach((usage) => {
      userUsageMap.set(usage.discount.toString(), usage);
    });

    // Filter discounts based on eligibility criteria
    const eligibleDiscounts = [];

    for (const discount of discounts) {
      // Check global usage limit
      if (discount.maxUsage && discount.usageCount >= discount.maxUsage) {
        continue; // Skip if global limit reached
      }

      // Check user-specific usage limit
      const userUsage = userUsageMap.get(discount._id.toString());
      if (
        discount.maxUsagePerUser &&
        userUsage &&
        userUsage.usageCount >= discount.maxUsagePerUser
      ) {
        continue; // Skip if user limit reached
      }

      // Add discount with eligibility info
      const discountObj = discount.toObject();
      discountObj.isValid = discount.isValid;
      discountObj.userUsageCount = userUsage ? userUsage.usageCount : 0;
      discountObj.canUse = true;

      eligibleDiscounts.push(discountObj);
    }

    res.json({ discounts: eligibleDiscounts });
  } catch (error) {
    console.error("Error getting user eligible discounts:", error);
    res
      .status(500)
      .json({ message: `Internal Server Error: ${error.message}` });
  }
};

// Update discount usage count
export const updateDiscountUsage = async (req, res) => {
  try {
    const { id } = req.params;
    const discount = await Discount.findOne({ _id: id, isDeleted: false });

    if (!discount) {
      return res.status(404).json({ message: "Discount not found" });
    }

    // Check if discount can still be used
    if (discount.maxUsage && discount.usageCount >= discount.maxUsage) {
      return res.status(400).json({ message: "Discount usage limit reached" });
    }

    discount.usageCount += 1;
    await discount.save();

    res.json({
      message: "Discount usage updated",
      usageCount: discount.usageCount,
    });
  } catch (error) {
    console.error("Error updating discount usage:", error);
    res
      .status(500)
      .json({ message: `Internal Server Error: ${error.message}` });
  }
};

// Get user discount usage statistics
export const getUserDiscountUsage = async (req, res) => {
  try {
    const { discountId } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const search = req.query.search || "";

    // Verify discount exists
    const discount = await Discount.findById(discountId);
    if (!discount) {
      return res.status(404).json({ message: "Discount not found" });
    }

    const query = { discount: discountId };

    // Add search filter for user details
    if (search) {
      const users = await User.find({
        $or: [
          { firstName: { $regex: search, $options: "i" } },
          { lastName: { $regex: search, $options: "i" } },
          { email: { $regex: search, $options: "i" } },
        ],
      }).select("_id");

      const userIds = users.map((user) => user._id);
      query.user = { $in: userIds };
    }

    const total = await UserDiscountUsage.countDocuments(query);
    const userUsages = await UserDiscountUsage.find(query)
      .populate({
        path: "user",
        select: "firstName lastName email phone",
      })
      .sort({ usageCount: -1, lastUsedAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit);

    res.json({
      discount: {
        _id: discount._id,
        name: discount.name,
        maxUsagePerUser: discount.maxUsagePerUser,
      },
      userUsages,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error) {
    console.error("Error getting user discount usage:", error);
    res
      .status(500)
      .json({ message: `Internal Server Error: ${error.message}` });
  }
};

// Get all discount usage statistics
export const getAllDiscountUsageStats = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const search = req.query.search || "";

    const query = {};

    // Add search filter for discount names
    if (search) {
      const discounts = await Discount.find({
        name: { $regex: search, $options: "i" },
        isDeleted: false,
      }).select("_id");

      const discountIds = discounts.map((discount) => discount._id);
      query.discount = { $in: discountIds };
    }

    const total = await UserDiscountUsage.countDocuments(query);
    const usageStats = await UserDiscountUsage.find(query)
      .populate({
        path: "discount",
        select: "name maxUsagePerUser",
      })
      .populate({
        path: "user",
        select: "firstName lastName email",
      })
      .sort({ updatedAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit);

    // Group by discount for summary
    const discountSummary = await UserDiscountUsage.aggregate([
      {
        $group: {
          _id: "$discount",
          totalUsers: { $sum: 1 },
          totalUsage: { $sum: "$usageCount" },
          avgUsagePerUser: { $avg: "$usageCount" },
        },
      },
      {
        $lookup: {
          from: "discounts",
          localField: "_id",
          foreignField: "_id",
          as: "discountInfo",
        },
      },
      {
        $unwind: "$discountInfo",
      },
      {
        $project: {
          discountName: "$discountInfo.name",
          maxUsagePerUser: "$discountInfo.maxUsagePerUser", // <-- add this line
          totalUsers: 1,
          totalUsage: 1,
          avgUsagePerUser: { $round: ["$avgUsagePerUser", 2] },
        },
      },
    ]);

    res.json({
      usageStats,
      discountSummary,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error) {
    console.error("Error getting all discount usage stats:", error);
    res
      .status(500)
      .json({ message: `Internal Server Error: ${error.message}` });
  }
};

// Validate coupon code for checkout
export const validateCouponCode = async (req, res) => {
  try {
    const { code, orderAmount } = req.body;
    const userId = req.user.userId;
    if (!code) {
      return res.status(400).json({ message: "Coupon code is required" });
    }
    const now = new Date();
    
    // First check in Discount model
    let discount = await Discount.findOne({
      code: code.trim().toUpperCase(),
      status: "active",
      validFrom: { $lte: now },
      validTo: { $gte: now },
      isDeleted: false,
    });
    
    // If not found in Discount model, check in Coupon model
    if (!discount) {
      const Coupon = (await import("../models/couponModel.js")).default;
      const coupon = await Coupon.findOne({
        code: code.trim().toUpperCase(),
        status: "active",
        validFrom: { $lte: now },
        validTo: { $gte: now },
        isDeleted: false,
      });
      
      if (coupon) {
        // Convert coupon to discount format for consistency
        discount = {
          _id: coupon._id,
          name: coupon.description || coupon.code,
          code: coupon.code,
          description: coupon.description,
          discountType: coupon.discountType,
          discountValue: coupon.discountValue,
          minimumAmount: coupon.minimumAmount,
          maximumDiscount: coupon.maximumDiscount,
          validFrom: coupon.validFrom,
          validTo: coupon.validTo,
          status: coupon.status,
          usageCount: coupon.usageCount,
          maxUsage: coupon.maxUsage,
          maxUsagePerUser: coupon.maxUsagePerUser,
          isDeleted: coupon.isDeleted,
          createdAt: coupon.createdAt,
          updatedAt: coupon.updatedAt,
        };
      }
    }
    
    if (!discount) {
      return res.status(404).json({ message: "Invalid or expired coupon code" });
    }
    
    // Check minimum order amount
    if (discount.minimumAmount > 0 && orderAmount < discount.minimumAmount) {
      return res.status(400).json({ message: `Minimum order amount of ₹${discount.minimumAmount} required for this coupon` });
    }
    
    // Check global usage limit
    if (discount.maxUsage && discount.usageCount >= discount.maxUsage) {
      return res.status(400).json({ message: "Coupon usage limit reached" });
    }
    
    // Check per-user usage limit
    const userUsage = await UserDiscountUsage.findOne({ user: userId, discount: discount._id });
    if (discount.maxUsagePerUser && userUsage && userUsage.usageCount >= discount.maxUsagePerUser) {
      return res.status(400).json({ message: "You have reached your personal usage limit for this coupon" });
    }
    
    // All checks passed, return discount details
    res.json({ discount });
  } catch (error) {
    console.error("Error validating coupon code:", error);
    res.status(500).json({ message: `Internal Server Error: ${error.message}` });
  }
};
