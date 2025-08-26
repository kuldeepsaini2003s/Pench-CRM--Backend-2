const DeliveryHistory = require("../models/delhiveryHistory");
const Product = require("../models/productModel");
const Customer = require("../models/coustomerModel");

// 1. Get All Sales Data
exports.getAllSales = async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query;
    const skip = (page - 1) * limit;

    // Get total count for pagination
    const totalRecords = await DeliveryHistory.countDocuments({});

    // Get paginated sales data
    const salesData = await DeliveryHistory.find({})
      .populate({
        path: "customer",
        select: "name phoneNumber address"
      })
      .populate({
        path: "deliveryBoy",
        select: "name phoneNumber"
      })
      .populate({
        path: "products.product",
        select: "productName size productCode"
      })
      .sort({ date: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    // Calculate all-time summary statistics (without pagination)
    const allTimeSalesData = await DeliveryHistory.find({});

    // Calculate total sales amount (all time)
    const totalSalesAmount = allTimeSalesData.reduce((sum, delivery) => sum + delivery.totalPrice, 0);

    // Calculate total number of products delivered (all time)
    const totalProductsDelivered = allTimeSalesData.reduce((total, delivery) => {
      return total + delivery.products.reduce((productSum, product) => {
        return productSum + product.quantity;
      }, 0);
    }, 0);

    // Calculate other summary statistics (all time)
    const totalDeliveries = allTimeSalesData.length;
    const deliveredCount = allTimeSalesData.filter(d => d.status === "Delivered").length;
    const pendingCount = allTimeSalesData.filter(d => d.status === "Pending").length;
    const missedCount = allTimeSalesData.filter(d => d.status === "Missed").length;

    // Pagination info
    const totalPages = Math.ceil(totalRecords / limit);
    const hasNextPage = page < totalPages;
    const hasPrevPage = page > 1;

    res.status(200).json({
      success: true,
      data: {
        sales: salesData,
        pagination: {
          currentPage: parseInt(page),
          totalPages,
          totalRecords,
          hasNextPage,
          hasPrevPage,
          limit: parseInt(limit)
        },
        allTimeSummary: {
          totalSalesAmount,
          totalProductsDelivered,
          totalDeliveries,
          deliveredCount,
          pendingCount,
          missedCount,
          deliveryRate: totalDeliveries > 0 ? ((deliveredCount / totalDeliveries) * 100).toFixed(2) : 0
        }
      }
    });

  } catch (error) {
    console.error("Error fetching sales data:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch sales data",
      error: error.message
    });
  }
};

// 2. Get Low Stock Products (less than 10)
exports.getLowStockProducts = async (req, res) => {
  try {
    const { threshold = 10 } = req.query;

    const lowStockProducts = await Product.find({
      stock: { $lt: parseInt(threshold) }
    }).sort({ stock: 1 }); // Sort by lowest stock first

    // Categorize by urgency
    const criticalStock = lowStockProducts.filter(p => p.stock === 0);
    const lowStock = lowStockProducts.filter(p => p.stock > 0 && p.stock < 5);
    const moderateStock = lowStockProducts.filter(p => p.stock >= 5 && p.stock < threshold);

    res.status(200).json({
      success: true,
      data: {
        allLowStockProducts: lowStockProducts,
        categorized: {
          critical: criticalStock, // Out of stock
          low: lowStock, // Less than 5
          moderate: moderateStock // 5-9 items
        },
        summary: {
          totalLowStockItems: lowStockProducts.length,
          criticalCount: criticalStock.length,
          lowCount: lowStock.length,
          moderateCount: moderateStock.length
        }
      }
    });

  } catch (error) {
    console.error("Error fetching low stock products:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch low stock products",
      error: error.message
    });
  }
};

