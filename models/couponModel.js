import mongoose from "mongoose";

const couponSchema = new mongoose.Schema({
  code: {
    type: String,
    required: true,
    trim: true,
    unique: true,
    uppercase: true,
  },
  description: {
    type: String,
    trim: true,
  },
  discountType: {
    type: String,
    enum: ["percentage", "fixed"],
    required: true,
  },
  discountValue: {
    type: Number,
    required: true,
    min: 0,
  },
  minimumAmount: {
    type: Number,
    default: 0,
    min: 0,
  },
  maximumDiscount: {
    type: Number,
    min: 0,
  },
  validFrom: {
    type: Date,
    required: true,
  },
  validTo: {
    type: Date,
    required: true,
  },
  status: {
    type: String,
    enum: ["active", "inactive", "expired"],
    default: "active",
  },
  usageCount: {
    type: Number,
    default: 0,
  },
  maxUsage: {
    type: Number,
    default: null, // null means unlimited
  },
  maxUsagePerUser: {
    type: Number,
    default: null, // null means unlimited per user
  },
  isDeleted: {
    type: Boolean,
    default: false,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

couponSchema.index({ status: 1, validFrom: 1, validTo: 1 });
couponSchema.index({ isDeleted: 1 });

couponSchema.pre("save", function (next) {
  this.updatedAt = new Date();
  next();
});

couponSchema.virtual("isValid").get(function () {
  const now = new Date();
  return (
    this.status === "active" &&
    this.validFrom <= now &&
    this.validTo >= now &&
    !this.isDeleted &&
    (this.maxUsage === null || this.usageCount < this.maxUsage)
  );
});

couponSchema.methods.canBeApplied = function (orderAmount) {
  if (!this.isValid) return false;
  if (this.minimumAmount > 0 && orderAmount < this.minimumAmount) return false;
  return true;
};

couponSchema.methods.calculateDiscount = function (orderAmount) {
  if (!this.canBeApplied(orderAmount)) return 0;
  let discountAmount = 0;
  if (this.discountType === "percentage") {
    discountAmount = (orderAmount * this.discountValue) / 100;
  } else {
    discountAmount = this.discountValue;
  }
  if (this.maximumDiscount && discountAmount > this.maximumDiscount) {
    discountAmount = this.maximumDiscount;
  }
  if (discountAmount > orderAmount) {
    discountAmount = orderAmount;
  }
  return Math.round(discountAmount * 100) / 100;
};

const Coupon = mongoose.model("Coupon", couponSchema);
export default Coupon; 