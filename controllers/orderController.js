import Order from "../models/orderModel.js";
import Discount from "../models/discountModel.js";
import UserDiscountUsage from "../models/userDiscountUsageModel.js";
import mongoose from "mongoose";
import Razorpay from "razorpay";
import crypto from "crypto";
import dotenv from "dotenv";
dotenv.config();

// Razorpay instance
const razorpay = new Razorpay({
  key_id: process.env.RAZOR_KEY_ID,
  key_secret: process.env.RAZOR_SECRET_ID,
});

// Create a new order
export const createOrder = async (req, res) => {
  try {
    const {
      items,
      shippingAddress,
      paymentMethod,
      subtotal,
      subtotalAfterDiscount,
      discount,
      offers, // <-- Add this line to destructure offers from req.body
      shipping,
      total,
    } = req.body;

    // Validation
    if (!items || items.length === 0) {
      return res
        .status(400)
        .json({ message: "Order must contain at least one item" });
    }

    if (!shippingAddress) {
      return res.status(400).json({ message: "Shipping address is required" });
    }

    if (
      !paymentMethod ||
      !["cod", "online", "wallet"].includes(paymentMethod)
    ) {
      return res
        .status(400)
        .json({ message: "Valid payment method is required" });
    }

    // Stock validation for each product variant before proceeding
    for (const item of items) {
      const productVariant = await mongoose
        .model("ProductVariant")
        .findById(item.productVariantId);
      if (!productVariant) {
        return res.status(400).json({
          message: `Product variant not found for item: ${item.productVariantId}`,
        });
      }
      if (productVariant.stock < item.quantity) {
        return res.status(400).json({
          message: `Insufficient stock for ${productVariant.colour} ${productVariant.capacity}. Only ${productVariant.stock} left.`,
          productVariantId: item.productVariantId,
        });
      }
    }

    // Validate discount if provided
    if (discount && discount.discountId) {
      // First check in Discount model
      let discountDoc = await Discount.findById(discount.discountId);
      // If not found in Discount model, check in Coupon model
      if (!discountDoc) {
        const Coupon = (await import("../models/couponModel.js")).default;
        const couponDoc = await Coupon.findById(discount.discountId);
        if (couponDoc) {
          // Convert coupon to discount format for consistency
          discountDoc = {
            _id: couponDoc._id,
            name: couponDoc.description || couponDoc.code,
            code: couponDoc.code,
            description: couponDoc.description,
            discountType: couponDoc.discountType,
            discountValue: couponDoc.discountValue,
            minimumAmount: couponDoc.minimumAmount,
            maximumDiscount: couponDoc.maximumDiscount,
            validFrom: couponDoc.validFrom,
            validTo: couponDoc.validTo,
            status: couponDoc.status,
            usageCount: couponDoc.usageCount,
            maxUsage: couponDoc.maxUsage,
            maxUsagePerUser: couponDoc.maxUsagePerUser,
            isDeleted: couponDoc.isDeleted,
            isValid: couponDoc.isValid,
            canBeApplied: couponDoc.canBeApplied,
            calculateDiscount: couponDoc.calculateDiscount,
          };
        }
      }
      if (!discountDoc) {
        return res.status(400).json({ message: "Invalid discount" });
      }
      // Check if discount is still valid
      if (!discountDoc.isValid) {
        return res.status(400).json({ message: "Discount is no longer valid" });
      }
      // Check minimum amount requirement
      if (
        discountDoc.minimumAmount > 0 &&
        subtotal < discountDoc.minimumAmount
      ) {
        return res.status(400).json({
          message: `Minimum order amount of ₹${discountDoc.minimumAmount} required for this discount`,
        });
      }
      // Check global usage limit
      if (
        discountDoc.maxUsage &&
        discountDoc.usageCount >= discountDoc.maxUsage
      ) {
        return res
          .status(400)
          .json({ message: "Discount usage limit reached" });
      }
      // Check per-user usage limit
      const userUsage = await UserDiscountUsage.getOrCreate(
        req.user.userId,
        discount.discountId
      );
      if (!userUsage.canUseDiscount(discountDoc)) {
        return res.status(400).json({
          message: `You have reached your personal usage limit for this discount`,
        });
      }
      // Update global discount/coupon usage count
      if (discountDoc.usageCount !== undefined) {
        // Use findByIdAndUpdate instead of save() to avoid validation issues
        await Discount.findByIdAndUpdate(discount.discountId, {
          $inc: { usageCount: 1 },
        });
      }
      // Update user-specific usage count
      await userUsage.incrementUsage();
    }

    // COD-specific validations
    if (paymentMethod === "cod") {
      // Check if COD is available for the order amount
      const maxCodAmount = parseFloat(process.env.MAX_COD_AMOUNT) || 1000;
      if (total > maxCodAmount) {
        return res.status(400).json({
          message: `Cash on Delivery is not available for orders above ₹${maxCodAmount.toLocaleString()}. Please use online payment.`,
        });
      }
      // Check if COD is available for the shipping address location
      const codRestrictedStates = [
        "Jammu & Kashmir",
        "Ladakh",
        "Arunachal Pradesh",
        "Manipur",
        "Mizoram",
        "Nagaland",
        "Tripura",
      ];
      if (codRestrictedStates.includes(shippingAddress.state)) {
        return res.status(400).json({
          message:
            "Cash on Delivery is not available in your location. Please use online payment.",
        });
      }
    }

    // Accept paymentStatus from frontend if provided (for online payments)
    let incomingPaymentStatus = req.body.paymentStatus;
    const razorpayOrderId = req.body.razorpayOrderId;
    let finalPaymentStatus;
    if (paymentMethod === "online") {
      if (!razorpayOrderId) {
        return res
          .status(400)
          .json({ message: "razorpayOrderId is required for online payments" });
      }
      // Idempotency: check if order already exists for this user and razorpayOrderId
      const existingOrder = await Order.findOne({
        user: req.user.userId,
        razorpayOrderId,
      });
      if (existingOrder) {
        return res.status(200).json({
          message: "Order already exists for this payment attempt",
          order: existingOrder,
        });
      }
      if (incomingPaymentStatus === "failed") {
        finalPaymentStatus = "failed";
      } else {
        finalPaymentStatus = "paid";
      }
    } else if (paymentMethod === "wallet") {
      // Wallet payment logic
      // Import Wallet model here to avoid circular dependency
      const Wallet = (await import("../models/walletModel.js")).default;
      let wallet = await Wallet.findOne({ user: req.user.userId });
      if (!wallet) {
        wallet = await Wallet.create({ user: req.user.userId });
      }
      if (wallet.balance < total) {
        console.error(
          "[WALLET] Insufficient balance for user",
          req.user.userId
        );
        return res.status(400).json({ message: "Insufficient wallet balance" });
      }
      wallet.balance -= total;
      wallet.transactions.push({
        type: "debit",
        amount: total,
        description: `Order payment for new order`,
      });
      await wallet.save();
      console.log(
        `[WALLET] Deducted INR ${total} from user ${req.user.userId}`
      );
      finalPaymentStatus = "paid";
    } else {
      finalPaymentStatus = "pending";
    }

    // Set per-item payment status and attach offers to each item
    const itemsWithOfferAndPaymentStatus = items.map((item) => {
      // Find offers for this productVariant
      const itemOffers = Array.isArray(offers)
        ? offers.filter(
            (offer) =>
              offer.productVariantId === item.productVariantId ||
              offer.productVariantId === String(item.productVariantId)
          )
        : [];
      return {
        ...item,
        itemPaymentStatus:
          finalPaymentStatus === "paid"
            ? "paid"
            : finalPaymentStatus === "failed"
            ? "failed"
            : "pending",
        offers: itemOffers, // Attach offers to the item
      };
    });
    const order = new Order({
      user: req.user.userId,
      items: itemsWithOfferAndPaymentStatus,
      shippingAddress,
      paymentMethod,
      razorpayOrderId: paymentMethod === "online" ? razorpayOrderId : undefined,
      subtotal,
      subtotalAfterDiscount,
      discount,
      // offers, // <-- REMOVED this line
      shipping,
      total,
      paymentStatus: finalPaymentStatus,
    });
    await order.save();
    console.log("Saved order offers:", order.offers);

    // Increment usageCount for each offer used in the order (if payment is confirmed)
    if (
      finalPaymentStatus === "paid" &&
      Array.isArray(offers) &&
      offers.length > 0
    ) {
      // offers may be array of offer objects or IDs
      const offerIds = offers.map((offer) => (offer._id ? offer._id : offer));
      await mongoose
        .model("Offer")
        .updateMany({ _id: { $in: offerIds } }, { $inc: { usageCount: 1 } });
    }

    // Decrement stock for each ordered product variant ONLY if paymentStatus is 'paid'
    if (finalPaymentStatus === "paid") {
      for (const item of items) {
        try {
          await mongoose
            .model("ProductVariant")
            .findByIdAndUpdate(item.productVariantId, {
              $inc: { stock: -item.quantity },
            });
          console.log(
            `[STOCK] Decremented stock for variant ${item.productVariantId} by ${item.quantity}`
          );
        } catch (err) {
          console.error(
            `[STOCK] Failed to decrement stock for variant ${item.productVariantId}:`,
            err
          );
        }
      }
    }

    // Populate product details for response
    await order.populate({
      path: "items.productVariantId",
      populate: {
        path: "product",
        select: "name brand",
      },
    });

    res.status(201).json({
      message:
        paymentMethod === "cod"
          ? "Order placed successfully with Cash on Delivery! Pay ₹" +
            total.toFixed(2) +
            " when your order arrives."
          : "Order created successfully",
      order: {
        _id: order._id,
        orderNumber: order.orderNumber,
        items: order.items,
        shippingAddress: order.shippingAddress,
        paymentMethod: order.paymentMethod,
        subtotal: order.subtotal,
        subtotalAfterDiscount: order.subtotalAfterDiscount,
        discount: order.discount
          ? {
              ...order.discount,
              discountName:
                order.discount.code ||
                order.discount.description ||
                order.discount.name ||
                "",
            }
          : null,
        offers: order.offers,
        shipping: order.shipping,
        total: order.total,
        status: order.status,
        createdAt: order.createdAt,
        paymentInstructions:
          paymentMethod === "cod"
            ? {
                method: "Cash on Delivery",
                amount: total,
                instructions: [
                  "Keep the exact amount ready when your order arrives",
                  "You can inspect the items before payment",
                  "No additional charges for COD",
                  "Payment is due upon delivery",
                ],
              }
            : null,
      },
    });
  } catch (error) {
    // Keep only essential error logging
    console.error("Error creating order:", error);
    res
      .status(500)
      .json({ message: `Internal Server Error: ${error.message}` });
  }
};

