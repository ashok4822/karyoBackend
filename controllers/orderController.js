import Order from "../models/orderModel.js";
import Discount from "../models/discountModel.js";
import UserDiscountUsage from "../models/userDiscountUsageModel.js";
import mongoose from "mongoose";

// Create a new order
export const createOrder = async (req, res) => {
  console.log("createOrder called", req.body, req.user);
  try {
    const {
      items,
      shippingAddress,
      paymentMethod,
      subtotal,
      subtotalAfterDiscount,
      discount,
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

    if (!paymentMethod || !["cod", "online"].includes(paymentMethod)) {
      return res
        .status(400)
        .json({ message: "Valid payment method is required" });
    }

    // Validate discount if provided
    if (discount && discount.discountId) {
      const discountDoc = await Discount.findById(discount.discountId);
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
      console.log("userId:", req.user.userId);
      const userUsage = await UserDiscountUsage.getOrCreate(
        req.user.userId,
        discount.discountId
      );
      if (!userUsage.canUseDiscount(discountDoc)) {
        return res.status(400).json({
          message: `You have reached your personal usage limit for this discount`,
        });
      }

      // Update global discount usage count
      discountDoc.usageCount += 1;
      await discountDoc.save();

      // Update user-specific usage count
      await userUsage.incrementUsage();
    }

    // COD-specific validations
    if (paymentMethod === "cod") {
      // Check if COD is available for the order amount
      if (total > 5000) {
        return res.status(400).json({
          message:
            "Cash on Delivery is not available for orders above ₹5,000. Please use online payment.",
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

    // Create the order
    const order = new Order({
      user: req.user.userId,
      items,
      shippingAddress,
      paymentMethod,
      subtotal,
      subtotalAfterDiscount,
      discount,
      shipping,
      total,
    });

    await order.save();

    // Decrement stock for each ordered product variant
    for (const item of items) {
      await mongoose.model("ProductVariant").findByIdAndUpdate(
        item.productVariantId,
        { $inc: { stock: -item.quantity } }
      );
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
        discount: order.discount,
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
    console.error("Error creating order:", error);
    if (error.stack) console.error(error.stack);
    res
      .status(500)
      .json({ message: `Internal Server Error: ${error.message}` });
  }
};

// Get user's orders
export const getUserOrders = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const status = req.query.status; // optional filter

    const query = { user: req.user.userId };

    if (status && status !== "all") {
      query.status = status;
    }

    const total = await Order.countDocuments(query);
    const orders = await Order.find(query)
      .populate({
        path: "items.productVariantId",
        populate: {
          path: "product",
          select: "name brand",
        },
      })
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit);

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

    res.json({ order });
  } catch (error) {
    console.error("Error getting order:", error);
    res
      .status(500)
      .json({ message: `Internal Server Error: ${error.message}` });
  }
};

// Get order by ID (admin)
export const getOrderByIdForAdmin = async (req, res) => {
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
          select: "name brand",
        },
      });
    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }
    // Compose payment object for frontend compatibility
    const payment = {
      method: order.paymentMethod || '-',
      status: order.paymentStatus || 'pending',
      transactionId: order.transactionId || '-',
    };
    // Compose shipping object with only status
    const shipping = {
      status: order.status || '-',
    };
    // Preserve original fields for backend compatibility
    const orderData = {
      ...order.toObject(),
      payment,
      shipping,
      paymentMethod: order.paymentMethod,
      paymentStatus: order.paymentStatus
    };
    res.json({ order: orderData });
  } catch (error) {
    console.error("Error getting order (admin):", error);
    res.status(500).json({ message: `Internal Server Error: ${error.message}` });
  }
};

// Cancel order
export const cancelOrder = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason, productVariantIds } = req.body;
    const order = await Order.findOne({ _id: id, user: req.user.userId });

    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    // Only allow cancellation of pending orders
    if (order.status !== "pending") {
      return res.status(400).json({
        message: "Only pending orders can be cancelled",
      });
    }

    // If productVariantIds provided, cancel specific products
    if (Array.isArray(productVariantIds) && productVariantIds.length > 0) {
      let anyCancelled = false;
      for (const item of order.items) {
        if (
          productVariantIds.includes(item.productVariantId.toString()) &&
          !item.cancelled
        ) {
          item.cancelled = true;
          item.cancellationReason = reason || "";
          // Increment stock for the product variant
          await mongoose.model("ProductVariant").findByIdAndUpdate(
            item.productVariantId,
            { $inc: { stock: item.quantity } }
          );
          anyCancelled = true;
        }
      }
      if (!anyCancelled) {
        return res.status(400).json({ message: "No valid items to cancel." });
      }
      // If all items are now cancelled, set order status to cancelled
      if (order.items.every((item) => item.cancelled)) {
        order.status = "cancelled";
        order.cancellationReason = reason || "";
      }
      await order.save();
      return res.json({
        message:
          order.status === "cancelled"
            ? "Order cancelled successfully"
            : "Selected products cancelled successfully",
        order: {
          _id: order._id,
          orderNumber: order.orderNumber,
          status: order.status,
          items: order.items,
          total: order.total,
        },
      });
    }

    // Otherwise, cancel the whole order
    order.status = "cancelled";
    order.cancellationReason = reason || "";
    // Increment stock for all items
    for (const item of order.items) {
      if (!item.cancelled) {
        await mongoose.model("ProductVariant").findByIdAndUpdate(
          item.productVariantId,
          { $inc: { stock: item.quantity } }
        );
        item.cancelled = true;
        item.cancellationReason = reason || "";
      }
    }
    await order.save();
    res.json({
      message: "Order cancelled successfully",
      order: {
        _id: order._id,
        orderNumber: order.orderNumber,
        status: order.status,
        items: order.items,
        total: order.total,
      },
    });
  } catch (error) {
    console.error("Error cancelling order:", error);
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
    const isAmountRestricted = total > 5000;

    const isAvailable = !isLocationRestricted && !isAmountRestricted;

    res.json({
      isAvailable,
      restrictions: {
        location: isLocationRestricted
          ? "COD not available in your location"
          : null,
        amount: isAmountRestricted
          ? "COD not available for orders above ₹5,000"
          : null,
      },
      message: isAvailable
        ? "Cash on Delivery is available for your order"
        : "Cash on Delivery is not available for your order",
    });
  } catch (error) {
    console.error("Error checking COD availability:", error);
    res
      .status(500)
      .json({ message: `Internal Server Error: ${error.message}` });
  }
};

