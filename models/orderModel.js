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
    },
  ],
  shippingAddress: {
    firstName: {
      type: String,
      required: true,
    },
    lastName: {
      type: String,
      required: true,
    },
    email: {
      type: String,
      required: true,
    },
    phone: {
      type: String,
      required: true,
    },
    address: {
      type: String,
      required: true,
    },
    city: {
      type: String,
      required: true,
    },
    state: {
      type: String,
      required: true,
    },
    zipCode: {
      type: String,
      required: true,
    },
    country: {
      type: String,
      required: true,
    },
  },
  paymentMethod: {
    type: String,
    enum: ["cod", "online"],
    required: true,
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
      ref: "Discount",
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
  status: {
    type: String,
    enum: ["pending", "confirmed", "processing", "shipped", "delivered", "cancelled"],
    default: "pending",
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