// Create Razorpay order
export const createRazorpayOrder = async (req, res) => {
  try {
    const { amount, currency = "INR", receipt } = req.body;
    if (!amount) return res.status(400).json({ message: "Amount is required" });
    const options = {
      amount: Math.round(amount * 100), // Razorpay expects paise
      currency,
      receipt: receipt || `rcpt_${Date.now()}`,
    };
    const order = await razorpay.orders.create(options);
    res.status(201).json({ order });
  } catch (error) {
    res.status(500).json({
      message: "Failed to create Razorpay order",
      error: error.message,
    });
  }
};

// Verify Razorpay payment signature
export const verifyRazorpayPayment = async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } =
      req.body;
    const sign = `${razorpay_order_id}|${razorpay_payment_id}`;
    const expectedSignature = crypto
      .createHmac("sha256", process.env.RAZOR_SECRET_ID)
      .update(sign)
      .digest("hex");
    if (expectedSignature === razorpay_signature) {
      res.status(200).json({ success: true, message: "Payment verified" });
    } else {
      res.status(400).json({ success: false, message: "Invalid signature" });
    }
  } catch (error) {
    res
      .status(500)
      .json({ message: "Failed to verify payment", error: error.message });
  }
};

// Get user's orders
export const getUserOrders = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    // Always enforce a maximum of 5 orders per page
    const limit = 5;
    const status = req.query.status; // optional filter
    const search = req.query.search; // new search parameter

    const query = { user: req.user.userId };

    if (status && status !== "all") {
      query.status = status;
    }

    // First, get all orders for the user with basic filters
    let allOrders = await Order.find(query)
      .populate({
        path: "items.productVariantId",
        populate: {
          path: "product",
          select: "name brand mainImage",
        },
      })
      .sort({ createdAt: -1 });

    // Apply search filter if provided
    if (search && search.trim() !== "") {
      const searchTerm = search.trim().toLowerCase();
      allOrders = allOrders.filter((order) => {
        // Check orderNumber
        if (
          order.orderNumber &&
          order.orderNumber.toLowerCase().includes(searchTerm)
        ) {
          return true;
        }

        // Check recipientName
        if (
          order.shippingAddress &&
          order.shippingAddress.recipientName &&
          order.shippingAddress.recipientName.toLowerCase().includes(searchTerm)
        ) {
          return true;
        }

        // Check product names
        if (order.items && order.items.length > 0) {
          return order.items.some((item) => {
            const product = item.productVariantId?.product;
            return (
              product &&
              product.name &&
              product.name.toLowerCase().includes(searchTerm)
            );
          });
        }

        return false;
      });
    }

    // Calculate total and paginate
    const total = allOrders.length;
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;
    const orders = allOrders.slice(startIndex, endIndex);

    res.json({
      orders,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error) {
    console.error("Error getting user orders:", error);
    res
      .status(500)
      .json({ message: `Internal Server Error: ${error.message}` });
  }
};

