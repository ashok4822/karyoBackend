import Order from "../models/orderModel.js";
import Product from "../models/productModel.js";
import Category from "../models/categoryModel.js";
import mongoose from "mongoose";
import User from "../models/userModel.js";

// Helper: get start/end of current and previous period
function getPeriodRange(period) {
  const now = new Date();
  let start, end, prevStart, prevEnd;
  if (period === "yearly") {
    start = new Date(now.getFullYear(), 0, 1);
    end = new Date(now.getFullYear() + 1, 0, 1);
    prevStart = new Date(now.getFullYear() - 1, 0, 1);
    prevEnd = new Date(now.getFullYear(), 0, 1);
  } else if (period === "weekly") {
    // Get Monday of current week
    const day = now.getDay();
    const diffToMonday = (day === 0 ? -6 : 1) - day; // Sunday=0, Monday=1
    start = new Date(now);
    start.setDate(now.getDate() + diffToMonday);
    start.setHours(0, 0, 0, 0);
    end = new Date(start);
    end.setDate(start.getDate() + 7);
    prevStart = new Date(start);
    prevStart.setDate(start.getDate() - 7);
    prevEnd = new Date(start);
  } else {
    // monthly
    start = new Date(now.getFullYear(), now.getMonth(), 1);
    end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    prevStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    prevEnd = new Date(now.getFullYear(), now.getMonth(), 1);
  }
  return { start, end, prevStart, prevEnd };
}

