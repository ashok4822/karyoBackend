import mongoose from "mongoose";

const userDiscountUsageSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  discount: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
  },
  usageCount: {
    type: Number,
    default: 0,
    min: 0,
  },
  lastUsedAt: {
    type: Date,
    default: null,
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

// Compound index to ensure one record per user-discount combination
userDiscountUsageSchema.index({ user: 1, discount: 1 }, { unique: true });

// Index for better query performance
userDiscountUsageSchema.index({ user: 1 });
userDiscountUsageSchema.index({ discount: 1 });

// Pre-save middleware to update the updatedAt field
userDiscountUsageSchema.pre("save", function (next) {
  this.updatedAt = new Date();
  next();
});

// Static method to get or create user discount usage
userDiscountUsageSchema.statics.getOrCreate = async function(userId, discountId) {
  let usage = await this.findOne({ user: userId, discount: discountId });
  
  if (!usage) {
    usage = new this({
      user: userId,
      discount: discountId,
      usageCount: 0,
    });
  }
  
  return usage;
};

// Method to check if user can use the discount
userDiscountUsageSchema.methods.canUseDiscount = function(discount) {
  // Check if user has reached their personal limit
  if (discount.maxUsagePerUser && this.usageCount >= discount.maxUsagePerUser) {
    return false;
  }
  
  return true;
};

// Method to increment usage
userDiscountUsageSchema.methods.incrementUsage = function() {
  this.usageCount += 1;
  this.lastUsedAt = new Date();
  return this.save();
};

const UserDiscountUsage = mongoose.model("UserDiscountUsage", userDiscountUsageSchema);
export default UserDiscountUsage; 