// Get order by ID
export const getOrderById = async (req, res) => {
  console.log("======TESTING======");
  try {
    const { id } = req.params;
    const order = await Order.findOne({
      _id: id,
      user: req.user.userId,
    }).populate({
      path: "items.productVariantId",
      populate: {
        path: "product",
        select: "name brand",
      },
    });

    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    console.log("order : ", order);

    res.json({
      order: {
        ...order.toObject(),
        offers: order.offers,
      },
    });
  } catch (error) {
    // console.error("Error getting order:", error);
    res
      .status(500)
      .json({ message: `Internal Server Error: ${error.message}` });
  }
};

// Get order by ID (admin)
export const getOrderByIdForAdmin = async (req, res) => {
  console.log("=====AdminOrder=======");
  try {
    const { id } = req.params;
    const order = await Order.findOne({ _id: id })
      .populate({
        path: "user",
        select: "username firstName lastName email address mobileNo",
      })
      .populate({
        path: "items.productVariantId",
        populate: {
          path: "product",
          select: "name brand mainImage",
        },
      });

    console.log("adminOrder: ", order);

    let shippingCharge = order.shipping;

    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }
    // Compose payment object for frontend compatibility
    const payment = {
      method: order.paymentMethod || "-",
      status: order.paymentStatus || "pending",
      transactionId: order.transactionId || "-",
    };
    // Compose shipping object with only status
    const shipping = {
      status: order.status || "-",
    };
    // Preserve original fields for backend compatibility
    const orderData = {
      ...order.toObject(),
      payment,
      shippingCharge,
      shipping,

      paymentMethod: order.paymentMethod,
      paymentStatus: order.paymentStatus,
    };
    res.json({ order: orderData });
  } catch (error) {
    // console.error("Error getting order (admin):", error);
    res
      .status(500)
      .json({ message: `Internal Server Error: ${error.message}` });
  }
};

