const Invoice = require("../models/customerInvoicesModel");
const generateInvoiceNumber = require("../utils/generateInvoiceNumber");
const { generateInvoicePDF } = require("../service/pdfService");
const { cloudinary } = require("../config/cloudinary");
const Customer = require("../models/customerModel");
const CustomerOrders = require("../models/customerOrderModel");
const {
  parseUniversalDate,
  formatDateToDDMMYYYY,
} = require("../utils/parsedDateAndDay");
const moment = require("moment");
const { calculateFullPeriodAmount } = require("../helper/helperFunctions");

const gstNumber = process.env.GST_NUMBER;

//✅ Create Customer Invoice
const createCustomerInvoice = async (req, res) => {
  try {
    const {
      customer,
      period,
      products,
      grandTotal,
      deliveryStats,
      partialPayment,
    } = req.body;

    if (
      !customer ||
      !period ||
      !products ||
      !Array.isArray(products) ||
      products.length === 0
    ) {
      return res.status(400).json({
        success: false,
        message: "Customer data, period, and products are required",
      });
    }

    const customerId = customer._id;
    const phoneNumber = customer.phoneNumber;
    const address = customer.address;
    const subscriptionPlan = customer.subscriptionPlan;
    const paymentMethod = customer.paymentMethod || "COD";
    const paymentStatus = customer.paymentStatus || "Unpaid";

    const availablePaymentStatus = ["Paid", "Partially Paid", "Unpaid"];

    if (!availablePaymentStatus?.includes(customer?.paymentStatus)) {
      return res.status(400).json({
        success: false,
        message: "Invalid payment status",
        availablePaymentStatus,
      });
    }

    // Check if invoice already exists for this customer and period
    const existingInvoice = await Invoice.findOne({
      customer: customerId,
      "period.startDate": {
        $lte: parseUniversalDate(period.endDate) || new Date(period.endDate),
      },
      "period.endDate": {
        $gte:
          parseUniversalDate(period.startDate) || new Date(period.startDate),
      },
    });

    if (existingInvoice) {
      // Check if payment status is the same
      if (existingInvoice.payment?.status === paymentStatus) {
        return res.status(409).json({
          success: false,
          message: `Invoice already created for this customer with ${paymentStatus} status`,
          existingInvoice: {
            invoiceNumber: existingInvoice.invoiceNumber,
            period: {
              startDate: existingInvoice.period.startDate,
              endDate: existingInvoice.period.endDate,
            },
            status: existingInvoice.payment?.status || "Unpaid",
            paymentMethod: existingInvoice.payment?.method || "COD",
            pdfUrl: existingInvoice.pdfUrl,
            state: existingInvoice.state,
          },
        });
      } else {
        // Update existing invoice with new payment status
        const updatedPaidAmount =
          paymentStatus === "Paid"
            ? grandTotal
            : partialPayment
            ? partialPayment.partialPaymentAmount
            : 0;
        const updatedBalanceAmount =
          paymentStatus === "Paid" ? 0 : grandTotal - updatedPaidAmount;

        // Update the existing invoice
        existingInvoice.payment.status = paymentStatus;
        existingInvoice.payment.method = paymentMethod;
        existingInvoice.totals.paidAmount = updatedPaidAmount;
        existingInvoice.totals.balanceAmount = updatedBalanceAmount;
        existingInvoice.totals.partiallyPaidAmount = partialPayment
          ? partialPayment.partialPaymentAmount
          : 0;
        existingInvoice.totals.paidDate =
          paymentStatus === "Paid" ? new Date() : null;

        // Update products if provided
        if (products && products.length > 0) {
          existingInvoice.products = products.map((product) => ({
            productId: product.productId,
            productName: product.productName,
            productSize: product.productSize,
            quantity: product.quantity,
            price: product.price,
            totalPrice: product.totalPrice,
          }));
          existingInvoice.totals.subtotal = products.reduce(
            (sum, product) => sum + product.totalPrice,
            0
          );
          existingInvoice.totals.carryForwardAmount =
            grandTotal - existingInvoice.totals.subtotal;
        }

        await existingInvoice.save();

        await updateOrdersPaymentStatus(
          customerId,
          period,
          paymentStatus,
          paymentMethod,
          partialPayment
        );

        // Regenerate PDF with updated data
        const invoiceWithStats = {
          ...existingInvoice.toObject(),
          customer: {
            name: customer.name,
            phoneNumber: customer.phoneNumber,
            address: customer.address,
          },
          deliveryStats: deliveryStats || {
            actualOrders: products.length,
            absentDays: 0,
            deliveries: products.length,
          },
        };

        const pdfBuffer = await generateInvoicePDF(invoiceWithStats);
        const result = await new Promise((resolve, reject) => {
          cloudinary.uploader
            .upload_stream(
              {
                resource_type: "raw",
                folder: "Pench/Invoices",
                public_id: `invoice-${existingInvoice.invoiceNumber}`,
                format: "pdf",
              },
              (error, result) => {
                if (error) {
                  reject(error);
                } else {
                  resolve(result);
                }
              }
            )
            .end(pdfBuffer);
        });

        existingInvoice.pdfUrl = result.secure_url;
        await existingInvoice.save();

        return res.status(200).json({
          success: true,
          message: `Invoice payment status updated to ${paymentStatus}`,
          invoiceNumber: existingInvoice.invoiceNumber,
          pdfUrl: result.secure_url,
          status: existingInvoice.payment?.status,
        });
      }
    }

    const subtotal = products.reduce(
      (sum, product) => sum + product.totalPrice,
      0
    );
    const carryForwardAmount = grandTotal - subtotal;
    const paidAmount =
      paymentStatus === "Paid"
        ? grandTotal
        : partialPayment
        ? partialPayment.partialPaymentAmount
        : 0;
    const balanceAmount =
      paymentStatus === "Paid" ? 0 : grandTotal - paidAmount;

    const invoiceNumber = generateInvoiceNumber();

    const invoice = await Invoice.create({
      invoiceNumber,
      gstNumber,
      customer: customerId,
      phoneNumber: parseInt(phoneNumber),
      address,
      subscriptionPlan,
      Deliveries: deliveryStats?.deliveries || 0,
      absentDays: deliveryStats?.absentDaysList
        ? deliveryStats.absentDaysList.map((date) => new Date(date))
        : [],
      actualOrders: deliveryStats?.actualOrders || 0,
      period: {
        startDate:
          parseUniversalDate(period.startDate) || new Date(period.startDate),
        endDate: parseUniversalDate(period.endDate) || new Date(period.endDate),
      },
      products: products.map((product) => ({
        productId: product.productId,
        productName: product.productName,
        productSize: product.productSize,
        quantity: product.quantity,
        price: product.price,
        totalPrice: product.totalPrice,
      })),
      payment: {
        status: paymentStatus,
        method: paymentMethod,
      },
      totals: {
        subtotal,
        paidAmount,
        balanceAmount,
        carryForwardAmount,
        partiallyPaidAmount: partialPayment
          ? partialPayment.partialPaymentAmount
          : 0,
        paidDate: paymentStatus === "Paid" ? new Date() : null,
      },
      state: "Draft",
      includedOrders: [],
    });

    const invoiceWithStats = {
      ...invoice.toObject(),
      customer: {
        name: customer.name,
        phoneNumber: customer.phoneNumber,
        address: customer.address,
      },
      deliveryStats: deliveryStats || {
        actualOrders: products.length,
        absentDays: 0,
        deliveries: products.length,
      },
    };

    const pdfBuffer = await generateInvoicePDF(invoiceWithStats);

    const result = await new Promise((resolve, reject) => {
      cloudinary.uploader
        .upload_stream(
          {
            resource_type: "raw",
            folder: "Pench/Invoices",
            public_id: `invoice-${invoiceNumber}`,
            format: "pdf",
          },
          (error, result) => {
            if (error) {
              reject(error);
            } else {
              resolve(result);
            }
          }
        )
        .end(pdfBuffer);
    });

    invoice.pdfUrl = result.secure_url;
    await invoice.save();

    // Update payment status and method for all orders in the date range
    await updateOrdersPaymentStatus(
      customerId,
      period,
      paymentStatus,
      paymentMethod,
      partialPayment
    );

    return res.status(201).json({
      success: true,
      message: "Invoice created successfully",
      pdfUrl: result.secure_url,
    });
  } catch (error) {
    console.error("Error creating invoice:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to create invoice",
      error: error.message,
    });
  }
};

