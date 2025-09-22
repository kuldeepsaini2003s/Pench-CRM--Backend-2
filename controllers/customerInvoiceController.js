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
const { verifyPaymentForInvoice } = require("./paymentController");

const gstNumber = process.env.GST_NUMBER;

//✅ Create Customer Invoice
const createCustomerInvoice = async (req, res) => {
  try {
    const { customerId, period } = req.body;

    if (!customerId || !period) {
      return res.status(400).json({
        success: false,
        message: "Customer and period are required",
      });
    }

    const customer = await Customer.findById(customerId);

    if (!customer) {
      return res.status(400).json({
        success: false,
        message: "Customer not found with the given id",
      });
    }

    // Fetch orders for the specific date range
    const orders = await CustomerOrders.find({
      customer: customerId,
      status: "Delivered",
      paymentStatus: { $in: ["Paid", "Partially Paid"] },
      deliveryDate: {
        $gte: period?.startDate,
        $lte: period?.endDate,
      },
    }).populate(
      "products._id",
      "productName productCode price size description"
    );

    // Check if invoice already exists for this customer and period
    const existingInvoice = await Invoice.findOne({
      customer: customerId,
      "period.startDate": {
        $lte: period.endDate || new Date(period.endDate),
      },
      "period.endDate": {
        $gte: period.startDate || new Date(period.startDate),
      },
    });

    // Handle existing invoice based on payment status
    if (existingInvoice) {
      if (
        existingInvoice.payment.status === "Paid" ||
        existingInvoice.payment.status === "Partially Paid"
      ) {
        return res.status(200).json({
          success: false,
          message: "Invoice already created for this customer and period",
          existingInvoice: {
            invoiceId: existingInvoice._id,
            invoiceNumber: existingInvoice.invoiceNumber,
            period: {
              startDate: formatDateToDDMMYYYY(existingInvoice.period.startDate),
              endDate: formatDateToDDMMYYYY(existingInvoice.period.endDate),
            },
            paymentStatus: existingInvoice.payment.status,
            totalAmount: existingInvoice.totals.subtotal,
            paidAmount: existingInvoice.totals.paidAmount,
            balanceAmount: existingInvoice.totals.balanceAmount,
          },
        });
      } else if (existingInvoice.payment.status === "Unpaid") {
        // Delete unpaid invoice to create a new one
        await Invoice.findByIdAndDelete(existingInvoice._id);
      }
    }

    if (orders.length === 0) {
      return res.status(404).json({
        success: false,
        message: "No orders found for this customer in the specified period",
      });
    }

    // ✅ Verify payment before creating invoice
    const paymentVerification = await verifyPaymentForInvoice(
      customerId,
      period.startDate,
      period.endDate
    );

    if (!paymentVerification.success) {
      return res.status(400).json({
        success: false,
        message: "Payment verification failed",
        details: paymentVerification.message,
      });
    }

    // Check if payment amounts match order amounts
    if (!paymentVerification.verification.isAmountMatching) {
      return res.status(400).json({
        success: false,
        message: "Payment verification failed: Amount mismatch",
        verification: {
          totalPaidAmount: paymentVerification.verification.totalPaidAmount,
          totalOrderAmount: paymentVerification.verification.totalOrderAmount,
          difference: paymentVerification.verification.difference,
          ordersFound: paymentVerification.verification.ordersFound,
        },
        payment: paymentVerification.payment,
      });
    }
    // Process products from orders
    const { products, totalAmount } = processProducts(orders);

    // Calculate payment status based on orders
    const paidOrders = orders.filter((order) => order.paymentStatus === "Paid");

    const partiallyPaidOrders = orders.filter(
      (order) => order.paymentStatus === "Partially Paid"
    );

    let paymentStatus = "Paid";

    if (partiallyPaidOrders.length > 0) {
      paymentStatus = "Partially Paid";
    }

    // Calculate payment amounts
    const paidAmount = totalAmount;
    const balanceAmount = 0;

    const invoiceNumber = generateInvoiceNumber();

    const invoice = await Invoice.create({
      invoiceNumber,
      gstNumber,
      customer: customerId,
      phoneNumber: parseInt(customer.phoneNumber),
      address: customer.address,
      subscriptionPlan: customer.subscriptionPlan,
      Deliveries: orders.length,
      absentDays: [],
      actualOrders: orders.length,
      period: {
        startDate: period.startDate || new Date(period.startDate),
        endDate: period.endDate || new Date(period.endDate),
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
        status: paymentVerification?.payment?.paymentStatus,
        method: paymentVerification?.payment?.paymentMethod || "COD",
      },
      totals: {
        subtotal: totalAmount,
        paidAmount: paidAmount,
        balanceAmount: balanceAmount,
      },
      state: "Draft",
      includedOrders: orders.map((order) => order._id),
    });

    const invoiceWithStats = {
      ...invoice.toObject(),
      customer: {
        name: customer.name,
        phoneNumber: customer.phoneNumber,
        address: customer.address,
      },
      deliveryStats: {
        actualOrders: orders.length,
        absentDays: 0,
        deliveries: orders.length,
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

    return res.status(201).json({
      success: true,
      message: "Invoice created successfully",
      data: {
        invoiceId: invoice._id,
        invoiceNumber: invoice.invoiceNumber,
        pdfUrl: result.secure_url,
        paymentStatus: paymentVerification?.payment?.paymentStatus,
        paymentMethod: paymentVerification?.payment?.paymentMethod,
        totalAmount: totalAmount,
        paidAmount: paidAmount,
        balanceAmount: balanceAmount,
        period: {
          startDate: formatDateToDDMMYYYY(period.startDate),
          endDate: formatDateToDDMMYYYY(period.endDate),
        },
        ordersCount: orders.length,
      },
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
        { "period.startDate": { $lte: startDateObj } },
        { "period.endDate": { $gte: endDateObj } },
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
    const { startDate: requestedStartDate, endDate: requestedEndDate } =
      req.query;

    if (!customerId) {
      return res.status(400).json({
        success: false,
        message: "Customer ID is required",
      });
    }

    const customer = await Customer.findById(customerId).populate(
      "deliveryBoy",
      "name phoneNumber"
    );

    if (!customer) {
      return res.status(404).json({
        success: false,
        message: "Customer not found",
      });
    }

    // Check if specific date range is provided
    let startDate, endDate;
    let orders;

    if (requestedStartDate && requestedEndDate) {
      // Use provided date range
      startDate =
        formatDateToDDMMYYYY(requestedStartDate) ||
        new Date(requestedStartDate);
      endDate =
        formatDateToDDMMYYYY(requestedEndDate) || new Date(requestedEndDate);

      // Check if invoice already exists for this date range
      const existingInvoice = await Invoice.findOne({
        customer: customerId,
        "period.startDate": { $lte: endDate },
        "period.endDate": { $gte: startDate },
        "payment.status": { $in: ["Paid", "Partially Paid"] },
      });

      if (existingInvoice) {
        if (deleteExisting === "true") {
          // Delete the existing invoice
          await Invoice.findByIdAndDelete(existingInvoice._id);
        } else {
          return res.status(400).json({
            success: false,
            message: "Invoice already created for this date range",
            existingInvoice: {
              invoiceNumber: existingInvoice.invoiceNumber,
              period: {
                startDate: formatDateToDDMMYYYY(
                  existingInvoice.period.startDate
                ),
                endDate: formatDateToDDMMYYYY(existingInvoice.period.endDate),
              },
              paymentStatus: existingInvoice.payment.status,
            },
          });
        }
      }
      // Fetch orders for the specific date range
      orders = await CustomerOrders.find({
        customer: customerId,
        status: "Delivered",
        paymentStatus: { $in: ["Paid", "Partially Paid"] },
        deliveryDate: {
          $gte: startDate,
          $lte: endDate,
        },
      }).populate(
        "products._id",
        "productName productCode price size description"
      );
    } else {
      // Check if customer has any existing invoices with Paid or Partially Paid status
      const existingInvoices = await Invoice.find({
        customer: customerId,
        "payment.status": { $in: ["Paid", "Partially Paid"] },
      }).sort({ "period.endDate": -1 });

      if (existingInvoices.length > 0) {
        const lastInvoice = existingInvoices[0];
        startDate =
          formatDateToDDMMYYYY(lastInvoice.period.endDate) ||
          new Date(lastInvoice.period.endDate);
        startDate.setDate(startDate.getDate() + 1);

        // Fetch orders from this startDate onwards
        orders = await CustomerOrders.find({
          customer: customerId,
          status: "Delivered",
          paymentStatus: { $in: ["Paid", "Partially Paid"] },
          deliveryDate: { $gte: startDate },
        }).populate(
          "products._id",
          "productName productCode price size description"
        );

        if (orders.length > 0) {
          // Sort orders by delivery date to get the last date
          const sortedOrders = orders.sort((a, b) => {
            const dateA = new Date(a.deliveryDate);
            const dateB = new Date(b.deliveryDate);
            return dateA - dateB;
          });
          endDate =
            formatDateToDDMMYYYY(
              sortedOrders[sortedOrders.length - 1].deliveryDate
            ) || new Date(sortedOrders[sortedOrders.length - 1].deliveryDate);
        } else {
          return res.status(404).json({
            success: false,
            message:
              "No new orders found for this customer after the last invoice period",
          });
        }
      } else {
        // No existing invoices, fetch all orders with Paid or Partially Paid status
        orders = await CustomerOrders.find({
          customer: customerId,
          status: "Delivered",
          paymentStatus: { $in: ["Paid", "Partially Paid"] },
        }).populate(
          "products._id",
          "productName productCode price size description"
        );

        if (orders.length === 0) {
          return res.status(404).json({
            success: false,
            message: "No orders found for this customer",
          });
        }

        // Sort orders by delivery date to get first and last dates
        const sortedOrders = orders.sort((a, b) => {
          const dateA = new Date(a.deliveryDate);
          const dateB = new Date(b.deliveryDate);
          return dateA - dateB;
        });

        startDate =
          formatDateToDDMMYYYY(sortedOrders[0].deliveryDate) ||
          new Date(sortedOrders[0].deliveryDate);
        endDate =
          formatDateToDDMMYYYY(
            sortedOrders[sortedOrders.length - 1].deliveryDate
          ) || new Date(sortedOrders[sortedOrders.length - 1].deliveryDate);
      }
    }

    if (!orders || orders.length === 0) {
      return res.status(404).json({
        success: false,
        message: "No orders found for this customer in the specified period",
      });
    }

    // ✅ Verify payment before returning customer data for invoice creation
    const paymentVerification = await verifyPaymentForInvoice(
      customerId,
      startDate,
      endDate
    );

    // Check if payment amounts match order amounts
    if (
      paymentVerification.success &&
      !paymentVerification.verification.isAmountMatching
    ) {
      return res.status(400).json({
        success: false,
        message: "Payment verification failed: Amount mismatch",
        verification: {
          totalPaidAmount: paymentVerification.verification.totalPaidAmount,
          totalOrderAmount: paymentVerification.verification.totalOrderAmount,
          difference: paymentVerification.verification.difference,
          paymentsFound: paymentVerification.verification.paymentsFound,
          ordersFound: paymentVerification.verification.ordersFound,
        },
        payment: paymentVerification.payment,
      });
    }

    const { products, totalAmount } = processProducts(orders);

    // Calculate payment status based on orders
    const paidOrders = orders.filter((order) => order.paymentStatus === "Paid");
    const partiallyPaidOrders = orders.filter(
      (order) => order.paymentStatus === "Partially Paid"
    );

    let paymentStatus = "Paid";
    if (partiallyPaidOrders.length > 0) {
      paymentStatus = "Partially Paid";
    }

    // Calculate totals
    const paidAmount = totalAmount;
    const balanceAmount = 0;

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
        startDate: formatDateToDDMMYYYY(startDate),
        endDate: formatDateToDDMMYYYY(endDate),
      },
      products,
      totalPaid: paidAmount,
      balanceAmount: balanceAmount,
      paymentStatus: paymentStatus,
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

    const invoice = await Invoice.findById(invoiceId).populate(
      "customer",
      "name phoneNumber address subscriptionPlan"
    );

    if (!invoice) {
      return res.status(404).json({
        success: false,
        message: "Invoice not found",
      });
    }

    const invoiceObj = invoice.toObject();
    const { customer, ...invoiceWithoutCustomer } = invoiceObj;

    const invoiceWithStats = {
      customerName: customer.name,
      ...invoiceWithoutCustomer,
    };

    return res.status(200).json({
      success: true,
      message: "Invoice By Id retrieved successfully",
      invoice: invoiceWithStats,
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

// Helper function to process products
const processProducts = (orders) => {
  const productMap = new Map();

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
    if (existingInvoice.payment?.status === "Unpaid") {
      await Invoice.findByIdAndDelete(existingInvoice._id);
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
      balanceAmount: 0,
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
