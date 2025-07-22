import Referral from "../models/referralModel.js";
import User from "../models/userModel.js";
import Coupon from "../models/couponModel.js";
import Offer from "../models/offerModel.js";
import { statusCodes } from "../constants/statusCodes.js";
import crypto from "crypto";
import {
  validateReferralCodeFormat,
  isReferralCodeAvailable,
} from "../utils/referralCodeGenerator.js";
export const generateReferralCode = async (req, res) => {
  try {
    const userId = req.user.userId;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(statusCodes.NOT_FOUND).json({
        success: false,
        message: "User not found",
      });
    }

    // Check if user already has a referral code
    if (user.referralCode) {
      return res.status(statusCodes.BAD_REQUEST).json({
        success: false,
        message: "User already has a referral code",
        data: { referralCode: user.referralCode },
      });
    }

    // Generate unique referral code
    let referralCode;
    let isUnique = false;
    let attempts = 0;
    const maxAttempts = 10;

    while (!isUnique && attempts < maxAttempts) {
      referralCode = Referral.generateReferralCode();
      const existingUser = await User.findOne({ referralCode });
      if (!existingUser) {
        isUnique = true;
      }
      attempts++;
    }

    if (!isUnique) {
      return res.status(statusCodes.INTERNAL_SERVER_ERROR).json({
        success: false,
        message: "Failed to generate unique referral code",
      });
    }

    // Update user with referral code
    user.referralCode = referralCode;
    await user.save();

    res.status(statusCodes.OK).json({
      success: true,
      message: "Referral code generated successfully",
      data: { referralCode },
    });
  } catch (error) {
    console.error("Error generating referral code:", error);
    res.status(statusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: "Failed to generate referral code",
      error: error.message,
    });
  }
};

// Get user's referral code
export const getReferralCode = async (req, res) => {
  try {
    const userId = req.user.userId;

    const user = await User.findById(userId).select(
      "referralCode referralCount totalReferralRewards"
    );
    if (!user) {
      return res.status(statusCodes.NOT_FOUND).json({
        success: false,
        message: "User not found",
      });
    }

    res.status(statusCodes.OK).json({
      success: true,
      data: {
        referralCode: user.referralCode,
        referralCount: user.referralCount,
        totalReferralRewards: user.totalReferralRewards,
      },
    });
  } catch (error) {
    console.error("Error fetching referral code:", error);
    res.status(statusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: "Failed to fetch referral code",
      error: error.message,
    });
  }
};

// Generate referral link with token
export const generateReferralLink = async (req, res) => {
  try {
    const userId = req.user.userId;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(statusCodes.NOT_FOUND).json({
        success: false,
        message: "User not found",
      });
    }

    // Generate unique referral token
    let referralToken;
    let isUnique = false;
    let attempts = 0;
    const maxAttempts = 10;

    while (!isUnique && attempts < maxAttempts) {
      referralToken = Referral.generateReferralToken();
      const existingReferral = await Referral.findOne({ referralToken });
      if (!existingReferral) {
        isUnique = true;
      }
      attempts++;
    }

    if (!isUnique) {
      return res.status(statusCodes.INTERNAL_SERVER_ERROR).json({
        success: false,
        message: "Failed to generate unique referral token",
      });
    }

    // Generate unique referral code for this link
    let referralCode;
    let isCodeUnique = false;
    let codeAttempts = 0;
    const maxCodeAttempts = 10;

    while (!isCodeUnique && codeAttempts < maxCodeAttempts) {
      referralCode = Referral.generateReferralCode();
      const existingReferralWithCode = await Referral.findOne({ referralCode });
      if (!existingReferralWithCode) {
        isCodeUnique = true;
      }
      codeAttempts++;
    }

    if (!isCodeUnique) {
      return res.status(statusCodes.INTERNAL_SERVER_ERROR).json({
        success: false,
        message: "Failed to generate unique referral code",
      });
    }

    // Create referral record (without referred user - will be set when someone registers)
    const referral = new Referral({
      referrer: userId,
      referralToken,
      referralCode: referralCode,
    });

    await referral.save();

    // Generate referral link
    const baseUrl = process.env.FRONTEND_URL || "http://localhost:8080";
    const referralLink = `${baseUrl}/signup?ref=${referralToken}`;

    res.status(statusCodes.OK).json({
      success: true,
      message: "Referral link generated successfully",
      data: {
        referralLink,
        referralToken,
        expiresAt: referral.expiresAt,
      },
    });
  } catch (error) {
    console.error("Error generating referral link:", error);
    res.status(statusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: "Failed to generate referral link",
      error: error.message,
    });
  }
};