//✅ Get All Customer Invoices
const getAllCustomerInvoices = async (req, res) => {
  try {
    let {
      page = 1,
      limit = 10,
      search = "",
      startDate,
      endDate,
      sortOrder = "desc",
    } = req.query;

    page = parseInt(page) || 1;
    limit = parseInt(limit) || 10;
    const skip = (page - 1) * limit;

    let matchStage = {};

    if (startDate && endDate) {
      const startDateObj = parseUniversalDate(startDate) || new Date(startDate);
      const endDateObj = parseUniversalDate(endDate) || new Date(endDate);
      matchStage.$and = [
        { "period.startDate": { $lte: endDateObj } },
        { "period.endDate": { $gte: startDateObj } },
      ];
    } else if (startDate) {
      const startDateObj = parseUniversalDate(startDate) || new Date(startDate);
      matchStage["period.endDate"] = { $gte: startDateObj };
    } else if (endDate) {
      const endDateObj = parseUniversalDate(endDate) || new Date(endDate);
      matchStage["period.startDate"] = { $lte: endDateObj };
    }

    if (search) {
      const searchRegex = new RegExp(search, "i");
      const searchConditions = [
        { invoiceNumber: searchRegex },
        { subscriptionPlan: searchRegex },
        { "customerData.name": searchRegex },
      ];

      if (!isNaN(search)) {
        searchConditions.push({ phoneNumber: Number(search) });
      }

      matchStage.$or = searchConditions;
    }

    const sortStage = { createdAt: sortOrder === "asc" ? 1 : -1 };

    const invoices = await Invoice.aggregate([
      {
        $lookup: {
          from: "customers",
          localField: "customer",
          foreignField: "_id",
          as: "customerData",
        },
      },
      { $unwind: { path: "$customerData", preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: "deliveryboys",
          localField: "deliveryBoy",
          foreignField: "_id",
          as: "deliveryBoyData",
        },
      },
      {
        $unwind: { path: "$deliveryBoyData", preserveNullAndEmptyArrays: true },
      },
      { $match: matchStage },
      { $sort: sortStage },
      { $skip: skip },
      { $limit: limit },
    ]);

    const totalInvoices = await Invoice.aggregate([
      {
        $lookup: {
          from: "customers",
          localField: "customer",
          foreignField: "_id",
          as: "customerData",
        },
      },
      { $unwind: { path: "$customerData", preserveNullAndEmptyArrays: true } },
      { $match: matchStage },
      { $count: "count" },
    ]);

    const totalCount = totalInvoices.length > 0 ? totalInvoices[0].count : 0;
    const totalPages = Math.ceil(totalCount / limit);

    const formattedInvoices = invoices.map((invoice) => ({
      invoiceId: invoice?._id,
      invoiceNumber: invoice?.invoiceNumber,
      customerName: invoice?.customerData?.name || "N/A",
      phoneNumber: invoice?.phoneNumber || invoice?.customerData?.phoneNumber,
      subscriptionPlan: invoice?.subscriptionPlan || "N/A",
      totalAmount: invoice?.totals?.subtotal || 0,
      status: invoice?.payment?.status || "Unpaid",
      pdfUrl: invoice?.pdfUrl,
      period: {
        startDate: invoice?.period?.startDate
          ? moment(invoice?.period?.startDate).format("DD/MM/YYYY")
          : null,
        endDate: invoice?.period?.endDate
          ? moment(invoice?.period?.endDate).format("DD/MM/YYYY")
          : null,
      },
      createdAt: invoice?.createdAt,
    }));

    return res.status(200).json({
      success: true,
      message: "Invoices fetched successfully",
      totalInvoices: totalCount,
      totalPages,
      currentPage: page,
      previous: page > 1,
      next: page < totalPages,
      invoices: formattedInvoices,
    });
  } catch (error) {
    console.error("getAllCustomerInvoices Error:", error);
    return res.status(500).json({
      success: false,
      message: "Error fetching invoices",
      error: error.message,
    });
  }
};

