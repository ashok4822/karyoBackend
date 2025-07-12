import mongoose from "mongoose";

const offerSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
  },
  description: {
    type: String,
    trim: true,
  },
  offerType: {
    type: String,
    enum: ["product", "category", "referral"],
    required: true,
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
  // For product offers - specific products
  products: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: "Product",
  }],
  // For category offers - specific category
  category: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Category",
  },
  // For referral offers - referral type
  referralType: {
    type: String,
    enum: ["token", "code"],
    default: "code",
  },
  minimumAmount: {
    type: Number,
    default: 0,
    min: 0,
  },
  maximumDiscount: {
    type: Number,
    min: 0,
    default: null,
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

// Indexes for better query performance
offerSchema.index({ offerType: 1, status: 1, validFrom: 1, validTo: 1 });
offerSchema.index({ products: 1, status: 1 });
offerSchema.index({ category: 1, status: 1 });
offerSchema.index({ isDeleted: 1 });

// Update timestamp on save
offerSchema.pre("save", function (next) {
  this.updatedAt = new Date();
  next();
});

// Virtual to check if offer is valid
offerSchema.virtual("isValid").get(function () {
  const now = new Date();
  return (
    this.status === "active" &&
    this.validFrom <= now &&
    this.validTo >= now &&
    !this.isDeleted &&
    (this.maxUsage === null || this.usageCount < this.maxUsage)
  );
});

// Method to check if offer can be applied to a product
offerSchema.methods.canBeAppliedToProduct = function (productId, categoryId) {
  if (!this.isValid) return false;
  
  switch (this.offerType) {
    case "product":
      return this.products.includes(productId);
    case "category":
      return this.category.toString() === categoryId.toString();
    case "referral":
      return false; // Referral offers are not applied to products
    default:
      return false;
  }
};

// Method to calculate discount amount
offerSchema.methods.calculateDiscount = function (orderAmount) {
  if (!this.isValid) return 0;
  if (this.minimumAmount > 0 && orderAmount < this.minimumAmount) return 0;
  
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

// Static method to get the best offer for a product
offerSchema.statics.getBestOfferForProduct = async function (productId, categoryId) {
  const now = new Date();

  // Get all valid offers for this product
  const offers = await this.find({
    $and: [
      {
        $or: [
          { products: productId },
          { category: categoryId }
        ]
      },
      {
        status: "active",
        validFrom: { $lte: now },
        validTo: { $gte: now },
        isDeleted: false
      },
      {
        $or: [
          { maxUsage: null },
          { $expr: { $lt: ["$usageCount", "$maxUsage"] } }
        ]
      }
    ]
  }).populate("products category");

  if (offers.length === 0) return null;

  // Find the offer with the highest discount value
  let bestOffer = offers[0];
  let bestDiscountValue = bestOffer.discountValue;

  for (const offer of offers) {
    if (offer.discountValue > bestDiscountValue) {
      bestOffer = offer;
      bestDiscountValue = offer.discountValue;
    }
  }

  return bestOffer;
};

const Offer = mongoose.model("Offer", offerSchema);
export default Offer; 