// Cancel order
export const cancelOrder = async (req, res) => {
  try {
    console.log("Entered cancelOrder for order:", req.params.id);
    const { id } = req.params;
    const { reason, productVariantIds } = req.body;
    const order = await Order.findOne({ _id: id, user: req.user.userId });

    if (!order) {
      console.log("Order not found for id:", id);
      return res.status(404).json({ message: "Order not found" });
    }

    // Only allow cancellation of pending items
    // If productVariantIds provided, cancel specific products
    if (Array.isArray(productVariantIds) && productVariantIds.length > 0) {
      let anyCancelled = false;
      for (const item of order.items) {
        if (
          productVariantIds.includes(item.productVariantId.toString()) &&
          !item.cancelled &&
          item.itemStatus !== "cancelled"
        ) {
          item.cancelled = true;
          item.cancellationReason = reason || "";
          item.itemStatus = "cancelled"; // Set per-item status only
          // Increment stock for the product variant
          await mongoose
            .model("ProductVariant")
            .findByIdAndUpdate(item.productVariantId, {
              $inc: { stock: item.quantity },
            });
          anyCancelled = true;
        }
      }
      if (!anyCancelled) {
        console.log("No valid items to cancel for order:", id);
        return res.status(400).json({ message: "No valid items to cancel." });
      }
      // If all items are now cancelled, set order.status to cancelled (summary only)
      if (
        order.items.every(
          (item) => item.cancelled || item.itemStatus === "cancelled"
        )
      ) {
        order.status = "cancelled";
        order.cancellationReason = reason || "";
      }
      // Refund for partial cancellation in online/wallet payment orders
      if (
        (order.paymentMethod === "online" ||
          order.paymentMethod === "wallet") &&
        ["paid", "pending"].includes(order.paymentStatus)
      ) {
        const Wallet = mongoose.model("Wallet");
        let wallet = await Wallet.findOne({ user: order.user });
        if (!wallet) {
          wallet = await Wallet.create({ user: order.user });
        }
        // Calculate total of all items (avoid division by zero)
        const totalOrderItems =
          order.items.reduce((sum, i) => sum + i.price * i.quantity, 0) || 1;
        // For each newly cancelled item, refund proportional amount
        for (const item of order.items) {
          if (
            productVariantIds.includes(item.productVariantId.toString()) &&
            item.cancelled &&
            item.itemPaymentStatus !== "refunded"
          ) {
            let refundAmount = item.price * item.quantity;
            // Proportional discount
            let itemDiscount = 0;
            if (order.discount && order.discount.discountAmount > 0) {
              itemDiscount =
                (refundAmount / totalOrderItems) *
                order.discount.discountAmount;
            }
            // Proportional offer
            let itemOffer = 0;
            if (order.offers && order.offers.length > 0) {
              const totalOffer = order.offers.reduce(
                (sum, offer) => sum + (offer.offerAmount || 0),
                0
              );
              itemOffer = (refundAmount / totalOrderItems) * totalOffer;
            }
            // Proportional shipping
            let itemShipping = 0;
            if (order.shipping && order.items.length > 0) {
              itemShipping = order.shipping / order.items.length;
            }
            refundAmount = Math.max(
              0,
              refundAmount - itemDiscount - itemOffer + itemShipping
            );
            wallet.balance += refundAmount;
            wallet.transactions.push({
              type: "credit",
              amount: refundAmount,
              description: `Refund for cancelled product in order ${
                order.orderNumber
              } (${order.paymentMethod.toUpperCase()}) - Refunded by system`,
            });
            item.itemPaymentStatus = "refunded";
          }
        }
        await wallet.save();
      }
      await order.save();
      console.log("Partial cancellation processed for order:", id);
      return res.json({
        message: order.items.every(
          (item) => item.cancelled || item.itemStatus === "cancelled"
        )
          ? "Order cancelled successfully"
          : "Selected products cancelled successfully",
        order: {
          _id: order._id,
          orderNumber: order.orderNumber,
          status: order.status, // summary only
          items: order.items,
          total: order.total,
          createdAt: order.createdAt, // <-- added
        },
      });
    }

    // Otherwise, cancel the whole order (legacy/summary)
    order.status = "cancelled";
    order.cancellationReason = reason || "";
    // Increment stock for all items
    for (const item of order.items) {
      if (!item.cancelled && item.itemStatus !== "cancelled") {
        await mongoose
          .model("ProductVariant")
          .findByIdAndUpdate(item.productVariantId, {
            $inc: { stock: item.quantity },
          });
        item.cancelled = true;
        item.cancellationReason = reason || "";
        item.itemStatus = "cancelled";
      }
    }
    // Refund for online/wallet payment
    if (
      (order.paymentMethod === "online" || order.paymentMethod === "wallet") &&
      ["paid", "pending"].includes(order.paymentStatus) &&
      order.paymentStatus !== "refunded"
    ) {
      const Wallet = mongoose.model("Wallet");
      let wallet = await Wallet.findOne({ user: order.user });
      if (!wallet) {
        wallet = await Wallet.create({ user: order.user });
      }
      wallet.balance += order.total;
      wallet.transactions.push({
        type: "credit",
        amount: order.total,
        description: `Refund for cancelled order ${
          order.orderNumber
        } (${order.paymentMethod.toUpperCase()}) - Refunded by system`,
      });
      await wallet.save();
      order.paymentStatus = "refunded";
    }
    await order.save();
    res.json({
      message: "Order cancelled successfully",
      order: {
        _id: order._id,
        orderNumber: order.orderNumber,
        status: order.status, // summary only
        items: order.items,
        total: order.total,
        createdAt: order.createdAt, // <-- added
      },
    });
  } catch (error) {
    res
      .status(500)
      .json({ message: `Internal Server Error: ${error.message}` });
  }
};