//✅ Search Customers
const searchCustomers = async (req, res) => {
  try {
    const { customerName, phoneNumber } = req.query;

    if (!customerName && !phoneNumber) {
      return res.status(400).json({
        success: false,
        message: "Either customerName or phoneNumber is required",
      });
    }

    let searchCriteria = {};

    if (customerName && phoneNumber) {
      searchCriteria.$or = [
        { name: { $regex: customerName, $options: "i" } },
        {
          $expr: {
            $regexMatch: {
              input: { $toString: "$phoneNumber" },
              regex: phoneNumber,
              options: "i",
            },
          },
        },
      ];
    } else if (customerName) {
      searchCriteria.name = { $regex: customerName, $options: "i" };
    } else if (phoneNumber) {
      searchCriteria.$expr = {
        $regexMatch: {
          input: { $toString: "$phoneNumber" },
          regex: phoneNumber,
          options: "i",
        },
      };
    }

    searchCriteria.isDeleted = false;
    searchCriteria.subscriptionStatus = "active";

    const customers = await Customer.find(searchCriteria)
      .select(
        "name phoneNumber address subscriptionPlan paymentMethod paymentStatus"
      )
      .populate("deliveryBoy", "name")
      .limit(10);

    return res.json({
      success: true,
      message: "Customers Information fetched successfully",
      customersData: customers.map((customer) => ({
        _id: customer._id,
        name: customer.name,
        phoneNumber: customer.phoneNumber,
      })),
    });
  } catch (error) {
    console.error("Error searching customers:", error);
    return res.status(500).json({
      success: false,
      message: "Error searching customers",
      error: error.message,
    });
  }
};

