import mongoose from "mongoose";

const orderSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  items: [
    {
      productVariantId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "ProductVariant",
        required: true,
      },
      quantity: {
        type: Number,
        required: true,
        min: 1,
      },
      price: {
        type: Number,
        required: true,
        min: 0,
      },
      cancelled: {
        type: Boolean,
        default: false,
      },
      cancellationReason: {
        type: String,
        default: "",
      },
      returned: {
        type: Boolean,
        default: false,
      },
      returnReason: {
        type: String,
        default: "",
      },
      itemStatus: {
        type: String,
        enum: ["pending", "processing", "shipped", "delivered", "cancelled", "returned", "return_verified"],
        default: "pending",
      },
      itemPaymentStatus: {
        type: String,
        enum: ["pending", "paid", "failed", "refunded"],
        default: "pending",
      },
      offers: [{
        offerId: {
          type: mongoose.Schema.Types.ObjectId,
        },
        offerName: String,
        offerAmount: {
          type: Number,
          min: 0,
        },
        offerType: {
          type: String,
          enum: ["percentage", "fixed"],
        },
        offerValue: Number,
        productId: {
          type: mongoose.Schema.Types.ObjectId,
        },
      }],
    },
  ],
  shippingAddress: {
    recipientName: {
      type: String,
      required: true,
      trim: true,
    },
    addressLine1: {
      type: String,
      required: true,
      trim: true,
    },
    addressLine2: {
      type: String,
      trim: true,
    },
    city: {
      type: String,
      required: true,
      trim: true,
    },
    state: {
      type: String,
      required: true,
      trim: true,
    },
    postalCode: {
      type: String,
      required: true,
      trim: true,
    },
    country: {
      type: String,
      required: true,
      trim: true,
    },
    phoneNumber: {
      type: String,
      required: true,
      trim: true,
    },
  },
  paymentMethod: {
    type: String,
    enum: ["cod", "online", "wallet"],
    required: true,
  },
  razorpayOrderId: {
    type: String,
    index: true,
  },
  transactionId: {
    type: String,
    default: "",
  },
  paymentStatus: {
    type: String,
    enum: ["pending", "paid", "failed", "refunded"],
    default: "pending",
  },
  subtotal: {
    type: Number,
    required: true,
    min: 0,
  },
  subtotalAfterDiscount: {
    type: Number,
    required: true,
    min: 0,
  },
  discount: {
    discountId: {
      type: mongoose.Schema.Types.ObjectId,
    },
    discountName: String,
    discountAmount: {
      type: Number,
      min: 0,
    },
    discountType: {
      type: String,
      enum: ["percentage", "fixed"],
    },
    discountValue: Number,
  },
  shipping: {
    type: Number,
    required: true,
    min: 0,
  },
  total: {
    type: Number,
    required: true,
    min: 0,
  },
  // DEPRECATED: order.status is for summary/legacy use only. Do not use for business logic or UI except for summary.
  status: {
    type: String,
    enum: ["pending", "confirmed", "processing", "shipped", "delivered", "cancelled", "returned", "return_verified", "rejected"],
    default: "pending",
    // Deprecated: use item.itemStatus for all logic/UI
  },
  orderNumber: {
    type: String,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
  cancellationReason: {
    type: String,
    default: "",
  },
  returnVerifiedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
  },
  returnVerifiedAt: {
    type: Date,
  },
});

// Pre-save middleware to generate order number
orderSchema.pre("save", function (next) {
  this.updatedAt = new Date();
  
  // Generate order number if not exists
  if (!this.orderNumber) {
    const timestamp = Date.now().toString();
    const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    this.orderNumber = `ORD${timestamp}${random}`;
  }
  
  next();
});

// Index for better query performance
orderSchema.index({ user: 1, createdAt: -1 });
orderSchema.index({ orderNumber: 1 });
orderSchema.index({ status: 1 });

const Order = mongoose.model("Order", orderSchema);
export default Order; 