// Check COD availability
export const checkCODAvailability = async (req, res) => {
  try {
    const { state, total } = req.body;

    if (!state || !total) {
      return res.status(400).json({
        message: "State and total amount are required",
      });
    }

    const codRestrictedStates = [
      "Jammu & Kashmir",
      "Ladakh",
      "Arunachal Pradesh",
      "Manipur",
      "Mizoram",
      "Nagaland",
      "Tripura",
    ];

    const isLocationRestricted = codRestrictedStates.includes(state);
    const maxCodAmount = parseFloat(process.env.MAX_COD_AMOUNT) || 1000;
    const isAmountRestricted = total > maxCodAmount;

    const isAvailable = !isLocationRestricted && !isAmountRestricted;

    res.json({
      isAvailable,
      restrictions: {
        location: isLocationRestricted
          ? "COD not available in your location"
          : null,
        amount: isAmountRestricted
          ? `COD not available for orders above ₹${maxCodAmount.toLocaleString()}`
          : null,
      },
      message: isAvailable
        ? "Cash on Delivery is available for your order"
        : "Cash on Delivery is not available for your order",
    });
  } catch (error) {
    // console.error("Error checking COD availability:", error);
    res
      .status(500)
      .json({ message: `Internal Server Error: ${error.message}` });
  }
};

// Helper to compute adjusted total for each order
function computeAdjustedTotal(order) {
  const allItemsTotal = order.items.reduce(
    (sum, item) =>
      sum +
      (item.price * item.quantity -
        (item.offers
          ? item.offers.reduce((s, offer) => s + (offer.offerAmount || 0), 0)
          : 0)),
    0
  );
  const nonRefundedItemsTotal = order.items
    .filter((item) => item.itemPaymentStatus !== "refunded")
    .reduce(
      (sum, item) =>
        sum +
        (item.price * item.quantity -
          (item.offers
            ? item.offers.reduce((s, offer) => s + (offer.offerAmount || 0), 0)
            : 0)),
      0
    );
  const discount =
    order.discount && typeof order.discount === "object"
      ? Number(order.discount.discountAmount) || 0
      : typeof order.discount === "number"
      ? order.discount
      : 0;
  const proportionalDiscount =
    allItemsTotal > 0 ? (nonRefundedItemsTotal / allItemsTotal) * discount : 0;
  const shipping =
    typeof order.shipping === "number"
      ? order.shipping
      : typeof order.shippingCharge === "number"
      ? order.shippingCharge
      : 0;
  const adjustedTotal = Math.max(
    0,
    nonRefundedItemsTotal - proportionalDiscount + shipping
  );
  return adjustedTotal;
}