// 3. Get Active Subscriptions (customers with regular delivery history)
exports.getActiveSubscriptions = async (req, res) => {
  try {
    const { days = 30 } = req.query; // Check activity in last 30 days

    const dateThreshold = new Date();
    dateThreshold.setDate(dateThreshold.getDate() - parseInt(days));

    // Get customers with active subscriptions (end date is future or null)
    const currentDate = new Date();
    const activeCustomers = await Customer.find({
      $or: [
        { "products.endDate": { $gte: currentDate } },
        { "products.endDate": null },
        { "products.endDate": { $exists: false } }
      ]
    })
    .populate({
      path: "products.product",
      select: "productName size price productCode"
    })
    .populate({
      path: "deliveryBoy",
      select: "name phoneNumber"
    });

    // Check recent delivery activity for each customer
    const activeSubscriptions = [];

    for (const customer of activeCustomers) {
      // Get recent delivery history
      const recentDeliveries = await DeliveryHistory.find({
        customer: customer._id,
        date: { $gte: dateThreshold }
      }).sort({ date: -1 });

      // Calculate activity metrics
      const totalDeliveries = recentDeliveries.length;
      const successfulDeliveries = recentDeliveries.filter(d => d.status === "Delivered").length;
      const lastDeliveryDate = recentDeliveries.length > 0 ? recentDeliveries[0].date : null;

      // Determine if subscription is active based on recent activity
      const isActive = totalDeliveries > 0 || customer.products.some(p =>
        p.endDate && p.endDate >= currentDate
      );

      if (isActive) {
        activeSubscriptions.push({
          customer: {
            _id: customer._id,
            name: customer.name,
            phoneNumber: customer.phoneNumber,
            address: customer.address,
            amountDue: customer.amountDue,
            amountPaidTillDate: customer.amountPaidTillDate
          },
          deliveryBoy: customer.deliveryBoy,
          subscriptions: customer.products.filter(p =>
            !p.endDate || p.endDate >= currentDate
          ),
          recentActivity: {
            totalDeliveries,
            successfulDeliveries,
            deliveryRate: totalDeliveries > 0 ? ((successfulDeliveries / totalDeliveries) * 100).toFixed(2) : 0,
            lastDeliveryDate,
            daysSinceLastDelivery: lastDeliveryDate ?
              Math.floor((currentDate - lastDeliveryDate) / (1000 * 60 * 60 * 24)) : null
          }
        });
      }
    }

    // Sort by recent activity (most recent first)
    activeSubscriptions.sort((a, b) => {
      if (!a.recentActivity.lastDeliveryDate) return 1;
      if (!b.recentActivity.lastDeliveryDate) return -1;
      return b.recentActivity.lastDeliveryDate - a.recentActivity.lastDeliveryDate;
    });

    // Calculate summary
    const totalActiveSubscriptions = activeSubscriptions.length;
    const totalAmountDue = activeSubscriptions.reduce((sum, sub) => sum + (sub.customer.amountDue || 0), 0);
    const regularCustomers = activeSubscriptions.filter(sub =>
      sub.recentActivity.deliveryRate >= 70 && sub.recentActivity.totalDeliveries >= 5
    );

    res.status(200).json({
      success: true,
      data: {
        activeSubscriptions,
        summary: {
          totalActiveSubscriptions,
          regularCustomersCount: regularCustomers.length,
          totalAmountDue,
          averageDeliveryRate: activeSubscriptions.length > 0 ?
            (activeSubscriptions.reduce((sum, sub) =>
              sum + parseFloat(sub.recentActivity.deliveryRate), 0) / activeSubscriptions.length
            ).toFixed(2) : 0
        }
      }
    });

  } catch (error) {
    console.error("Error fetching active subscriptions:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch active subscriptions",
      error: error.message
    });
  }
};

// 4. Get Sales Summary by Date Range
exports.getSalesSummary = async (req, res) => {
  try {
    const { startDate, endDate, groupBy = "day" } = req.query;

    let matchStage = {};
    if (startDate || endDate) {
      matchStage.date = {};
      if (startDate) matchStage.date.$gte = new Date(startDate);
      if (endDate) matchStage.date.$lte = new Date(endDate);
    }

    // Determine grouping format
    let dateFormat;
    switch (groupBy) {
      case "month":
        dateFormat = "%Y-%m";
        break;
      case "week":
        dateFormat = "%Y-%U";
        break;
      default:
        dateFormat = "%Y-%m-%d";
    }

    const salesSummary = await DeliveryHistory.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: {
            date: { $dateToString: { format: dateFormat, date: "$date" } },
            status: "$status"
          },
          count: { $sum: 1 },
          totalAmount: { $sum: "$totalPrice" },
          totalPaid: { $sum: "$amountPaid" }
        }
      },
      {
        $group: {
          _id: "$_id.date",
          deliveries: {
            $push: {
              status: "$_id.status",
              count: "$count",
              amount: "$totalAmount",
              paid: "$totalPaid"
            }
          },
          totalDeliveries: { $sum: "$count" },
          totalRevenue: { $sum: "$totalAmount" },
          totalCollected: { $sum: "$totalPaid" }
        }
      },
      { $sort: { "_id": 1 } }
    ]);

    res.status(200).json({
      success: true,
      data: {
        summary: salesSummary,
        groupBy
      }
    });

  } catch (error) {
    console.error("Error fetching sales summary:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch sales summary",
      error: error.message
    });
  }
};

// 5. Get Top Products by Sales
exports.getTopProducts = async (req, res) => {
  try {
    const { limit = 10, startDate, endDate } = req.query;

    let matchStage = { status: "Delivered" };
    if (startDate || endDate) {
      matchStage.date = {};
      if (startDate) matchStage.date.$gte = new Date(startDate);
      if (endDate) matchStage.date.$lte = new Date(endDate);
    }

    const topProducts = await DeliveryHistory.aggregate([
      { $match: matchStage },
      { $unwind: "$products" },
      {
        $group: {
          _id: "$products.product",
          totalQuantity: { $sum: "$products.quantity" },
          totalRevenue: { $sum: "$products.totalPrice" },
          deliveryCount: { $sum: 1 }
        }
      },
      {
        $lookup: {
          from: "products",
          localField: "_id",
          foreignField: "_id",
          as: "productInfo"
        }
      },
      { $unwind: "$productInfo" },
      {
        $project: {
          productName: "$productInfo.productName",
          size: "$productInfo.size",
          productCode: "$productInfo.productCode",
          totalQuantity: 1,
          totalRevenue: 1,
          deliveryCount: 1,
          averageOrderValue: { $divide: ["$totalRevenue", "$deliveryCount"] }
        }
      },
      { $sort: { totalRevenue: -1 } },
      { $limit: parseInt(limit) }
    ]);

    res.status(200).json({
      success: true,
      data: topProducts
    });

  } catch (error) {
    console.error("Error fetching top products:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch top products",
      error: error.message
    });
  }
};