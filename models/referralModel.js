import mongoose from "mongoose";
import crypto from "crypto";
const days = parseInt(process.env.REFERRAL_COUPON_VALID_DAYS) || 30;

const referralSchema = new mongoose.Schema({
  referrer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  referred: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: false, // Optional - will be set when someone registers using the link
  },
  referralCode: {
    type: String,
    required: true,
    unique: true,
  },
  referralToken: {
    type: String,
    unique: true,
    sparse: true,
  },
  status: {
    type: String,
    enum: ["pending", "completed", "expired"],
    default: "pending",
  },
  completedAt: {
    type: Date,
  },
  rewardClaimed: {
    type: Boolean,
    default: false,
  },
  rewardCoupon: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Coupon",
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  expiresAt: {
    type: Date,
    default: function () {
      // Referral expires after 30 days
      return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
    },
  },
});

// Indexes
referralSchema.index({ referrer: 1, status: 1 });
referralSchema.index({ referred: 1 });
referralSchema.index({ expiresAt: 1 });

// Generate unique referral code
referralSchema.statics.generateReferralCode = function () {
  return crypto.randomBytes(4).toString("hex").toUpperCase();
};

// Generate unique referral token
referralSchema.statics.generateReferralToken = function () {
  return crypto.randomBytes(32).toString("hex");
};

// Check if referral code is valid
referralSchema.statics.isValidReferralCode = async function (code) {
  const referral = await this.findOne({
    referralCode: code,
    status: "pending",
    expiresAt: { $gt: new Date() },
  });
  return referral;
};

// Check if referral token is valid
referralSchema.statics.isValidReferralToken = async function (token) {
  const referral = await this.findOne({
    referralToken: token,
    status: "pending",
    expiresAt: { $gt: new Date() },
  });
  return referral;
};

// Complete referral
referralSchema.methods.completeReferral = function () {
  this.status = "completed";
  this.completedAt = new Date();
  return this.save();
};

const Referral = mongoose.model("Referral", referralSchema);
export default Referral;