//✅ Get Customer Data
const getCustomerData = async (req, res) => {
  try {
    const { customerId } = req.params;
    const { startDate, endDate } = req.query;

    if (!customerId) {
      return res.status(400).json({
        success: false,
        message: "Customer ID is required",
      });
    }

    const customer = await Customer.findById(customerId)
      .populate(
        "products.product",
        "productName productCode price size description"
      )
      .populate("deliveryBoy", "name phoneNumber");

    if (!customer) {
      return res.status(404).json({
        success: false,
        message: "Customer not found",
      });
    }

    const {
      finalStartDate,
      finalEndDate,
      isPartialPayment,
      partialPaymentDays,
    } = await determineDateRange(
      customerId,
      customer,
      startDate,
      endDate,
      paymentStatus
    );

    const existingInvoice = await Invoice.findOne({
      customer: customerId,
      "period.startDate": { $lte: finalEndDate },
      "period.endDate": { $gte: finalStartDate },
    });

    if (existingInvoice) {
      return res.status(409).json({
        success: false,
        message: "Invoice already exists for this date range",
        existingInvoice: {
          invoiceNumber: existingInvoice.invoiceNumber,
          period: {
            startDate: formatDateToDDMMYYYY(existingInvoice.period.startDate),
            endDate: formatDateToDDMMYYYY(existingInvoice.period.endDate),
          },
          status: existingInvoice.payment?.status || "Unpaid",
          pdfUrl: existingInvoice.pdfUrl,
        },
      });
    }

    const orders = await fetchOrdersInRange(
      customerId,
      finalStartDate,
      finalEndDate,
      paymentStatus
    );
    const { products, totalAmount } = processProducts(orders, paymentStatus);
    const { actualOrders, absentDays } = await calculateDeliveryStats(
      orders,
      finalStartDate,
      finalEndDate,
      paymentStatus,
      customerId
    );
    const { grandTotal, carryForwardAmount, balanceAmount } =
      await calculateFinancials(
        customerId,
        totalAmount,
        isPartialPayment,
        partialPaymentDays,
        finalStartDate,
        finalEndDate
      );

    return res.json({
      success: true,
      message: "Customer data retrieved successfully",
      customer: {
        _id: customer._id,
        name: customer.name,
        phoneNumber: customer.phoneNumber,
        address: customer.address,
        subscriptionPlan: customer.subscriptionPlan,
        deliveryBoy: customer.deliveryBoy?.name,
      },
      period: {
        startDate: formatDateToDDMMYYYY(finalStartDate),
        endDate: formatDateToDDMMYYYY(finalEndDate),
      },
      products,
      grandTotal,
      deliveryStats: {
        actualOrders,
        absentDays: absentDays.length,
        deliveries: actualOrders,
      },
      partialPayment: isPartialPayment
        ? {
            partialPaymentAmount: totalAmount,
            partialPaymentDays,
            balanceAmount,
          }
        : false,
    });
  } catch (error) {
    console.error("Error getting customer data:", error);
    return res.status(500).json({
      success: false,
      message: "Error getting customer data",
      error: error.message,
    });
  }
};