// Validate referral code/token during registration
export const validateReferral = async (req, res) => {
  try {
    const { referralCode, referralToken } = req.body;

    if (!referralCode && !referralToken) {
      return res.status(statusCodes.BAD_REQUEST).json({
        success: false,
        message: "Referral code or token is required",
      });
    }

    let referral = null;

    if (referralToken) {
      referral = await Referral.isValidReferralToken(referralToken);
    } else if (referralCode) {
      referral = await Referral.isValidReferralCode(referralCode);
    }

    if (!referral) {
      return res.status(statusCodes.BAD_REQUEST).json({
        success: false,
        message: "Invalid or expired referral code/token",
      });
    }

    // Get referrer details
    const referrer = await User.findById(referral.referrer).select(
      "username email firstName lastName"
    );

    res.status(statusCodes.OK).json({
      success: true,
      message: "Valid referral",
      data: {
        referrer,
        referralType: referral.referralToken ? "token" : "code",
        expiresAt: referral.expiresAt,
      },
    });
  } catch (error) {
    console.error("Error validating referral:", error);
    res.status(statusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: "Failed to validate referral",
      error: error.message,
    });
  }
};

// Process referral completion (called after successful registration)
export const processReferral = async (req, res) => {
  try {
    const { referralCode, referralToken, newUserId } = req.body;

    if (!newUserId) {
      return res.status(statusCodes.BAD_REQUEST).json({
        success: false,
        message: "New user ID is required",
      });
    }

    let referral = null;

    if (referralToken) {
      referral = await Referral.isValidReferralToken(referralToken);
    } else if (referralCode) {
      referral = await Referral.isValidReferralCode(referralCode);
    }

    if (!referral) {
      return res.status(statusCodes.BAD_REQUEST).json({
        success: false,
        message: "Invalid or expired referral",
      });
    }

    // Check if referral is already completed
    if (referral.status === "completed") {
      return res.status(statusCodes.BAD_REQUEST).json({
        success: false,
        message: "Referral already completed",
      });
    }

    // Update referral with referred user
    referral.referred = newUserId;
    await referral.completeReferral();

    // Update referrer's referral count
    await User.findByIdAndUpdate(referral.referrer, {
      $inc: { referralCount: 1 },
    });

    // Update new user's referredBy field
    await User.findByIdAndUpdate(newUserId, {
      referredBy: referral.referrer,
    });

    // Generate reward coupon for referrer
    const rewardCoupon = await generateReferralReward(referral.referrer);

    // Update referral with reward coupon
    referral.rewardCoupon = rewardCoupon._id;
    await referral.save();

    res.status(statusCodes.OK).json({
      success: true,
      message: "Referral processed successfully",
      data: {
        referralId: referral._id,
        rewardCoupon: rewardCoupon.code,
      },
    });
  } catch (error) {
    console.error("Error processing referral:", error);
    res.status(statusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: "Failed to process referral",
      error: error.message,
    });
  }
};

// Get user's referral history
export const getReferralHistory = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { page = 1, limit = 10 } = req.query;

    const skip = (page - 1) * limit;

    const referrals = await Referral.find({ referrer: userId })
      .populate("referred", "username email firstName lastName createdAt")
      .populate("rewardCoupon", "code discountType discountValue")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Referral.countDocuments({ referrer: userId });

    res.status(statusCodes.OK).json({
      success: true,
      data: referrals,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limit),
        totalItems: total,
        itemsPerPage: parseInt(limit),
      },
    });
  } catch (error) {
    console.error("Error fetching referral history:", error);
    res.status(statusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: "Failed to fetch referral history",
      error: error.message,
    });
  }
};