// Get all orders (admin)
export const getAllOrders = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const status = req.query.status; // optional filter

    const query = {};
    if (status && status !== "all") {
      query.status = status;
    }

    const total = await Order.countDocuments(query);
    const orders = await Order.find(query)
      .populate({
        path: "user",
        select: "username firstName lastName email",
      })
      .populate({
        path: "items.productVariantId",
        populate: {
          path: "product",
          select: "name brand",
        },
      })
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit);

    res.json({
      orders,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error) {
    console.error("Error getting all orders:", error);
    res.status(500).json({ message: `Internal Server Error: ${error.message}` });
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

// Return order
export const returnOrder = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    if (!reason || !reason.trim()) {
      return res.status(400).json({ message: 'Reason for return is required.' });
    }
    const order = await Order.findById(id);
    if (!order) {
      return res.status(404).json({ message: 'Order not found.' });
    }
    if (order.status !== 'delivered') {
      return res.status(400).json({ message: 'Only delivered orders can be returned.' });
    }
    order.status = 'returned';
    order.cancellationReason = reason;
    await order.save();
    res.json({ message: 'Order return requested successfully.', order });
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
      return res.status(404).json({ message: 'Order not found.' });
    }
    
    if (order.status !== 'returned') {
      return res.status(400).json({ message: 'Only orders with status "returned" can be verified.' });
    }
    
    // Check if order is eligible for refund
    // For online payments: both 'paid' and 'pending' status are eligible
    // For COD payments: all statuses are eligible since payment was made in cash
    const isEligibleForRefund = (
      (order.paymentMethod === 'online' && (order.paymentStatus === 'paid' || order.paymentStatus === 'pending')) ||
      (order.paymentMethod === 'cod')
    );
    
    if (isEligibleForRefund) {
      // Import Wallet model
      const Wallet = mongoose.model('Wallet');
      
      // Find or create user's wallet
      let wallet = await Wallet.findOne({ user: order.user });
      if (!wallet) {
        wallet = await Wallet.create({ user: order.user });
      }
      
      // Add refund amount to wallet
      wallet.balance += order.total;
      wallet.transactions.push({
        type: 'credit',
        amount: order.total,
        description: `Refund for order ${order.orderNumber} (${order.paymentMethod.toUpperCase()}) - Return verified by admin`
      });
      await wallet.save();
      
      // Update order payment status to refunded
      order.paymentStatus = 'refunded';
    }
    
    order.status = 'return_verified';
    order.returnVerifiedBy = req.user.userId;
    order.returnVerifiedAt = new Date();
    await order.save();
    
    res.json({ 
      message: 'Return request verified successfully.', 
      order,
      refundProcessed: order.paymentStatus === 'refunded'
    });
  } catch (error) {
    console.error('Error in verifyReturnRequest:', error);
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
      return res.status(404).json({ message: 'Order not found.' });
    }
    
    if (order.status !== 'returned') {
      return res.status(400).json({ message: 'Only orders with status "returned" can be rejected.' });
    }
    
    order.status = 'rejected';
    order.returnVerifiedBy = req.user.userId;
    order.returnVerifiedAt = new Date();
    order.cancellationReason = reason || 'Return request rejected by admin';
    
    await order.save();
    
    res.json({ 
      message: 'Return request rejected successfully.', 
      order
    });
  } catch (error) {
    console.error('Error in rejectReturnRequest:', error);
    res.status(500).json({ message: error.message });
  }
};

// Verify return request without refund
export const verifyReturnWithoutRefund = async (req, res) => {
  try {
    const { id } = req.params;
    const order = await Order.findById(id);
    if (!order) {
      return res.status(404).json({ message: 'Order not found.' });
    }
    
    if (order.status !== 'returned') {
      return res.status(400).json({ message: 'Only orders with status "returned" can be verified.' });
    }
    
    order.status = 'return_verified';
    order.returnVerifiedBy = req.user.userId;
    order.returnVerifiedAt = new Date();
    await order.save();
    
    res.json({ 
      message: 'Return request verified successfully without refund.', 
      order,
      refundProcessed: false
    });
  } catch (error) {
    console.error('Error in verifyReturnWithoutRefund:', error);
    res.status(500).json({ message: error.message });
  }
};