//✅ Get Invoice By Id
const getInvoiceById = async (req, res) => {
  try {
    const { invoiceId } = req.params;
    if (!invoiceId) {
      return res.status(400).json({
        success: false,
        message: "Invoice ID is required",
      });
    }

    const invoice = await Invoice.findById(invoiceId);
    if (!invoice) {
      return res.status(404).json({
        success: false,
        message: "Invoice not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Invoice By Id retrieved successfully",
      invoice,
    });
  } catch (error) {
    console.error("Error getting invoice by id:", error);
    return res.status(500).json({
      success: false,
      message: "Error getting invoice by id",
      error: error.message,
    });
  }
};

// Helper function to determine date range
const determineDateRange = async (
  customerId,
  customer,
  startDate,
  endDate,
  paymentStatus
) => {
  let start, end;

  if (startDate && endDate) {
    start = parseUniversalDate(startDate) || new Date(startDate);
    end = parseUniversalDate(endDate) || new Date(endDate);
  } else if (startDate) {
    start = parseUniversalDate(startDate) || new Date(startDate);
    end = await getLastOrderDate(customerId, start);
  } else if (endDate) {
    start = await getFirstOrderDate(customerId);
    end = parseUniversalDate(endDate) || new Date(endDate);
  } else {
    start = await getFirstOrderDate(customerId);
    end = await getLastOrderDate(customerId, start);
  }

  // Validate and fix dates
  if (!start || isNaN(start.getTime())) start = new Date();
  if (!end || isNaN(end.getTime())) end = new Date();
  if (start > end) [start, end] = [end, start];

  // Handle partial payment
  let finalStartDate = start;
  let finalEndDate = end;
  let isPartialPayment = false;
  let partialPaymentDays = 0;

  if (paymentStatus === "Partially Paid") {
    const totalDays =
      Math.ceil((end.getTime() - start.getTime()) / (1000 * 3600 * 24)) + 1;
    partialPaymentDays = Math.floor(totalDays / 2);
    finalEndDate = new Date(
      start.getTime() + (partialPaymentDays - 1) * (1000 * 3600 * 24)
    );
    isPartialPayment = true;
  }

  return { finalStartDate, finalEndDate, isPartialPayment, partialPaymentDays };
};

// Helper function to get start date from last invoice
const getStartDateFromLastInvoice = (customer, existingInvoices) => {
  if (existingInvoices.length > 0) {
    const lastInvoice = existingInvoices[0];
    const isUnpaidOrPartial = ["Unpaid", "Partially Paid"].includes(
      lastInvoice.payment?.status
    );
    const targetDate = isUnpaidOrPartial
      ? lastInvoice.period?.startDate
      : lastInvoice.period?.endDate;
    return parseUniversalDate(targetDate) || new Date(targetDate);
  }
  return parseUniversalDate(customer.startDate) || new Date(customer.startDate);
};

// Helper function to get first order date
const getFirstOrderDate = async (customerId) => {
  const firstOrder = await CustomerOrders.findOne({
    customer: customerId,
    status: "Delivered",
    paymentStatus: { $in: ["Paid", "Partially Paid"] },
  }).sort({ deliveryDate: 1 });

  if (firstOrder) {
    return (
      parseUniversalDate(firstOrder.deliveryDate) ||
      new Date(firstOrder.deliveryDate)
    );
  }

  return null;
};

// Helper function to get last order date
const getLastOrderDate = async (customerId, startDate) => {
  const allDeliveredOrders = await CustomerOrders.find({
    customer: customerId,
    status: "Delivered",
    paymentStatus: { $in: ["Paid", "Partially Paid"] },
  });

  let lastOrder = null;
  let latestDate = null;

  for (const order of allDeliveredOrders) {
    const orderDate = parseUniversalDate(order.deliveryDate);
    if (orderDate && (!latestDate || orderDate > latestDate)) {
      latestDate = orderDate;
      lastOrder = order;
    }
  }

  if (lastOrder) {
    return (
      parseUniversalDate(lastOrder.deliveryDate) ||
      new Date(lastOrder.deliveryDate)
    );
  }

  return startDate || new Date();
};

// Helper function to fetch orders in range
const fetchOrdersInRange = async (
  customerId,
  startDate,
  endDate,
  paymentStatus
) => {
  const allOrders = await CustomerOrders.find({
    customer: customerId,
    status: "Delivered",
    paymentStatus: { $in: ["Paid", "Partially Paid"] },
  }).populate("products._id", "productName productCode price size description");

  const startDateObj =
    parseUniversalDate(formatDateToDDMMYYYY(startDate)) || startDate;
  const endDateObj =
    parseUniversalDate(formatDateToDDMMYYYY(endDate)) || endDate;

  const orders = allOrders.filter((order) => {
    const orderDate = parseUniversalDate(order.deliveryDate);
    return orderDate && orderDate >= startDateObj && orderDate <= endDateObj;
  });

  return orders;
};

// Helper function to process products
const processProducts = (orders, paymentStatus) => {
  const productMap = new Map();

  // All orders are already filtered to be delivered, so no need to check status
  orders.forEach((order) => {
    order.products.forEach((product) => {
      const key = `${product._id._id}_${product.productSize}`;
      const price = parseFloat(product.price);

      if (productMap.has(key)) {
        const existing = productMap.get(key);
        existing.quantity += product.quantity;
        existing.totalPrice = existing.quantity * existing.price;
      } else {
        productMap.set(key, {
          productId: product._id._id,
          productName: product._id.productName,
          productCode: product._id.productCode,
          productSize: product.productSize,
          quantity: product.quantity,
          price: price,
          totalPrice: product.quantity * price,
        });
      }
    });
  });

  const products = Array.from(productMap.values());
  const totalAmount = products.reduce(
    (sum, product) => sum + product.totalPrice,
    0
  );

  return { products, totalAmount };
};

// Helper function to calculate delivery stats
const calculateDeliveryStats = async (
  orders,
  startDate,
  endDate,
  paymentStatus,
  customerId
) => {
  // All orders are already filtered to be delivered
  const actualOrders = orders.length;

  const startDateStr = formatDateToDDMMYYYY(startDate);
  const endDateStr = formatDateToDDMMYYYY(endDate);
  const startDateObj =
    parseUniversalDate(startDateStr) || new Date(startDateStr);
  const endDateObj = parseUniversalDate(endDateStr) || new Date(endDateStr);

  const allDates = [];
  const currentDate = new Date(startDateObj);
  while (currentDate <= endDateObj) {
    allDates.push(formatDateToDDMMYYYY(new Date(currentDate)));
    currentDate.setDate(currentDate.getDate() + 1);
  }

  // All orders are already filtered to be delivered
  const orderDates = orders.map((order) => order.deliveryDate);

  // Get customer's absent days list
  const customer = await Customer.findById(customerId);
  const customerAbsentDays = customer.absentDays.map((absentDate) =>
    formatDateToDDMMYYYY(absentDate)
  );

  // Only count dates that have no order AND are in customer's absent list
  const absentDays = allDates
    .filter(
      (date) => !orderDates.includes(date) && customerAbsentDays.includes(date)
    )
    .map((date) => new Date(parseUniversalDate(date) || new Date(date)));

  return { actualOrders, absentDays };
};

// Helper function to calculate financials
const calculateFinancials = async (
  customerId,
  totalAmount,
  isPartialPayment,
  partialPaymentDays,
  startDate,
  endDate
) => {
  const previousUnpaidInvoices = await Invoice.find({
    customer: customerId,
    "payment.status": { $in: ["Unpaid", "Partially Paid"] },
  }).sort({ createdAt: 1 });

  const carryForwardAmount = previousUnpaidInvoices.reduce((total, invoice) => {
    const invoiceTotal = invoice.totals?.subtotal || 0;
    const paidAmount = invoice.totals?.paidAmount || 0;
    return total + (invoiceTotal - paidAmount);
  }, 0);

  let balanceAmount = 0;
  if (isPartialPayment) {
    const fullPeriodAmount = await calculateFullPeriodAmount(
      customerId,
      startDate,
      endDate
    );
    balanceAmount = fullPeriodAmount - totalAmount;
  }

  const grandTotal = totalAmount + carryForwardAmount;

  return { grandTotal, carryForwardAmount, balanceAmount };
};

// Helper function to update payment status and method for orders in date range
const updateOrdersPaymentStatus = async (
  customerId,
  period,
  paymentStatus,
  paymentMethod,
  partialPayment
) => {
  try {
    const startDate =
      parseUniversalDate(period.startDate) || new Date(period.startDate);
    const endDate =
      parseUniversalDate(period.endDate) || new Date(period.endDate);

    // Find all orders for the customer in the date range
    // Filter based on delivery status and payment status
    let orderFilter = {
      customer: customerId,
      deliveryDate: {
        $gte: formatDateToDDMMYYYY(startDate),
        $lte: formatDateToDDMMYYYY(endDate),
      },
      status: "Delivered", // Only include delivered orders
    };

    // If payment status is "Paid", only include orders that are not already paid
    // If payment status is "Partially Paid", include orders that are unpaid or partially paid
    // If payment status is "Unpaid", don't update any orders
    if (paymentStatus === "Paid") {
      orderFilter.paymentStatus = {
        $in: ["Pending", "Unpaid", "Partially Paid"],
      };
    } else if (paymentStatus === "Partially Paid") {
      orderFilter.paymentStatus = {
        $in: ["Pending", "Unpaid", "Partially Paid"],
      };
    } else {
      // For unpaid status, don't update any orders
      console.log("No orders to update for unpaid status");
      return;
    }

    const orders = await CustomerOrders.find(orderFilter);

    if (orders.length === 0) {
      console.log("No delivered orders found in the specified date range");
      return;
    }

    // Determine which orders to update based on payment type
    let ordersToUpdate = [];

    if (paymentStatus === "Paid") {
      // Update all filtered orders if fully paid
      ordersToUpdate = orders;
    } else if (paymentStatus === "Partially Paid" && partialPayment) {
      // For partial payment, update orders up to the partial payment amount
      let remainingAmount = partialPayment.partialPaymentAmount;
      ordersToUpdate = [];

      // Sort orders by delivery date to process chronologically
      const sortedOrders = orders.sort(
        (a, b) =>
          new Date(a.deliveryDate.split("/").reverse().join("-")) -
          new Date(b.deliveryDate.split("/").reverse().join("-"))
      );

      for (const order of sortedOrders) {
        const orderTotal = order.products.reduce(
          (sum, product) => sum + (product.totalPrice || 0),
          0
        );

        if (remainingAmount >= orderTotal) {
          ordersToUpdate.push(order);
          remainingAmount -= orderTotal;
        } else {
          // If remaining amount is less than order total,
          // we can still mark it as partially paid
          ordersToUpdate.push(order);
          break;
        }
      }
    }

    // Update the selected orders
    const updatePromises = ordersToUpdate.map(async (order) => {
      const updateData = {
        paymentStatus: paymentStatus,
        paymentMethod: paymentMethod,
      };

      // If it's a partial payment and this is the last order that might not be fully covered
      if (paymentStatus === "Partially Paid" && partialPayment) {
        const orderTotal = order.products.reduce(
          (sum, product) => sum + (product.totalPrice || 0),
          0
        );

        // Check if this order should be marked as partially paid
        const remainingAmount =
          partialPayment.partialPaymentAmount -
          ordersToUpdate
            .slice(0, ordersToUpdate.indexOf(order))
            .reduce(
              (sum, prevOrder) =>
                sum +
                prevOrder.products.reduce(
                  (orderSum, product) => orderSum + (product.totalPrice || 0),
                  0
                ),
              0
            );

        if (remainingAmount < orderTotal) {
          updateData.paymentStatus = "Partially Paid";
        }
      }

      return CustomerOrders.findByIdAndUpdate(order._id, updateData, {
        new: true,
      });
    });

    const updatedOrders = await Promise.all(updatePromises);

    console.log(`Updated payment status for ${updatedOrders.length} orders`);
    console.log(
      `Payment Status: ${paymentStatus}, Payment Method: ${paymentMethod}`
    );

    return updatedOrders;
  } catch (error) {
    console.error("Error updating orders payment status:", error);
    throw error;
  }
};

//✅ Generate Monthly Invoices for All Customers
const generateMonthlyInvoices = async (req, res) => {
  try {
    const { month, year } = req.body;

    if (!month || !year) {
      return res.status(400).json({
        success: false,
        message: "Month and year are required",
      });
    }

    // Get all active customers
    const customers = await Customer.find({
      isDeleted: false,
      subscriptionStatus: "active",
    }).populate("deliveryBoy", "name");

    const results = [];
    const errors = [];

    for (const customer of customers) {
      try {
        const result = await generateCustomerMonthlyInvoice(
          customer,
          month,
          year
        );
        results.push(result);
      } catch (error) {
        console.error(
          `Error generating invoice for customer ${customer._id}:`,
          error
        );
        errors.push({
          customerId: customer._id,
          customerName: customer.name,
          error: error.message,
        });
      }
    }

    return res.status(200).json({
      success: true,
      message: "Monthly invoice generation completed",
      totalCustomers: customers.length,
      successfulInvoices: results.length,
    });
  } catch (error) {
    console.error("Error generating monthly invoices:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to generate monthly invoices",
      error: error.message,
    });
  }
};