// Get all orders (admin)
export const getAllOrders = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const status = req.query.status;
    const search = req.query.search;
    const sortBy = req.query.sortBy || "createdAt";
    const sortOrder = req.query.sortOrder === "asc" ? 1 : -1;
    const paymentStatus = req.query.paymentStatus;
    const dateFrom = req.query.dateFrom;
    const dateTo = req.query.dateTo;

    // Build query object
    const query = {};
    if (status === "returned") {
      query.status = { $in: ["returned", "return_verified"] };
    } else if (status && status !== "all") {
      query.status = status;
    }
    if (paymentStatus && paymentStatus !== "all") {
      query.paymentStatus = paymentStatus;
    }
    if (dateFrom && dateTo) {
      query.createdAt = { $gte: new Date(dateFrom), $lte: new Date(dateTo) };
    } else if (dateFrom) {
      query.createdAt = { $gte: new Date(dateFrom) };
    } else if (dateTo) {
      query.createdAt = { $lte: new Date(dateTo) };
    }

    // Remove $or search filter from MongoDB query
    // (search will be handled in-memory after population)

    // Find orders with population
    let orders = await Order.find(query)
      .populate({
        path: "user",
        select: "username firstName lastName email address mobileNo",
      })
      .populate({
        path: "items.productVariantId",
        populate: {
          path: "product",
          select: "name brand mainImage",
        },
      })
      .sort({ [sortBy]: sortOrder });

    // In-memory search filter for all fields
    if (search && search.trim() !== "") {
      const searchTerm = search.trim();
      const regex = new RegExp(searchTerm, "i");

      orders = orders.filter((order) => {
        // Order number
        if (order.orderNumber && regex.test(order.orderNumber)) return true;

        // User fields
        if (order.user) {
          if (regex.test(order.user.firstName || "")) return true;
          if (regex.test(order.user.lastName || "")) return true;
          if (regex.test(order.user.username || "")) return true;
          if (regex.test(order.user.email || "")) return true;
        }

        // Product name in any item
        if (order.items && order.items.length > 0) {
          return order.items.some((item) => {
            const productName = item.productVariantId?.product?.name;
            return productName && regex.test(productName);
          });
        }

        return false;
      });
    }

    // Paginate after filtering
    const total = orders.length;
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;
    const paginatedOrders = orders.slice(startIndex, endIndex);

    // Add computedTotal, computedProportionalDiscount, and couponCode to each order
    const paginatedOrdersWithTotal = paginatedOrders.map((order) => {
      const o = order.toObject ? order.toObject() : order;
      // Compute proportional discount
      const allItemsTotal = o.items.reduce(
        (sum, item) =>
          sum +
          (item.price * item.quantity -
            (item.offers
              ? item.offers.reduce(
                  (s, offer) => s + (offer.offerAmount || 0),
                  0
                )
              : 0)),
        0
      );
      const nonRefundedItemsTotal = o.items
        .filter((item) => item.itemPaymentStatus !== "refunded")
        .reduce(
          (sum, item) =>
            sum +
            (item.price * item.quantity -
              (item.offers
                ? item.offers.reduce(
                    (s, offer) => s + (offer.offerAmount || 0),
                    0
                  )
                : 0)),
          0
        );
      const discount =
        o.discount && typeof o.discount === "object"
          ? Number(o.discount.discountAmount) || 0
          : typeof o.discount === "number"
          ? o.discount
          : 0;
      const proportionalDiscount =
        allItemsTotal > 0
          ? (nonRefundedItemsTotal / allItemsTotal) * discount
          : 0;
      // Extract coupon code
      let couponCode = undefined;
      if (o.discount && typeof o.discount === "object") {
        couponCode =
          o.discount.code ||
          o.discount.discountName ||
          o.discount.name ||
          undefined;
      }
      return {
        ...o,
        computedTotal: computeAdjustedTotal(o),
        computedProportionalDiscount: proportionalDiscount,
        couponCode,
      };
    });

    // Calculate summary for all filtered (not paginated) orders
    const summary = {
      salesCount: total,
      orderAmount: orders.reduce((sum, order) => sum + (order.total || 0), 0),
      discount: orders.reduce((sum, order) => {
        if (order.discount && typeof order.discount === "object") {
          return sum + (Number(order.discount.discountAmount) || 0);
        } else if (typeof order.discount === "number") {
          return sum + order.discount;
        }
        return sum;
      }, 0),
    };

    const totalPages = Math.ceil(total / limit) || 1;

    res.json({
      orders: paginatedOrdersWithTotal,
      total,
      page,
      totalPages,
      summary,
    });
  } catch (error) {
    res
      .status(500)
      .json({ message: `Internal Server Error: ${error.message}` });
  }
};

// Update order status
export const updateOrderStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    const order = await Order.findById(id);
    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }
    order.status = status;
    await order.save();
    res.json({ message: "Order status updated", order });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Update payment status
