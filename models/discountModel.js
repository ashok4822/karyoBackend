import mongoose from "mongoose";

const discountSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
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

// Index for better query performance
discountSchema.index({ status: 1, validFrom: 1, validTo: 1 });
discountSchema.index({ name: 1 });
discountSchema.index({ isDeleted: 1 });

// Pre-save middleware to update the updatedAt field
discountSchema.pre("save", function (next) {
  this.updatedAt = new Date();
  next();
});

// Virtual for checking if discount is currently valid
discountSchema.virtual("isValid").get(function () {
  const now = new Date();
  return (
    this.status === "active" &&
    this.validFrom <= now &&
    this.validTo >= now &&
    !this.isDeleted &&
    (this.maxUsage === null || this.usageCount < this.maxUsage)
  );
});

// Method to check if discount can be applied
discountSchema.methods.canBeApplied = function (orderAmount) {
  if (!this.isValid) return false;
  if (this.minimumAmount > 0 && orderAmount < this.minimumAmount) return false;
  return true;
};

// Method to calculate discount amount
discountSchema.methods.calculateDiscount = function (orderAmount) {
  if (!this.canBeApplied(orderAmount)) return 0;

  let discountAmount = 0;
  
  if (this.discountType === "percentage") {
    discountAmount = (orderAmount * this.discountValue) / 100;
  } else {
    discountAmount = this.discountValue;
  }

  // Apply maximum discount limit if set
  if (this.maximumDiscount && discountAmount > this.maximumDiscount) {
    discountAmount = this.maximumDiscount;
  }

  // Ensure discount doesn't exceed order amount
  if (discountAmount > orderAmount) {
    discountAmount = orderAmount;
  }

  return Math.round(discountAmount * 100) / 100; // Round to 2 decimal places
};

const Discount = mongoose.model("Discount", discountSchema);
export default Discount; 