// Helper function to generate monthly invoice for a single customer
const generateCustomerMonthlyInvoice = async (customer, month, year) => {
  const customerId = customer._id;
  const subscriptionPlan = customer.subscriptionPlan;

  // Calculate date range based on subscription plan
  const { startDate, endDate } = calculateMonthlyDateRange(
    month,
    year,
    subscriptionPlan,
    customer
  );

  // Check if invoice already exists for this period
  const existingInvoice = await Invoice.findOne({
    customer: customerId,
    "period.startDate": { $lte: endDate },
    "period.endDate": { $gte: startDate },
  });

  if (existingInvoice) {
    // If existing invoice is unpaid, delete it
    if (
      ["Unpaid", "Partially Paid"].includes(existingInvoice.payment?.status)
    ) {
      await Invoice.findByIdAndDelete(existingInvoice._id);
      console.log(
        `Deleted unpaid invoice ${existingInvoice.invoiceNumber} for customer ${customer.name}`
      );
    } else {
      return {
        customerId,
        customerName: customer.name,
        status: "skipped",
        reason: "Invoice already exists and is paid",
        invoiceNumber: existingInvoice.invoiceNumber,
      };
    }
  }

  // Fetch unpaid orders in the date range
  const unpaidOrders = await CustomerOrders.find({
    customer: customerId,
    status: "Delivered",
    paymentStatus: { $in: ["Unpaid", "Partially Paid"] },
    deliveryDate: {
      $gte: formatDateToDDMMYYYY(startDate),
      $lte: formatDateToDDMMYYYY(endDate),
    },
  }).populate("products._id", "productName productCode price size description");

  if (unpaidOrders.length === 0) {
    return {
      customerId,
      customerName: customer.name,
      status: "skipped",
      reason: "No unpaid orders found for this period",
    };
  }

  // Process products from unpaid orders
  const { products, totalAmount } = processProducts(unpaidOrders);

  // Calculate delivery stats
  const { actualOrders, absentDays } = await calculateDeliveryStats(
    unpaidOrders,
    startDate,
    endDate,
    "Unpaid",
    customerId
  );

  // Calculate financials (including carry forward from previous unpaid invoices)
  const { grandTotal, carryForwardAmount } = await calculateFinancials(
    customerId,
    totalAmount,
    false,
    0,
    startDate,
    endDate
  );

  // Generate invoice
  const invoiceNumber = generateInvoiceNumber();
  const invoice = await Invoice.create({
    invoiceNumber,
    gstNumber,
    customer: customerId,
    phoneNumber: parseInt(customer.phoneNumber),
    address: customer.address,
    subscriptionPlan,
    Deliveries: actualOrders,
    absentDays: absentDays.map((date) => new Date(date)),
    actualOrders,
    period: {
      startDate,
      endDate,
    },
    products: products.map((product) => ({
      productId: product.productId,
      productName: product.productName,
      productSize: product.productSize,
      quantity: product.quantity,
      price: product.price,
      totalPrice: product.totalPrice,
    })),
    payment: {
      status: "Unpaid",
      method: customer.paymentMethod || "COD",
    },
    totals: {
      subtotal: totalAmount,
      paidAmount: 0,
      balanceAmount: grandTotal,
      carryForwardAmount,
      partiallyPaidAmount: 0,
      paidDate: null,
    },
    state: "Draft",
    includedOrders: unpaidOrders.map((order) => order._id),
  });

  // Generate PDF
  const invoiceWithStats = {
    ...invoice.toObject(),
    customer: {
      name: customer.name,
      phoneNumber: customer.phoneNumber,
      address: customer.address,
    },
    deliveryStats: {
      actualOrders,
      absentDays: absentDays.length,
      deliveries: actualOrders,
    },
  };

  const pdfBuffer = await generateInvoicePDF(invoiceWithStats);
  const result = await new Promise((resolve, reject) => {
    cloudinary.uploader
      .upload_stream(
        {
          resource_type: "raw",
          folder: "Pench/Invoices",
          public_id: `invoice-${invoiceNumber}`,
          format: "pdf",
        },
        (error, result) => {
          if (error) {
            reject(error);
          } else {
            resolve(result);
          }
        }
      )
      .end(pdfBuffer);
  });

  invoice.pdfUrl = result.secure_url;
  await invoice.save();

  return {
    customerId,
    customerName: customer.name,
    status: "success",
    invoiceNumber: invoice.invoiceNumber,
    pdfUrl: result.secure_url,
    totalAmount: grandTotal,
    ordersCount: unpaidOrders.length,
    period: {
      startDate: formatDateToDDMMYYYY(startDate),
      endDate: formatDateToDDMMYYYY(endDate),
    },
  };
};