// Get referral statistics
export const getReferralStats = async (req, res) => {
  try {
    const userId = req.user.userId;

    const user = await User.findById(userId).select(
      "referralCount totalReferralRewards"
    );
    if (!user) {
      return res.status(statusCodes.NOT_FOUND).json({
        success: false,
        message: "User not found",
      });
    }

    const stats = await Referral.aggregate([
      { $match: { referrer: user._id } },
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 },
        },
      },
    ]);

    const statusCounts = {
      pending: 0,
      completed: 0,
      expired: 0,
    };

    stats.forEach((stat) => {
      statusCounts[stat._id] = stat.count;
    });

    res.status(statusCodes.OK).json({
      success: true,
      data: {
        totalReferrals: user.referralCount,
        totalRewards: user.totalReferralRewards,
        statusBreakdown: statusCounts,
      },
    });
  } catch (error) {
    console.error("Error fetching referral stats:", error);
    res.status(statusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: "Failed to fetch referral statistics",
      error: error.message,
    });
  }
};

// Helper function to generate referral reward coupon
export const generateReferralReward = async (referrerId) => {
  try {
    // Get referral offer
    const referralOffer = await Offer.findOne({
      offerType: "referral",
      status: "active",
      isDeleted: false,
      validFrom: { $lte: new Date() },
      validTo: { $gte: new Date() },
    });

    if (!referralOffer) {
      throw new Error("No active referral offer found");
    }

    // Generate unique coupon code
    let couponCode;
    let isUnique = false;
    let attempts = 0;
    const maxAttempts = 10;

    while (!isUnique && attempts < maxAttempts) {
      couponCode = `REF${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
      const existingCoupon = await Coupon.findOne({ code: couponCode });
      if (!existingCoupon) {
        isUnique = true;
      }
      attempts++;
    }

    if (!isUnique) {
      throw new Error("Failed to generate unique coupon code");
    }

    const days = parseInt(process.env.REFERRAL_COUPON_VALID_DAYS) || 30;

    // Create reward coupon
    const rewardCoupon = new Coupon({
      code: couponCode,
      description: "Referral reward coupon",
      discountType: referralOffer.discountType,
      discountValue: referralOffer.discountValue,
      minimumAmount: referralOffer.minimumAmount,
      maximumDiscount: referralOffer.maximumDiscount,
      validFrom: new Date(),
      validTo: new Date(Date.now() + days * 24 * 60 * 60 * 1000),
      maxUsage: 1,
      maxUsagePerUser: 1,
    });

    await rewardCoupon.save();

    // Update referrer's total rewards
    await User.findByIdAndUpdate(referrerId, {
      $inc: { totalReferralRewards: 1 },
    });

    return rewardCoupon;
  } catch (error) {
    console.error("Error generating referral reward:", error);
    throw error;
  }
};

// Admin: Get all referrals
export const getAllReferrals = async (req, res) => {
  try {
    const { page = 1, limit = 10, status, search } = req.query;

    const skip = (page - 1) * limit;
    const query = {};

    if (status) query.status = status;
    if (search) {
      query.$or = [
        { referralCode: { $regex: search, $options: "i" } },
        { referralToken: { $regex: search, $options: "i" } },
      ];
    }

    const referrals = await Referral.find(query)
      .populate("referrer", "username email firstName lastName")
      .populate("referred", "username email firstName lastName")
      .populate("rewardCoupon", "code discountType discountValue")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Referral.countDocuments(query);

    res.status(statusCodes.OK).json({
      success: true,
      data: referrals,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limit),
        totalItems: total,
        itemsPerPage: parseInt(limit),
      },
    });
  } catch (error) {
    console.error("Error fetching all referrals:", error);
    res.status(statusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: "Failed to fetch referrals",
      error: error.message,
    });
  }
};