export const getDashboard = async (req, res) => {
  try {
    const period = req.query.period === "yearly" ? "yearly" : req.query.period === "weekly" ? "weekly" : "monthly";
    const { start, end, prevStart, prevEnd } = getPeriodRange(period);

    // Total sales, orders, products, customers
    const [
      totalSales,
      totalOrders,
      totalProducts,
      totalCustomers,
      recentOrders,
      lowStockProducts,
      // For growth
      periodSales,
      prevPeriodSales,
      periodOrders,
      prevPeriodOrders,
      // For best selling
      bestSellingProducts,
      bestSellingCategories,
      bestSellingBrands,
      // For chart
      chartData
    ] = await Promise.all([
      // Total sales (paid orders only)
      Order.aggregate([
        { $match: { paymentStatus: "paid" } },
        { $group: { _id: null, total: { $sum: "$total" } } },
      ]),
      // Total orders
      Order.countDocuments({}),
      // Total products
      Product.countDocuments({ isDeleted: false }),
      // Total customers
      User.countDocuments({ role: "user" }),
      // Recent orders (last 10)
      Order.find({})
        .sort({ createdAt: -1 })
        .limit(10)
        .populate({
          path: "user",
          select: "username firstName lastName email",
        })
        .select("orderNumber total status createdAt user items discount shipping offers"),
      // Low stock products (stock < 10)
      Product.aggregate([
        { $lookup: {
            from: "productvariants",
            localField: "variants",
            foreignField: "_id",
            as: "variantDetails"
        }},
        { $unwind: "$variantDetails" },
        { $match: { "variantDetails.stock": { $lt: 10 } } },
        { $project: {
            name: 1,
            brand: 1,
            variant: "$variantDetails._id",
            stock: "$variantDetails.stock"
        }},
        { $limit: 10 }
      ]),
      // Sales in current period
      Order.aggregate([
        { $match: { paymentStatus: "paid", createdAt: { $gte: start, $lt: end } } },
        { $group: { _id: null, total: { $sum: "$total" } } },
      ]),
      // Sales in previous period
      Order.aggregate([
        { $match: { paymentStatus: "paid", createdAt: { $gte: prevStart, $lt: prevEnd } } },
        { $group: { _id: null, total: { $sum: "$total" } } },
      ]),
      // Orders in current period
      Order.countDocuments({ createdAt: { $gte: start, $lt: end } }),
      // Orders in previous period
      Order.countDocuments({ createdAt: { $gte: prevStart, $lt: prevEnd } }),
      // Best selling products (top 10 by quantity)
      Order.aggregate([
        { $unwind: "$items" },
        { $match: { paymentStatus: "paid" } },
        { $group: {
          _id: "$items.productVariantId",
          quantity: { $sum: "$items.quantity" },
        }},
        { $sort: { quantity: -1 } },
        { $limit: 10 },
        { $lookup: {
          from: "productvariants",
          localField: "_id",
          foreignField: "_id",
          as: "variant"
        }},
        { $unwind: "$variant" },
        { $lookup: {
          from: "products",
          localField: "variant.product",
          foreignField: "_id",
          as: "product"
        }},
        { $unwind: "$product" },
        { $project: {
          _id: 0,
          productId: "$product._id",
          productName: "$product.name",
          brand: "$product.brand",
          variantId: "$variant._id",
          variant: "$variant",
          quantity: 1
        }}
      ]),
      // Best selling categories (top 10 by quantity)
      Order.aggregate([
        { $unwind: "$items" },
        { $match: { paymentStatus: "paid" } },
        { $lookup: {
          from: "productvariants",
          localField: "items.productVariantId",
          foreignField: "_id",
          as: "variant"
        }},
        { $unwind: "$variant" },
        { $lookup: {
          from: "products",
          localField: "variant.product",
          foreignField: "_id",
          as: "product"
        }},
        { $unwind: "$product" },
        { $group: {
          _id: "$product.category",
          quantity: { $sum: "$items.quantity" },
        }},
        { $sort: { quantity: -1 } },
        { $limit: 10 },
        { $lookup: {
          from: "categories",
          localField: "_id",
          foreignField: "_id",
          as: "category"
        }},
        { $unwind: "$category" },
        { $project: {
          _id: 0,
          categoryId: "$category._id",
          categoryName: "$category.name",
          quantity: 1
        }}
      ]),
      // Best selling brands (top 10 by quantity)
      Order.aggregate([
        { $unwind: "$items" },
        { $match: { paymentStatus: "paid" } },
        { $lookup: {
          from: "productvariants",
          localField: "items.productVariantId",
          foreignField: "_id",
          as: "variant"
        }},
        { $unwind: "$variant" },
        { $lookup: {
          from: "products",
          localField: "variant.product",
          foreignField: "_id",
          as: "product"
        }},
        { $unwind: "$product" },
        { $group: {
          _id: "$product.brand",
          quantity: { $sum: "$items.quantity" },
        }},
        { $sort: { quantity: -1 } },
        { $limit: 10 },
        { $project: {
          _id: 0,
          brand: "$_id",
          quantity: 1
        }}
      ]),
      // Chart data (sales/orders by month/year/week)
      Order.aggregate([
        { $match: { paymentStatus: "paid", createdAt: { $gte: start, $lt: end } } },
        { $group: {
          _id: period === "yearly"
            ? { year: { $year: "$createdAt" }, month: { $month: "$createdAt" } }
            : period === "weekly"
            ? { day: { $dayOfMonth: "$createdAt" }, month: { $month: "$createdAt" }, year: { $year: "$createdAt" } }
            : { day: { $dayOfMonth: "$createdAt" }, month: { $month: "$createdAt" }, year: { $year: "$createdAt" } },
          totalSales: { $sum: "$total" },
          orderCount: { $sum: 1 },
        }},
        { $sort: { "_id.year": 1, "_id.month": 1, "_id.day": 1 } }
      ])
    ]);

    // Calculate growth
    const salesGrowth = periodSales[0]?.total && prevPeriodSales[0]?.total
      ? ((periodSales[0].total - prevPeriodSales[0].total) / (prevPeriodSales[0].total || 1)) * 100
      : 0;
    const orderGrowth = periodOrders && prevPeriodOrders
      ? ((periodOrders - prevPeriodOrders) / (prevPeriodOrders || 1)) * 100
      : 0;

    // Add computedTotal to each recent order
    function computeAdjustedTotal(order) {
      const allItemsTotal = order.items?.reduce(
        (sum, item) =>
          sum +
          (item.price * item.quantity -
            (item.offers
              ? item.offers.reduce((s, offer) => s + (offer.offerAmount || 0), 0)
              : 0)),
        0
      ) || 0;
      const nonRefundedItemsTotal = order.items?.filter((item) => item.itemPaymentStatus !== "refunded")
        .reduce(
          (sum, item) =>
            sum +
            (item.price * item.quantity -
              (item.offers
                ? item.offers.reduce((s, offer) => s + (offer.offerAmount || 0), 0)
                : 0)),
          0
        ) || 0;
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
    const recentOrdersWithComputedTotal = recentOrders.map(order => ({
      ...order.toObject(),
      computedTotal: computeAdjustedTotal(order.toObject ? order.toObject() : order),
    }));

    res.json({
      success: true,
      data: {
        totalSales: totalSales[0]?.total || 0,
        totalOrders,
        totalProducts,
        totalCustomers,
        salesGrowth: Math.round(salesGrowth),
        orderGrowth: Math.round(orderGrowth),
        recentOrders: recentOrdersWithComputedTotal,
        lowStockProducts,
        chartData,
        bestSellingProducts,
        bestSellingCategories,
        bestSellingBrands,
      },
    });
  } catch (error) {
    console.error("Dashboard analytics error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// Generate ledger book
export const generateLedgerBook = async (req, res) => {
  try {
    const { period = "monthly", dateFrom, dateTo } = req.query;
    
    // Build date filter
    let dateFilter = {};
    if (dateFrom && dateTo) {
      dateFilter.createdAt = {
        $gte: new Date(dateFrom),
        $lte: new Date(dateTo)
      };
    } else {
      // Default to current period
      const { start, end } = getPeriodRange(period);
      dateFilter.createdAt = { $gte: start, $lt: end };
    }

    // Get all orders with detailed information
    const orders = await Order.find(dateFilter)
      .populate({
        path: "user",
        select: "username firstName lastName email"
      })
      .populate({
        path: "items.productVariantId",
        populate: {
          path: "product",
          select: "name brand category"
        }
      })
      .sort({ createdAt: -1 });

    // Get wallet transactions for refunds
    const Wallet = mongoose.model("Wallet");
    const walletTransactions = await Wallet.aggregate([
      {
        $unwind: "$transactions"
      },
      {
        $match: {
          "transactions.createdAt": dateFilter.createdAt
        }
      },
      {
        $project: {
          userId: "$user",
          transaction: "$transactions"
        }
      }
    ]);

    // Calculate summary statistics
    const summary = {
      totalOrders: orders.length,
      totalRevenue: orders.reduce((sum, order) => sum + (order.total || 0), 0),
      totalDiscounts: orders.reduce((sum, order) => {
        if (order.discount && order.discount.discountAmount) {
          return sum + order.discount.discountAmount;
        }
        return sum;
      }, 0),
      totalOffers: orders.reduce((sum, order) => {
        if (order.offers && order.offers.length > 0) {
          return sum + order.offers.reduce((offerSum, offer) => offerSum + (offer.offerAmount || 0), 0);
        }
        return sum;
      }, 0),
      totalShipping: orders.reduce((sum, order) => sum + (order.shipping || 0), 0),
      totalRefunds: walletTransactions
        .filter(t => t.transaction.type === "credit" && t.transaction.description.includes("Refund"))
        .reduce((sum, t) => sum + (t.transaction.amount || 0), 0),
      paymentMethodBreakdown: {
        cod: orders.filter(o => o.paymentMethod === "cod").length,
        online: orders.filter(o => o.paymentMethod === "online").length
      },
      statusBreakdown: {
        pending: orders.filter(o => o.status === "pending").length,
        confirmed: orders.filter(o => o.status === "confirmed").length,
        processing: orders.filter(o => o.status === "processing").length,
        shipped: orders.filter(o => o.status === "shipped").length,
        delivered: orders.filter(o => o.status === "delivered").length,
        cancelled: orders.filter(o => o.status === "cancelled").length,
        returned: orders.filter(o => o.status === "returned").length
      }
    };

    // Format orders for ledger
    const ledgerEntries = orders.map(order => {
      const customerName = order.user 
        ? (order.user.firstName 
          ? `${order.user.firstName} ${order.user.lastName || ""}`.trim()
          : order.user.username || order.user.email)
        : "Unknown Customer";

      return {
        date: order.createdAt,
        orderNumber: order.orderNumber,
        customer: customerName,
        customerEmail: order.user?.email,
        items: order.items.map(item => ({
          productName: item.productVariantId?.product?.name || "Unknown Product",
          brand: item.productVariantId?.product?.brand || "Unknown Brand",
          quantity: item.quantity,
          price: item.price,
          total: item.price * item.quantity
        })),
        subtotal: order.subtotal,
        discount: order.discount?.discountAmount || 0,
        offers: order.offers?.reduce((sum, offer) => sum + (offer.offerAmount || 0), 0) || 0,
        shipping: order.shipping,
        total: order.total,
        paymentMethod: order.paymentMethod,
        paymentStatus: order.paymentStatus,
        orderStatus: order.status,
        createdAt: order.createdAt
      };
    });

    // Format refund transactions
    const refundEntries = walletTransactions
      .filter(t => t.transaction.type === "credit" && t.transaction.description.includes("Refund"))
      .map(t => ({
        date: t.transaction.createdAt || new Date(),
        type: "refund",
        description: t.transaction.description,
        amount: t.transaction.amount,
        customerId: t.userId
      }));

    // Combine and sort all entries by date
    const allEntries = [...ledgerEntries, ...refundEntries]
      .sort((a, b) => new Date(b.date) - new Date(a.date));

    res.json({
      success: true,
      data: {
        summary,
        ledgerEntries: allEntries,
        period: {
          from: dateFilter.createdAt.$gte,
          to: dateFilter.createdAt.$lte
        },
        generatedAt: new Date()
      }
    });

  } catch (error) {
    console.error("Ledger book generation error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
};