// Helper function to calculate monthly date range
const calculateMonthlyDateRange = (month, year, subscriptionPlan, customer) => {
  let startDate, endDate;

  if (subscriptionPlan === "Custom Date") {
    // For Custom Date plans, use customer's delivery dates
    const deliveryDates = customer.customerDeliveryDates || [];
    if (deliveryDates.length === 0) {
      throw new Error("No delivery dates found for Custom Date plan customer");
    }

    // Find the last delivery date in the specified month/year
    const targetMonth = parseInt(month);
    const targetYear = parseInt(year);

    const monthDeliveryDates = deliveryDates.filter((date) => {
      const deliveryDate = new Date(date);
      return (
        deliveryDate.getMonth() + 1 === targetMonth &&
        deliveryDate.getFullYear() === targetYear
      );
    });

    if (monthDeliveryDates.length === 0) {
      throw new Error(`No delivery dates found for ${month}/${year}`);
    }

    // Sort dates and get first and last
    const sortedDates = monthDeliveryDates.sort(
      (a, b) => new Date(a) - new Date(b)
    );
    startDate = new Date(sortedDates[0]);
    endDate = new Date(sortedDates[sortedDates.length - 1]);
  } else {
    // For regular plans, calculate month start and end
    const targetMonth = parseInt(month) - 1;
    const targetYear = parseInt(year);

    startDate = new Date(targetYear, targetMonth, 1);

    // Calculate last day of month
    endDate = new Date(targetYear, targetMonth + 1, 0);
  }

  return { startDate, endDate };
};

module.exports = {
  createCustomerInvoice,
  getAllCustomerInvoices,
  getInvoiceById,
  searchCustomers,
  getCustomerData,
  generateMonthlyInvoices,
};
