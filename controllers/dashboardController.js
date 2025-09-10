const DeliveryHistory = require("../models/deliveryHistory");
const Payment = require("../models/paymentModel");
const catchAsync = require("../middlewares/catchAsyncErrors");
const ErrorHandler = require("../utils/errorhendler");
const Product = require("../models/productModel");
const Customer = require("../models/customerModel");
const { formatDate, normalizeDate } = require("../utils/dateUtils");
const { checkSubscriptionStatus } = require("../helper/helperFuctions");

const TotalSales = catchAsync(async (req, res, next) => {
  const { page = 1, limit = 10 } = req.query;
  const skip = (page - 1) * limit;

  //  Total Delivered Records
  const totalRecords = await DeliveryHistory.countDocuments({
    status: "Delivered",
  });

  if (totalRecords === 0) {
    return next(new ErrorHandler("No delivered sales found", 404));
  }

  const deliveries = await DeliveryHistory.find({ status: "Delivered" })
    .populate("customer", "name phoneNumber address createdAt")
    .populate("products.product", "productName productCode size price")
    .sort({ date: -1 })
    .skip(skip)
    .limit(parseInt(limit));

  const salesData = await Promise.all(
    deliveries.map(async (delivery) => {
      const customer = delivery.customer;

      if (!customer) {
        return {
          customer: {
            name: "Unknown Customer",
            phoneNumber: "N/A",
            address: "N/A",
            startDate: null,
          },
          products: [],
          totalAmount: 0,
          payment: {
            method: "N/A",
            status: "Unpaid",
            totalPaid: 0,
          },
        };
      }

      const paymentRecord = await Payment.findOne({ customer: customer._id })
        .sort({ createdAt: -1 })
        .select("paymentMethod status paidAmount");

      const products = delivery.products.map((item) => {
        const product = item.product;
        const price = Number(product?.price || item.price || 0);
        const quantity = Number(item.quantity || 0);
        const total = price * quantity;

        return {
          productName: product?.productName || "N/A",
          productCode: product?.productCode || "N/A",
          size: product?.size || "N/A",
          price,
          quantity,
          total,
        };
      });

      const deliveryTotal = products.reduce((sum, p) => sum + p.total, 0);

      return {
        customer: {
          name: customer.name,
          phoneNumber: customer.phoneNumber,
          address: customer.address,
          startDate: customer.createdAt,
        },
        products,
        totalAmount: deliveryTotal,
        payment: {
          method: paymentRecord?.paymentMethod || "N/A",
          status: paymentRecord?.status || "Unpaid",
          totalPaid: paymentRecord?.paidAmount || 0,
        },
      };
    })
  );

  const grandTotalAmount = salesData.reduce(
    (sum, record) => sum + (record.totalAmount || 0),
    0
  );

  const allDeliveries = await DeliveryHistory.find({
    status: "Delivered",
  }).populate("products.product");

  let totalProductsDelivered = 0;
  allDeliveries.forEach((d) => {
    d.products.forEach((p) => {
      totalProductsDelivered += Number(p.quantity || 0);
    });
  });

  const totalDeliveries = allDeliveries.length;
  const totalPages = Math.ceil(totalRecords / limit);

  res.status(200).json({
    success: true,
    data: {
      sales: salesData,
      pagination: {
        currentPage: parseInt(page),
        totalPages,
        totalRecords,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
        limit: parseInt(limit),
      },
      summary: {
        grandTotalAmount,
        totalProductsDelivered,
        totalDeliveries,
      },
    },
  });
});

//  Get Low Stock Products (stock < 10)
const getLowStockProducts = catchAsync(async (req, res, next) => {
  const products = await Product.find(
    { stock: { $lt: 10 } },
    { productName: 1, productCode: 1, stock: 1, size: 1, _id: 1 }
  ).sort({ stock: 1 });

  if (!products || products.length === 0) {
    return next(new ErrorHandler("No low stock products found", 404));
  }

  res.status(200).json({
    success: true,
    count: products.length,
    products,
  });
});

// 3. Get Active Subscriptions
const getActiveSubscriptions = async (req, res) => {
  try {
    let { page = 1, limit = 10, search = "", sortOrder = "desc" } = req.query;

    page = parseInt(page);
    limit = parseInt(limit);

    // ---- Build filter ----
    const filter = { subscriptionStatus: "active" };

    // 🔍 Search filter
    if (search) {
      const regex = new RegExp(search, "i"); // case-insensitive
      if (!isNaN(search)) {
        // If numeric search, check phoneNumber also
        filter.$or = [
          { name: regex },
          { phoneNumber: Number(search) },
          { subscriptionStatus: regex },
        ];
      } else {
        filter.$or = [
          { name: regex },
          { subscriptionStatus: regex },
        ];
      }
    }

    // ---- Sort order ----
    const sortOption = sortOrder === "asc" ? 1 : -1;

    // ---- Query DB ----
    const [totalActiveSubscribedCustomers, customers] = await Promise.all([
      Customer.countDocuments(filter),
      Customer.find(filter)
        .select("image name phoneNumber subscriptionStatus subscriptionPlan createdAt")
        .sort({ createdAt: sortOption })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
    ]);

    if (!customers || customers.length === 0) {
      return res.status(404).json({
        success: false,
        message: "No active subscriptions found",
      });
    }

    // ✅ Format response
    const subscriptions = customers.map((c) => ({
      image: c.image,
      customerName: c.name,
      phoneNumber: c.phoneNumber,
      subscriptionStatus: c.subscriptionStatus,
      subscriptionPlan: c.subscriptionPlan,
    }));

    // ---- Pagination meta ----
    const totalPages = Math.ceil(totalActiveSubscribedCustomers / limit);
    const hasPrevious = page > 1;
    const hasNext = page < totalPages;

    return res.status(200).json({
      success: true,
      message: "Active subscriptions fetched successfully",
      totalActiveSubscribedCustomers,
      totalPages,
      currentPage: page,
      previous: hasPrevious,
      next: hasNext,
      customers: subscriptions,
    });
  } catch (err) {
    console.error("getActiveSubscriptions Error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch active subscriptions",
      error: err.message,
    });
  }
};



