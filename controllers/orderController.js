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

    if (!paymentMethod || !["cod", "online"].includes(paymentMethod)) {
      return res
        .status(400)
        .json({ message: "Valid payment method is required" });
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
          $inc: { usageCount: 1 }
        });
      }
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
    console.log("Received offers in order:", offers);
    // Set per-item payment status for online payments
    const itemsWithPaymentStatus = items.map(item => ({
      ...item,
      itemPaymentStatus: paymentMethod === "online" ? "paid" : "pending"
    }));
    const order = new Order({
      user: req.user.userId,
      items: itemsWithPaymentStatus,
      shippingAddress,
      paymentMethod,
      subtotal,
      subtotalAfterDiscount,
      discount,
      offers, // <-- this is now included
      shipping,
      total,
      paymentStatus: paymentMethod === "online" ? "paid" : "pending",
    });
    await order.save();
    console.log("Saved order offers:", order.offers);

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
    res.status(500).json({ message: "Failed to create Razorpay order", error: error.message });
  }
};

// Verify Razorpay payment signature
export const verifyRazorpayPayment = async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
    const sign = `${razorpay_order_id}|${razorpay_payment_id}`;
    const expectedSignature = crypto.createHmac("sha256", process.env.RAZOR_SECRET_ID)
      .update(sign)
      .digest("hex");
    if (expectedSignature === razorpay_signature) {
      res.status(200).json({ success: true, message: "Payment verified" });
    } else {
      res.status(400).json({ success: false, message: "Invalid signature" });
    }
  } catch (error) {
    res.status(500).json({ message: "Failed to verify payment", error: error.message });
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
      allOrders = allOrders.filter(order => {
        // Check orderNumber
        if (order.orderNumber && order.orderNumber.toLowerCase().includes(searchTerm)) {
          return true;
        }
        
        // Check recipientName
        if (order.shippingAddress && order.shippingAddress.recipientName && 
            order.shippingAddress.recipientName.toLowerCase().includes(searchTerm)) {
          return true;
        }
        
        // Check product names
        if (order.items && order.items.length > 0) {
          return order.items.some(item => {
            const product = item.productVariantId?.product;
            return product && product.name && product.name.toLowerCase().includes(searchTerm);
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

    res.json({ 
      order: {
        ...order.toObject(),
        offers: order.offers
      }
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
          item.itemStatus !== 'cancelled'
        ) {
          item.cancelled = true;
          item.cancellationReason = reason || "";
          item.itemStatus = 'cancelled'; // Set per-item status only
          // Increment stock for the product variant
          await mongoose.model("ProductVariant").findByIdAndUpdate(
            item.productVariantId,
            { $inc: { stock: item.quantity } }
          );
          anyCancelled = true;
        }
      }
      if (!anyCancelled) {
        console.log("No valid items to cancel for order:", id);
        return res.status(400).json({ message: "No valid items to cancel." });
      }
      // If all items are now cancelled, set order.status to cancelled (summary only)
      if (order.items.every((item) => item.cancelled || item.itemStatus === 'cancelled')) {
        order.status = "cancelled";
        order.cancellationReason = reason || "";
      }
      // Refund for partial cancellation in online payment orders
      if (order.paymentMethod === "online") {
        const Wallet = mongoose.model('Wallet');
        let wallet = await Wallet.findOne({ user: order.user });
        if (!wallet) {
          wallet = await Wallet.create({ user: order.user });
        }
        // Calculate total of all items (avoid division by zero)
        const totalOrderItems = order.items.reduce((sum, i) => sum + (i.price * i.quantity), 0) || 1;
        // For each newly cancelled item, refund proportional amount
        for (const item of order.items) {
          if (productVariantIds.includes(item.productVariantId.toString()) && item.cancelled && item.itemPaymentStatus !== 'refunded') {
            let refundAmount = item.price * item.quantity;
            // Proportional discount
            let itemDiscount = 0;
            if (order.discount && order.discount.discountAmount > 0) {
              itemDiscount = (refundAmount / totalOrderItems) * order.discount.discountAmount;
            }
            // Proportional offer
            let itemOffer = 0;
            if (order.offers && order.offers.length > 0) {
              const totalOffer = order.offers.reduce((sum, offer) => sum + (offer.offerAmount || 0), 0);
              itemOffer = (refundAmount / totalOrderItems) * totalOffer;
            }
            // Proportional shipping
            let itemShipping = 0;
            if (order.shipping && order.items.length > 0) {
              itemShipping = order.shipping / order.items.length;
            }
            refundAmount = Math.max(0, refundAmount - itemDiscount - itemOffer + itemShipping);
            wallet.balance += refundAmount;
            wallet.transactions.push({
              type: 'credit',
              amount: refundAmount,
              description: `Refund for cancelled product in order ${order.orderNumber} (ONLINE) - Refunded by system`
            });
            item.itemPaymentStatus = 'refunded';
          }
        }
        await wallet.save();
      }
      await order.save();
      console.log("Partial cancellation processed for order:", id);
      return res.json({
        message:
          order.items.every((item) => item.cancelled || item.itemStatus === 'cancelled')
            ? "Order cancelled successfully"
            : "Selected products cancelled successfully",
        order: {
          _id: order._id,
          orderNumber: order.orderNumber,
          status: order.status, // summary only
          items: order.items,
          total: order.total,
        },
      });
    }

    // Otherwise, cancel the whole order (legacy/summary)
    order.status = "cancelled";
    order.cancellationReason = reason || "";
    // Increment stock for all items
    for (const item of order.items) {
      if (!item.cancelled && item.itemStatus !== 'cancelled') {
        await mongoose.model("ProductVariant").findByIdAndUpdate(
          item.productVariantId,
          { $inc: { stock: item.quantity } }
        );
        item.cancelled = true;
        item.cancellationReason = reason || "";
        item.itemStatus = 'cancelled';
      }
    }
    // Refund for online payment
    if (order.paymentMethod === "online" && order.paymentStatus !== "refunded") {
      const Wallet = mongoose.model('Wallet');
      let wallet = await Wallet.findOne({ user: order.user });
      if (!wallet) {
        wallet = await Wallet.create({ user: order.user });
      }
      wallet.balance += order.total;
      wallet.transactions.push({
        type: 'credit',
        amount: order.total,
        description: `Refund for cancelled order ${order.orderNumber} (ONLINE) - Refunded by system`
      });
      await wallet.save();
      order.paymentStatus = 'refunded';
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
    console.log('getAllOrders req.query:', req.query);
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

    // We'll do all search filtering in memory after population
    // This allows us to search across order numbers, customer names, and product names
    const searchTerm = search && search.trim() !== "" ? search.trim() : null;
    if (searchTerm) {
      console.log('Search term:', searchTerm);
    }

    // Count total (with search)
    let total;
    // Build sort object
    const sortObject = {};
    sortObject[sortBy] = sortOrder === 'asc' ? 1 : -1;
    
    console.log('Order query:', JSON.stringify(query, null, 2));
    console.log('Sort object:', JSON.stringify(sortObject, null, 2));
    
    let ordersQuery = Order.find(query)
      .populate({
        path: "user",
        select: "username firstName lastName email",
      })
      .populate({
        path: "items.productVariantId",
        populate: {
          path: "product",
          select: "name brand mainImage",
        },
      })
      .sort(sortObject)
      .skip((page - 1) * limit)
      .limit(limit);

    let orders = await ordersQuery;
    
    // Debug: Check total orders in database
    const totalOrdersInDB = await Order.countDocuments({});
    console.log('Total orders in database:', totalOrdersInDB);

    // If searching, we need to fetch all orders and filter them
    if (searchTerm) {
      console.log('Searching for:', searchTerm);
      
      // Fetch all orders without pagination for search
      const allOrdersQuery = Order.find(query)
        .populate({
          path: "user",
          select: "username firstName lastName email",
        })
        .populate({
          path: "items.productVariantId",
          populate: {
            path: "product",
            select: "name brand mainImage",
          },
        })
        .sort(sortObject);
      
      const allOrders = await allOrdersQuery;
      console.log('Total orders fetched for search:', allOrders.length);
      
      if (allOrders.length > 0) {
        console.log('Sample order structure:', JSON.stringify(allOrders[0], null, 2));
      }
      
      // Filter all orders
      const filteredOrders = allOrders.filter(order => {
        const term = searchTerm.toLowerCase();
        
        // Check orderNumber match
        if (order.orderNumber && order.orderNumber.toLowerCase().includes(term)) {
          console.log('Match found by orderNumber:', order.orderNumber);
          return true;
        }
        
        // Check user fields
        if (order.user) {
          const { firstName, lastName, username, email } = order.user;
          const fullName = `${firstName || ""} ${lastName || ""}`.trim().toLowerCase();
          if (
            (firstName && firstName.toLowerCase().includes(term)) ||
            (lastName && lastName.toLowerCase().includes(term)) ||
            (fullName && fullName.includes(term)) ||
            (username && username.toLowerCase().includes(term)) ||
            (email && email.toLowerCase().includes(term))
          ) {
            console.log('Match found by user:', fullName, email);
            return true;
          }
        }
        
        // Check product names
        if (order.items && order.items.length > 0) {
          const productMatch = order.items.some(item => {
            const product = item.productVariantId?.product;
            if (product && product.name) {
              const matches = product.name.toLowerCase().includes(term);
              if (matches) {
                console.log('Match found by product:', product.name);
              }
              return matches;
            }
            return false;
          });
          if (productMatch) return true;
        }
        
        return false;
      });
      
      console.log('Total orders after filter:', filteredOrders.length);
      
      // Calculate pagination for filtered results
      total = filteredOrders.length;
      const startIndex = (page - 1) * limit;
      const endIndex = startIndex + limit;
      orders = filteredOrders.slice(startIndex, endIndex);
      
      console.log(`Showing orders ${startIndex + 1} to ${Math.min(endIndex, total)} of ${total}`);
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

// Return order (per-item)
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
    // Allow per-item return if itemStatus === 'delivered'
    let anyReturned = false;
    for (const reqItem of items) {
      const item = order.items.find(i => i.productVariantId.toString() === reqItem.productVariantId);
      if (item && !item.returned && item.itemStatus === 'delivered') {
        item.returned = true;
        item.returnReason = reqItem.reason || '';
        item.itemStatus = 'returned'; // Set per-item status only
        anyReturned = true;
      }
    }
    if (!anyReturned) {
      return res.status(400).json({ message: 'No valid items to return. Only delivered, non-returned items can be returned.' });
    }
    // If all items are returned, set order.status = 'returned' (summary only)
    if (order.items.every(item => item.itemStatus === 'returned' || item.returned)) {
      order.status = 'returned';
    }
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

// Update order item status (per-item)
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
      // Wallet refund for per-item refund (COD or online)
      if (
        paymentStatus === 'refunded' &&
        item.itemPaymentStatus !== 'refunded' &&
        (order.paymentMethod === 'cod' || order.paymentMethod === 'online')
      ) {
        const Wallet = mongoose.model('Wallet');
        let wallet = await Wallet.findOne({ user: order.user });
        if (!wallet) {
          wallet = await Wallet.create({ user: order.user });
        }
        let refundAmount = item.price * item.quantity;
        const totalOrderItems = order.items.reduce((sum, i) => sum + (i.price * i.quantity), 0) || 1;
        let itemDiscount = 0;
        if (order.discount && order.discount.discountAmount > 0) {
          itemDiscount = (refundAmount / totalOrderItems) * order.discount.discountAmount;
        }
        let itemOffer = 0;
        if (order.offers && order.offers.length > 0) {
          const totalOffer = order.offers.reduce((sum, offer) => sum + (offer.offerAmount || 0), 0);
          itemOffer = (refundAmount / totalOrderItems) * totalOffer;
        }
        let itemShipping = 0;
        if (order.shipping && order.items.length > 0) {
          itemShipping = order.shipping / order.items.length;
        }
        refundAmount = Math.max(0, refundAmount - itemDiscount - itemOffer + itemShipping);
        wallet.balance += refundAmount;
        wallet.transactions.push({
          type: 'credit',
          amount: refundAmount,
          description: `Refund for item in order ${order.orderNumber} (${order.paymentMethod.toUpperCase()}) - Refunded by admin`
        });
        await wallet.save();
      }
      item.itemPaymentStatus = paymentStatus;
    }
    // If all items are delivered, set order.status = 'delivered' (summary only)
    if (order.items.length > 0 && order.items.every(i => i.itemStatus === 'delivered')) {
      order.status = 'delivered';
    }
    await order.save();
    res.json({ message: 'Order item status/payment status updated', order });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
