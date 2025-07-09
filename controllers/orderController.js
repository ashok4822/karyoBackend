import Order from "../models/orderModel.js";
import Discount from "../models/discountModel.js";
import UserDiscountUsage from "../models/userDiscountUsageModel.js";
import mongoose from "mongoose";

// Create a new order
export const createOrder = async (req, res) => {
  // console.log("createOrder called", req.body, req.user);
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
      // console.log("userId:", req.user.userId);
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
      if (total > 50000) {
        return res.status(400).json({
          message:
            "Cash on Delivery is not available for orders above ₹50,000. Please use online payment.",
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
    // console.error("Error creating order:", error);
    if (error.stack) // console.error(error.stack);
    res
      .status(500)
      .json({ message: `Internal Server Error: ${error.message}` });
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

    // Add search filter for orderNumber or recipientName (case-insensitive, partial match)
    if (search && search.trim() !== "") {
      const searchRegex = new RegExp(search.trim(), "i");
      query.$or = [
        { orderNumber: searchRegex },
        { "shippingAddress.recipientName": searchRegex }
      ];
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
    // console.error("Error getting user orders:", error);
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
    // console.error("Error getting order:", error);
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
    // console.error("Error getting order (admin):", error);
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
    // console.error("Error cancelling order:", error);
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
    const isAmountRestricted = total > 50000;

    const isAvailable = !isLocationRestricted && !isAmountRestricted;

    res.json({
      isAvailable,
      restrictions: {
        location: isLocationRestricted
          ? "COD not available in your location"
          : null,
        amount: isAmountRestricted
          ? "COD not available for orders above ₹50,000"
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

// Get all orders (admin)
export const getAllOrders = async (req, res) => {
  try {
    // console.log('getAllOrders req.query:', req.query); // Debug log removed
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const status = req.query.status; // optional filter
    const search = req.query.search; // new search parameter
    const date = req.query.date; // new date filter
    const sortBy = req.query.sortBy || 'createdAt'; // sorting field
    const sortOrder = req.query.sortOrder || 'desc'; // sorting direction

    const query = {};
    if (status === 'returned') {
      query.status = { $in: ['returned', 'return_verified'] };
    } else if (status && status !== "all") {
      query.status = status;
    }

    // Date filter (expects YYYY-MM-DD)
    if (date) {
      const start = new Date(date);
      const end = new Date(date);
      end.setHours(23, 59, 59, 999);
      start.setHours(0, 0, 0, 0);
      query.createdAt = { $gte: start, $lte: end };
    }

    // If search is provided, build $or for orderNumber and user fields
    let userMatch = {};
    if (search && search.trim() !== "") {
      const searchRegex = new RegExp(search.trim(), "i");
      query.$or = [
        { orderNumber: searchRegex },
      ];
      // We'll filter by user fields after population
      userMatch = {
        $or: [
          { "user.firstName": searchRegex },
          { "user.lastName": searchRegex },
          { "user.username": searchRegex },
          { "user.email": searchRegex },
        ],
      };
    }

    // Count total (with search)
    let total;
    // Build sort object
    const sortObject = {};
    sortObject[sortBy] = sortOrder === 'asc' ? 1 : -1;
    
    let ordersQuery = Order.find(query)
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
      .sort(sortObject)
      .skip((page - 1) * limit)
      .limit(limit);

    let orders = await ordersQuery;

    // If searching by user fields, filter in-memory after population
    if (search && search.trim() !== "") {
      orders = orders.filter(order => {
        // Check orderNumber match (already in query, but keep for safety)
        if (order.orderNumber && order.orderNumber.match(new RegExp(search.trim(), "i"))) {
          return true;
        }
        // Check user fields
        if (order.user) {
          const { firstName, lastName, username, email } = order.user;
          return (
            (firstName && firstName.match(new RegExp(search.trim(), "i"))) ||
            (lastName && lastName.match(new RegExp(search.trim(), "i"))) ||
            (username && username.match(new RegExp(search.trim(), "i"))) ||
            (email && email.match(new RegExp(search.trim(), "i")))
          );
        }
        return false;
      });
      // For pagination, get total count with same filter
      total = orders.length;
      // Paginate filtered results
      orders = orders.slice(0, limit);
    } else {
      total = await Order.countDocuments(query);
    }

    res.json({
      orders,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error) {
    // console.error("Error getting all orders:", error);
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
        message: "Payment status can only be updated for COD orders" 
      });
    }
    
    order.paymentStatus = paymentStatus;
    await order.save();
    
    res.json({ 
      message: "Payment status updated successfully", 
      order 
    });
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
    const { items } = req.body; // [{ productVariantId, reason }]
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: 'No items specified for return.' });
    }
    const order = await Order.findById(id);
    if (!order) {
      return res.status(404).json({ message: 'Order not found.' });
    }
    // Remove order.status check; allow per-item return if itemStatus === 'delivered'
    let anyReturned = false;
    for (const reqItem of items) {
      const item = order.items.find(i => i.productVariantId.toString() === reqItem.productVariantId);
      if (item && !item.returned && item.itemStatus === 'delivered') {
        item.returned = true;
        item.returnReason = reqItem.reason || '';
        anyReturned = true;
      }
    }
    if (!anyReturned) {
      return res.status(400).json({ message: 'No valid items to return. Only delivered, non-returned items can be returned.' });
    }
    order.status = 'returned';
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
    const isEligibleForRefund = (
      (order.paymentMethod === 'online' && (order.paymentStatus === 'paid' || order.paymentStatus === 'pending')) ||
      (order.paymentMethod === 'cod')
    );
    let refundAmount = 0;
    // Calculate refund as sum of returned items only
    refundAmount = order.items
      .filter(item => item.returned)
      .reduce((sum, item) => sum + (item.price * item.quantity), 0);
    if (isEligibleForRefund && refundAmount > 0) {
      // Import Wallet model
      const Wallet = mongoose.model('Wallet');
      // Find or create user's wallet
      let wallet = await Wallet.findOne({ user: order.user });
      if (!wallet) {
        wallet = await Wallet.create({ user: order.user });
      }
      // Add refund amount to wallet
      wallet.balance += refundAmount;
      wallet.transactions.push({
        type: 'credit',
        amount: refundAmount,
        description: `Refund for order ${order.orderNumber} (${order.paymentMethod.toUpperCase()}) - Return verified by admin (partial refund)`
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
      refundProcessed: order.paymentStatus === 'refunded',
      refundAmount
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
    // console.error('Error in verifyReturnWithoutRefund:', error);
    res.status(500).json({ message: error.message });
  }
};

// Add per-item status update controller
export const updateOrderItemStatus = async (req, res) => {
  try {
    const { orderId, itemId } = req.params;
    const { status, paymentStatus } = req.body;
    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({ message: 'Order not found.' });
    }
    const item = order.items.id(itemId);
    if (!item) {
      return res.status(404).json({ message: 'Order item not found.' });
    }
    // Only update fields that are present in the request
    if (typeof status !== 'undefined') {
      item.itemStatus = status;
    }
    if (typeof paymentStatus !== 'undefined') {
      // Wallet refund for COD per-item refund
      if (
        paymentStatus === 'refunded' &&
        item.itemPaymentStatus !== 'refunded' &&
        order.paymentMethod === 'cod'
      ) {
        // Import Wallet model
        const Wallet = mongoose.model('Wallet');
        // Find or create user's wallet
        let wallet = await Wallet.findOne({ user: order.user });
        if (!wallet) {
          wallet = await Wallet.create({ user: order.user });
        }
        // Calculate refund amount for this item
        let refundAmount = item.price * item.quantity;
        // Deduct proportional discount if any
        if (order.discount && order.discount.discountAmount > 0) {
          // Calculate total of all non-cancelled items
          const totalNonCancelled = order.items
            .filter(i => !i.cancelled)
            .reduce((sum, i) => sum + (i.price * i.quantity), 0);
          // Proportional discount for this item
          const itemDiscount = (refundAmount / totalNonCancelled) * order.discount.discountAmount;
          refundAmount = Math.max(0, refundAmount - itemDiscount);
        }
        wallet.balance += refundAmount;
        wallet.transactions.push({
          type: 'credit',
          amount: refundAmount,
          description: `Refund for item in order ${order.orderNumber} (COD) - Refunded by admin`
        });
        await wallet.save();
      }
      item.itemPaymentStatus = paymentStatus;
    }

    // If all items are delivered, set order.status = 'delivered'
    if (order.items.length > 0 && order.items.every(i => i.itemStatus === 'delivered')) {
      order.status = 'delivered';
    }

    await order.save();
    res.json({ message: 'Order item status/payment status updated', order });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