// 5. Get Top &lowest Products by Sales

const getTopAndLowestProducts = catchAsync(async (req, res, next) => {
  let { startDate, endDate } = req.query;

  // Prepare match stage
  const matchStage = { status: "Delivered" };
  if (startDate || endDate) {
    matchStage.date = {};
    if (startDate) matchStage.date.$gte = normalizeDate(startDate);
    if (endDate) matchStage.date.$lte = normalizeDate(endDate);
  }

  // Aggregate deliveries
  const productAggregation = await DeliveryHistory.aggregate([
    { $match: matchStage },
    { $unwind: "$products" },
    { $match: { "products.status": "delivered" } },
    {
      $group: {
        _id: "$products.product",
        totalQuantity: { $sum: "$products.quantity" },
      },
    },
    {
      $lookup: {
        from: "products",
        localField: "_id",
        foreignField: "_id",
        as: "productInfo",
      },
    },
    { $unwind: "$productInfo" },
    {
      $project: {
        productName: "$productInfo.productName",
        productCode: "$productInfo.productCode",
        totalQuantity: 1,
      },
    },
    { $sort: { totalQuantity: -1 } }, // Descending for top products
  ]);

  if (!productAggregation || productAggregation.length === 0) {
    return next(new ErrorHandler("No product deliveries found", 404));
  }

  const topProduct = productAggregation[0];
  const lowestProduct = productAggregation[productAggregation.length - 1];

  res.status(200).json({
    success: true,
    data: {
      topProduct: topProduct
        ? {
            productName: topProduct.productName,
            productCode: topProduct.productCode,
            count: topProduct.totalQuantity,
          }
        : null,
      lowestProduct: lowestProduct
        ? {
            productName: lowestProduct.productName,
            productCode: lowestProduct.productCode,
            count: lowestProduct.totalQuantity,
          }
        : null,
    },
  });
});



const getPendingPayments = catchAsync(async (req, res, next) => {
  const { page = 1, limit = 10 } = req.query;
  const skip = (page - 1) * limit;

  const deliveries = await DeliveryHistory.find()
    .populate("customer", "name phoneNumber")
    .populate("products.product", "productName size")
    .sort({ date: -1 })
    .skip(skip)
    .limit(parseInt(limit))
    .lean();

  if (!deliveries || deliveries.length === 0) {
    return next(new ErrorHandler("No delivery history found", 404));
  }

  const response = deliveries
    .map((delivery, index) => {
      return delivery.products.map((p) => {
        const pendingAmount = (p.totalPrice || 0) - (delivery.amountPaid || 0);

        return {
          srNo: skip + index + 1,
          customerName: delivery.customer?.name || "Unknown",
          productName: p.product?.productName || "N/A",
          productSize: p.product?.size || "N/A",
          quantity: p.quantity,
          pendingAmount,
          date: delivery.date,
        };
      });
    })
    .flat();

  res.status(200).json({
    success: true,
    count: response.length,
    data: response,
    pagination: {
      currentPage: parseInt(page),
      limit: parseInt(limit),
    },
  });
});

// 📌 Get New Onboard Customers (first delivery)
const getNewOnboardCustomers = async (req, res, next) => {
  const { page = 1, limit = 10 } = req.query;
  const skip = (page - 1) * limit;

  const deliveries = await DeliveryHistory.aggregate([
    {
      $sort: { date: 1 },
    },
    {
      $group: {
        _id: "$customer",
        firstDelivery: { $first: "$$ROOT" },
      },
    },
    { $skip: skip },
    { $limit: parseInt(limit) },
  ]);

  if (!deliveries || deliveries.length === 0) {
    return next(new ErrorHandler("No onboard customers found", 404));
  }

  // 🔹 Populate customer + product
  const populated = await DeliveryHistory.populate(deliveries, [
    { path: "firstDelivery.customer", select: "name" },
    { path: "firstDelivery.products.product", select: "productName size" },
  ]);

  // 🔹 Response format
  const response = populated
    .map((d) => {
      const delivery = d.firstDelivery;

      return delivery?.products?.map((p) => ({
        customerName: delivery.customer?.name || "Unknown",
        productType: p.product?.productName || "N/A",
        productSize: p.product?.size || "N/A",
        quantity: p.quantity,
        date: delivery.date,
      }));
    })
    .flat();

  res.status(200).json({
    success: true,
    count: response.length,
    data: response,
    pagination: {
      currentPage: parseInt(page),
      limit: parseInt(limit),
    },
  });
}

module.exports = {
  TotalSales,
  getLowStockProducts,
  getActiveSubscriptions,
  getTopAndLowestProducts,
  getPendingPayments,
  getNewOnboardCustomers,
};
