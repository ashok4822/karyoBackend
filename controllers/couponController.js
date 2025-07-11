import Coupon from "../models/couponModel.js";

// List coupons with search, pagination, sort, and filter by status
export const listCoupons = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const search = req.query.search || "";
    const status = req.query.status; // 'active', 'inactive', 'expired', or 'all'
    const sortBy = req.query.sortBy || "createdAt";
    const sortOrder = req.query.sortOrder === "asc" ? 1 : -1;

    const query = { isDeleted: false };
    if (search) {
      query.$or = [
        { code: { $regex: search, $options: "i" } },
        { description: { $regex: search, $options: "i" } },
      ];
    }
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

    const total = await Coupon.countDocuments(query);
    const coupons = await Coupon.find(query)
      .sort({ [sortBy]: sortOrder })
      .skip((page - 1) * limit)
      .limit(limit);

    res.json({
      coupons,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error) {
    res.status(500).json({ message: `Internal Server Error: ${error.message}` });
  }
};

// Add new coupon
export const addCoupon = async (req, res) => {
  try {
    const {
      code,
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

    if (!code) return res.status(400).json({ message: "Coupon code is required" });
    if (!discountType || !["percentage", "fixed"].includes(discountType)) {
      return res.status(400).json({ message: "Discount type must be 'percentage' or 'fixed'" });
    }
    if (!discountValue || discountValue <= 0) {
      return res.status(400).json({ message: "Discount value must be greater than 0" });
    }
    if (discountType === "percentage" && discountValue > 100) {
      return res.status(400).json({ message: "Percentage discount cannot exceed 100%" });
    }
    if (!validFrom || !validTo) {
      return res.status(400).json({ message: "Valid from and valid to dates are required" });
    }
    if (new Date(validFrom) >= new Date(validTo)) {
      return res.status(400).json({ message: "Valid to date must be after valid from date" });
    }
    // Check for duplicate code
    const existing = await Coupon.findOne({ code: code.trim().toUpperCase(), isDeleted: false });
    if (existing) {
      return res.status(400).json({ message: "Coupon code already exists. Please use a unique code." });
    }
    const coupon = new Coupon({
      code: code.trim().toUpperCase(),
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
    await coupon.save();
    res.status(201).json({ message: "Coupon created successfully", coupon });
  } catch (error) {
    res.status(500).json({ message: `Internal Server Error: ${error.message}` });
  }
};

// Edit coupon
export const editCoupon = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      code,
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
    const coupon = await Coupon.findOne({ _id: id, isDeleted: false });
    if (!coupon) return res.status(404).json({ message: "Coupon not found" });
    if (code && code.trim().toUpperCase() !== coupon.code) {
      const existing = await Coupon.findOne({ code: code.trim().toUpperCase(), _id: { $ne: id }, isDeleted: false });
      if (existing) {
        return res.status(400).json({ message: "Coupon code already exists. Please use a unique code." });
      }
    }
    if (discountType && !["percentage", "fixed"].includes(discountType)) {
      return res.status(400).json({ message: "Discount type must be 'percentage' or 'fixed'" });
    }
    if (discountValue !== undefined && discountValue <= 0) {
      return res.status(400).json({ message: "Discount value must be greater than 0" });
    }
    if (discountType === "percentage" && discountValue > 100) {
      return res.status(400).json({ message: "Percentage discount cannot exceed 100%" });
    }
    if (validFrom && validTo && new Date(validFrom) >= new Date(validTo)) {
      return res.status(400).json({ message: "Valid to date must be after valid from date" });
    }
    // Update fields
    if (code !== undefined) coupon.code = code.trim().toUpperCase();
    if (description !== undefined) coupon.description = description;
    if (discountType !== undefined) coupon.discountType = discountType;
    if (discountValue !== undefined) coupon.discountValue = parseFloat(discountValue);
    if (minimumAmount !== undefined) coupon.minimumAmount = parseFloat(minimumAmount);
    if (maximumDiscount !== undefined) coupon.maximumDiscount = maximumDiscount ? parseFloat(maximumDiscount) : null;
    if (validFrom !== undefined) coupon.validFrom = new Date(validFrom);
    if (validTo !== undefined) coupon.validTo = new Date(validTo);
    if (status !== undefined) coupon.status = status;
    if (maxUsage !== undefined) coupon.maxUsage = maxUsage ? parseInt(maxUsage) : null;
    if (maxUsagePerUser !== undefined) coupon.maxUsagePerUser = maxUsagePerUser ? parseInt(maxUsagePerUser) : null;
    await coupon.save();
    res.json({ message: "Coupon updated successfully", coupon });
  } catch (error) {
    res.status(500).json({ message: `Internal Server Error: ${error.message}` });
  }
};

// Delete coupon (soft delete)
export const deleteCoupon = async (req, res) => {
  try {
    const { id } = req.params;
    const coupon = await Coupon.findOne({ _id: id, isDeleted: false });
    if (!coupon) return res.status(404).json({ message: "Coupon not found" });
    coupon.isDeleted = true;
    await coupon.save();
    res.json({ message: "Coupon deleted successfully" });
  } catch (error) {
    res.status(500).json({ message: `Internal Server Error: ${error.message}` });
  }
};

// Restore deleted coupon
export const restoreCoupon = async (req, res) => {
  try {
    const { id } = req.params;
    const coupon = await Coupon.findOne({ _id: id, isDeleted: true });
    if (!coupon) return res.status(404).json({ message: "Deleted coupon not found" });
    coupon.isDeleted = false;
    await coupon.save();
    res.json({ message: "Coupon restored successfully", coupon });
  } catch (error) {
    res.status(500).json({ message: `Internal Server Error: ${error.message}` });
  }
}; 