export const updatePaymentStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { paymentStatus } = req.body;

    const order = await Order.findById(id);
    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    // Validate payment status
    const validPaymentStatuses = ["pending", "paid", "failed", "refunded"];
    if (!validPaymentStatuses.includes(paymentStatus)) {
      return res.status(400).json({ message: "Invalid payment status" });
    }

    // Only allow payment status updates for COD orders
    if (order.paymentMethod !== "cod") {
      return res.status(400).json({
        message: "Payment status can only be updated for COD orders",
      });
    }

    order.paymentStatus = paymentStatus;
    await order.save();

    res.json({
      message: "Payment status updated successfully",
      order,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Update online payment status
export const updateOnlinePaymentStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { paymentStatus } = req.body;
    const order = await Order.findById(id);
    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }
    if (order.paymentMethod !== "online") {
      return res
        .status(400)
        .json({ message: "Only online payment orders can be updated here" });
    }
    if (order.paymentStatus !== "failed") {
      return res
        .status(400)
        .json({ message: "Only failed payment orders can be retried" });
    }
    if (paymentStatus !== "paid") {
      return res
        .status(400)
        .json({ message: "Can only update paymentStatus to 'paid'" });
    }
    // Decrement stock if not already decremented
    for (const item of order.items) {
      if (item.itemPaymentStatus !== "paid") {
        await mongoose
          .model("ProductVariant")
          .findByIdAndUpdate(item.productVariantId, {
            $inc: { stock: -item.quantity },
          });
        item.itemPaymentStatus = "paid";
      }
    }
    order.paymentStatus = "paid";
    await order.save();
    res.json({ message: "Payment status updated to paid", order });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Delete order
export const deleteOrder = async (req, res) => {
  try {
    const { id } = req.params;
    const order = await Order.findByIdAndDelete(id);
    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }
    res.json({ message: "Order deleted successfully" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Return order (per-item)
export const returnOrder = async (req, res) => {
  try {
    const { id } = req.params;
    const { items } = req.body; // [{ productVariantId, reason }]
    if (!Array.isArray(items) || items.length === 0) {
      return res
        .status(400)
        .json({ message: "No items specified for return." });
    }
    const order = await Order.findById(id);
    if (!order) {
      return res.status(404).json({ message: "Order not found." });
    }
    // Allow per-item return if itemStatus === 'delivered'
    let anyReturned = false;
    for (const reqItem of items) {
      const item = order.items.find(
        (i) => i.productVariantId.toString() === reqItem.productVariantId
      );
      if (item && !item.returned && item.itemStatus === "delivered") {
        item.returned = true;
        item.returnReason = reqItem.reason || "";
        item.itemStatus = "returned"; // Set per-item status only
        anyReturned = true;
      }
    }
    if (!anyReturned) {
      return res.status(400).json({
        message:
          "No valid items to return. Only delivered, non-returned items can be returned.",
      });
    }
    // If all items are returned, set order.status = 'returned' (summary only)
    if (
      order.items.every(
        (item) => item.itemStatus === "returned" || item.returned
      )
    ) {
      order.status = "returned";
    }
    await order.save();
    res.json({ message: "Order return requested successfully.", order });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Verify return request
export const verifyReturnRequest = async (req, res) => {
  try {
    const { id } = req.params;
    const order = await Order.findById(id);
    if (!order) {
      return res.status(404).json({ message: "Order not found." });
    }
    if (order.status !== "returned") {
      return res.status(400).json({
        message: 'Only orders with status "returned" can be verified.',
      });
    }
    // Check if order is eligible for refund
    const isEligibleForRefund =
      ((order.paymentMethod === "online" || order.paymentMethod === "wallet") &&
        (order.paymentStatus === "paid" ||
          order.paymentStatus === "pending")) ||
      order.paymentMethod === "cod";
    let refundAmount = 0;
    // Calculate refund as sum of returned items only
    refundAmount = order.items
      .filter((item) => item.returned)
      .reduce((sum, item) => sum + item.price * item.quantity, 0);
    if (isEligibleForRefund && refundAmount > 0) {
      // Import Wallet model
      const Wallet = mongoose.model("Wallet");
      // Find or create user's wallet
      let wallet = await Wallet.findOne({ user: order.user });
      if (!wallet) {
        wallet = await Wallet.create({ user: order.user });
      }
      // Add refund amount to wallet
      wallet.balance += refundAmount;
      wallet.transactions.push({
        type: "credit",
        amount: refundAmount,
        description: `Refund for order ${
          order.orderNumber
        } (${order.paymentMethod.toUpperCase()}) - Return verified by admin (partial refund)`,
      });
      await wallet.save();
      // Update order payment status to refunded
      order.paymentStatus = "refunded";
    }
    order.status = "return_verified";
    order.returnVerifiedBy = req.user.userId;
    order.returnVerifiedAt = new Date();
    await order.save();
    res.json({
      message: "Return request verified successfully.",
      order,
      refundProcessed: order.paymentStatus === "refunded",
      refundAmount,
    });
  } catch (error) {
    // console.error('Error in verifyReturnRequest:', error);
    res.status(500).json({ message: error.message });
  }
};

// Reject return request
export const rejectReturnRequest = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    const order = await Order.findById(id);
    if (!order) {
      return res.status(404).json({ message: "Order not found." });
    }

    if (order.status !== "returned") {
      return res.status(400).json({
        message: 'Only orders with status "returned" can be rejected.',
      });
    }

    order.status = "rejected";
    order.returnVerifiedBy = req.user.userId;
    order.returnVerifiedAt = new Date();
    order.cancellationReason = reason || "Return request rejected by admin";

    await order.save();

    res.json({
      message: "Return request rejected successfully.",
      order,
    });
  } catch (error) {
    // console.error('Error in rejectReturnRequest:', error);
    res.status(500).json({ message: error.message });
  }
};

// Verify return request without refund
export const verifyReturnWithoutRefund = async (req, res) => {
  try {
    const { id } = req.params;
    const order = await Order.findById(id);
    if (!order) {
      return res.status(404).json({ message: "Order not found." });
    }

    if (order.status !== "returned") {
      return res.status(400).json({
        message: 'Only orders with status "returned" can be verified.',
      });
    }

    order.status = "return_verified";
    order.returnVerifiedBy = req.user.userId;
    order.returnVerifiedAt = new Date();
    await order.save();

    res.json({
      message: "Return request verified successfully without refund.",
      order,
      refundProcessed: false,
    });
  } catch (error) {
    // console.error('Error in verifyReturnWithoutRefund:', error);
    res.status(500).json({ message: error.message });
  }
};

// Update order item status (per-item)
export const updateOrderItemStatus = async (req, res) => {
  try {
    const { orderId, itemId } = req.params;
    const { status, paymentStatus } = req.body;
    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({ message: "Order not found." });
    }
    const item = order.items.id(itemId);
    if (!item) {
      return res.status(404).json({ message: "Order item not found." });
    }
    // Only update fields that are present in the request
    if (typeof status !== "undefined") {
      item.itemStatus = status;
    }
    if (typeof paymentStatus !== "undefined") {
      // Wallet refund for per-item refund (COD, online, or wallet)
      if (
        paymentStatus === "refunded" &&
        item.itemPaymentStatus !== "refunded" &&
        (order.paymentMethod === "cod" ||
          order.paymentMethod === "online" ||
          order.paymentMethod === "wallet")
      ) {
        const Wallet = mongoose.model("Wallet");
        let wallet = await Wallet.findOne({ user: order.user });
        if (!wallet) {
          wallet = await Wallet.create({ user: order.user });
        }
        let refundAmount = item.price * item.quantity;
        const totalOrderItems =
          order.items.reduce((sum, i) => sum + i.price * i.quantity, 0) || 1;
        let itemDiscount = 0;
        if (order.discount && order.discount.discountAmount > 0) {
          itemDiscount =
            (refundAmount / totalOrderItems) * order.discount.discountAmount;
        }
        let itemOffer = 0;
        if (order.offers && order.offers.length > 0) {
          const totalOffer = order.offers.reduce(
            (sum, offer) => sum + (offer.offerAmount || 0),
            0
          );
          itemOffer = (refundAmount / totalOrderItems) * totalOffer;
        }
        let itemShipping = 0;
        if (order.shipping && order.items.length > 0) {
          itemShipping = order.shipping / order.items.length;
        }
        refundAmount = Math.max(
          0,
          refundAmount - itemDiscount - itemOffer + itemShipping
        );
        wallet.balance += refundAmount;
        wallet.transactions.push({
          type: "credit",
          amount: refundAmount,
          description: `Refund for item in order ${
            order.orderNumber
          } (${order.paymentMethod.toUpperCase()}) - Refunded by admin`,
        });
        await wallet.save();
      }
      item.itemPaymentStatus = paymentStatus;
    }
    // If all items are delivered, set order.status = 'delivered' (summary only)
    if (
      order.items.length > 0 &&
      order.items.every((i) => i.itemStatus === "delivered")
    ) {
      order.status = "delivered";
    }
    await order.save();
    res.json({ message: "Order item status/payment status updated", order });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Check stock for all items in an order before payment
export const checkOrderStock = async (req, res) => {
  try {
    const { items } = req.body;
    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: "No items provided" });
    }
    for (const item of items) {
      const productVariant = await mongoose
        .model("ProductVariant")
        .findById(item.productVariantId);
      if (!productVariant) {
        return res.status(400).json({
          message: `Product variant not found for item: ${item.productVariantId}`,
        });
      }
      if (productVariant.stock < item.quantity) {
        return res.status(400).json({
          message: `Insufficient stock for ${productVariant.colour || ""} ${
            productVariant.capacity || ""
          }. Only ${productVariant.stock} left.`,
          productVariantId: item.productVariantId,
        });
      }
    }
    return res
      .status(200)
      .json({ success: true, message: "All items in stock" });
  } catch (error) {
    console.error("Error checking order stock:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};
