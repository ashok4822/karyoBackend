import Order from "../models/orderModel.js";
import Discount from "../models/discountModel.js";

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
      shipping,
      total,
    } = req.body;

    // Validation
    if (!items || items.length === 0) {
      return res.status(400).json({ message: "Order must contain at least one item" });
    }

    if (!shippingAddress) {
      return res.status(400).json({ message: "Shipping address is required" });
    }

    if (!paymentMethod || !["cod", "online"].includes(paymentMethod)) {
      return res.status(400).json({ message: "Valid payment method is required" });
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
      if (discountDoc.minimumAmount > 0 && subtotal < discountDoc.minimumAmount) {
        return res.status(400).json({ 
          message: `Minimum order amount of ₹${discountDoc.minimumAmount} required for this discount` 
        });
      }

      // Update discount usage count
      if (discountDoc.maxUsage && discountDoc.usageCount >= discountDoc.maxUsage) {
        return res.status(400).json({ message: "Discount usage limit reached" });
      }

      discountDoc.usageCount += 1;
      await discountDoc.save();
    }

    // Create the order
    const order = new Order({
      user: req.user._id,
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

    // Populate product details for response
    await order.populate({
      path: "items.productVariantId",
      populate: {
        path: "product",
        select: "name brand"
      }
    });

    res.status(201).json({
      message: "Order created successfully",
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
      },
    });
  } catch (error) {
    console.error("Error creating order:", error);
    res.status(500).json({ message: `Internal Server Error: ${error.message}` });
  }
};

// Get user's orders
export const getUserOrders = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const status = req.query.status; // optional filter

    const query = { user: req.user._id };

    if (status && status !== "all") {
      query.status = status;
    }

    const total = await Order.countDocuments(query);
    const orders = await Order.find(query)
      .populate({
        path: "items.productVariantId",
        populate: {
          path: "product",
          select: "name brand"
        }
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
    res.status(500).json({ message: `Internal Server Error: ${error.message}` });
  }
};

// Get order by ID
export const getOrderById = async (req, res) => {
  try {
    const { id } = req.params;
    const order = await Order.findOne({ _id: id, user: req.user._id })
      .populate({
        path: "items.productVariantId",
        populate: {
          path: "product",
          select: "name brand"
        }
      });

    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    res.json({ order });
  } catch (error) {
    console.error("Error getting order:", error);
    res.status(500).json({ message: `Internal Server Error: ${error.message}` });
  }
};

// Cancel order
export const cancelOrder = async (req, res) => {
  try {
    const { id } = req.params;
    const order = await Order.findOne({ _id: id, user: req.user._id });

    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    // Only allow cancellation of pending orders
    if (order.status !== "pending") {
      return res.status(400).json({ 
        message: "Only pending orders can be cancelled" 
      });
    }

    order.status = "cancelled";
    await order.save();

    res.json({ 
      message: "Order cancelled successfully",
      order: {
        _id: order._id,
        orderNumber: order.orderNumber,
        status: order.status,
      }
    });
  } catch (error) {
    console.error("Error cancelling order:", error);
    res.status(500).json({ message: `Internal Server Error: ${error.message}` });
  }
}; 