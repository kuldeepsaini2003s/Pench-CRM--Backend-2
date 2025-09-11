const Invoice = require("../models/customerInvoicesModel");
const ErrorHandler = require("../utils/errorhendler");
const generateInvoiceNumber = require("../utils/generateInvoiceNumber");
const { generateInvoicePDF } = require("../service/pdfService");
const { uploadBufferToCloudinary } = require("../service/cloudinaryService");
const Customer = require("../models/customerModel");
const CustomerOrders = require("../models/customerOrderModel");
const {
  parseUniversalDate,
  formatDateToDDMMYYYY,
} = require("../utils/parsedDateAndDay");
const { calculateFullPeriodAmount } = require("../helper/helperFuctions");

// ✅ Create Invoice
const createCustomerInvoice = async (req, res) => {
  try {
    const {
      customerName,
      phoneNumber,
      productType,
      productSize,
      productQuantity,
      price,
      subscriptionPlan,
      paymentMode,
      paymentStatus,
    } = req.body;

    if (
      !customerName ||
      !phoneNumber ||
      !productType ||
      !productSize ||
      !productQuantity ||
      !price ||
      !paymentMode
    ) {
      return res.status(400).json({
        success: false,
        message: "All required fields must be filled",
      });
    }

    const invoiceNumber = generateInvoiceNumber();

    const invoice = await Invoice.create({
      customerName,
      phoneNumber,
      invoiceNumber,
      productType,
      productSize,
      productQuantity,
      price,
      subscriptionPlan,
      paymentMode,
      paymentStatus,
      invoiceDate: new Date(),
    });

    //  PDF generate
    const pdfBuffer = await generateInvoicePDF(invoice);

    //  Upload Cloudinary
    const result = await uploadBufferToCloudinary(
      pdfBuffer,
      `invoice-${invoiceNumber}`
    );

    invoice.pdfUrl = result.secure_url;
    await invoice.save();

    res.status(201).json({
      success: true,
      message: "Invoice created successfully",
      invoice,
    });
  } catch (error) {
    console.log(error);
    return res.status(500).json({
      success: false,
      message: "Failed To Create Invoice",
    });
  }
};

// ✅ Get All Customer Invoices
const getAllCustomerInvoices = async (req, res, next) => {
  let {
    name,
    phoneNumber,
    status,
    startDate,
    endDate,
    sort = "-createdAt",
    page = 1,
    limit = 10,
  } = req.query;

  let query = {};

  if (name) {
    query.name = { $regex: name, $options: "i" };
  }

  if (phoneNumber) {
    query.phoneNumber = { $regex: phoneNumber, $options: "i" };
  }

  if (status) {
    query["products.status"] = status;
  }

  if (startDate && endDate) {
    query.createdAt = { $gte: new Date(startDate), $lte: new Date(endDate) };
  }

  page = parseInt(page);
  limit = parseInt(limit);
  const skip = (page - 1) * limit;

  const customers = await Customer.find(query)
    .select("name phoneNumber products createdAt")
    .sort(sort)
    .skip(skip)
    .limit(limit);

  if (!customers || customers.length === 0) {
    return next(new ErrorHandler("No customers found", 404));
  }

  const formattedCustomers = customers.map((cust) => {
    const firstProduct = cust.products[0];
    return {
      id: cust._id,
      name: cust.name,
      phoneNumber: cust.phoneNumber,
      startDate: firstProduct?.startDate || null,
      subscriptionPlan: firstProduct?.subscriptionPlan || "None",
      totalAmount: cust.products.reduce(
        (acc, p) => acc + (p.totalPrice || 0),
        0
      ),
      status: "Unpaid", // agar aapko product ka actual status chahiye to ye dynamic bana sakte ho
    };
  });

  const total = await Customer.countDocuments(query);

  res.status(200).json({
    success: true,
    count: formattedCustomers.length,
    page,
    totalPages: Math.ceil(total / limit),
    totalCustomers: total,
    customers: formattedCustomers,
  });
};

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

const getCustomerData = async (req, res) => {
  try {
    const { customerId } = req.params;
    const { startDate, endDate, paymentStatus } = req.query;

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

    // Check for existing invoices to determine the correct start date
    const existingInvoices = await Invoice.find({
      customer: customerId,
    }).sort({ issueDate: -1 });

    let start, end;

    if (startDate && endDate) {
      start = parseUniversalDate(startDate) || new Date(startDate);
      end = parseUniversalDate(endDate) || new Date(endDate);
    } else if (startDate) {
      start = parseUniversalDate(startDate) || new Date(startDate);
      end = new Date();
    } else if (endDate) {
      if (existingInvoices.length > 0) {
        const lastInvoice = existingInvoices[0];
        // If previous invoice is unpaid, include previous month orders
        if (
          lastInvoice.paymentStatus === "Unpaid" ||
          lastInvoice.paymentStatus === "Partially Paid"
        ) {
          start =
            parseUniversalDate(lastInvoice.period.startDate) ||
            new Date(lastInvoice.period.startDate);
        } else {
          start =
            parseUniversalDate(lastInvoice.period.endDate) ||
            new Date(lastInvoice.period.endDate);
        }
      } else {
        start =
          parseUniversalDate(customer.startDate) ||
          new Date(customer.startDate);
      }
      end = parseUniversalDate(endDate) || new Date(endDate);
    } else {
      if (existingInvoices.length > 0) {
        const lastInvoice = existingInvoices[0];
        if (
          lastInvoice.paymentStatus === "Unpaid" ||
          lastInvoice.paymentStatus === "Partially Paid"
        ) {
          start =
            parseUniversalDate(lastInvoice.startDate) ||
            new Date(lastInvoice.startDate);
        } else {
          start =
            parseUniversalDate(lastInvoice.endDate) ||
            new Date(lastInvoice.endDate);
        }
        end = new Date();
      } else {
        start =
          parseUniversalDate(customer.startDate) ||
          new Date(customer.startDate);
        end = new Date();
      }
    }

    const customerStartDate =
      parseUniversalDate(customer.startDate) || new Date(customer.startDate);
    const effectiveStartDate =
      start < customerStartDate ? customerStartDate : start;

    let finalStartDate = effectiveStartDate;
    let finalEndDate = end;
    let isPartialPayment = false;
    let partialPaymentDays = 0;

    if (paymentStatus === "Partially Paid") {
      const timeDiff = end.getTime() - effectiveStartDate.getTime();
      const totalDays = Math.ceil(timeDiff / (1000 * 3600 * 24)) + 1;
      partialPaymentDays = Math.floor(totalDays / 2);

      finalEndDate = new Date(
        effectiveStartDate.getTime() +
          (partialPaymentDays - 1) * (1000 * 3600 * 24)
      );
      isPartialPayment = true;
    }

    const startDateStr = formatDateToDDMMYYYY(finalStartDate);
    const endDateStr = formatDateToDDMMYYYY(finalEndDate);

    const orders = await CustomerOrders.find({
      customer: customerId,
      status: "Delivered",
      deliveryDate: {
        $gte: startDateStr,
        $lte: endDateStr,
      },
    }).populate(
      "products._id",
      "productName productCode price size description"
    );

    const startDateObj =
      parseUniversalDate(startDateStr) || new Date(startDateStr);
    const endDateObj = parseUniversalDate(endDateStr) || new Date(endDateStr);
    const timeDiff = endDateObj.getTime() - startDateObj.getTime();
    const daysDiff = Math.ceil(timeDiff / (1000 * 3600 * 24)) + 1;

    const productMap = new Map();

    orders.forEach((order) => {
      order.products.forEach((product) => {
        const key = `${product._id._id}_${product.productSize}`;

        if (productMap.has(key)) {
          const existing = productMap.get(key);
          existing.quantity += product.quantity;
          existing.totalPrice += product.totalPrice;
        } else {
          productMap.set(key, {
            productId: product._id._id,
            productName: product._id.productName,
            productCode: product._id.productCode,
            productSize: product.productSize,
            quantity: product.quantity,
            price: parseFloat(product.price),
            totalPrice: product.totalPrice,
          });
        }
      });
    });

    const products = Array.from(productMap.values());
    const totalAmount = products.reduce(
      (sum, product) => sum + product.totalPrice,
      0
    );

    // Get previous unpaid invoices for carry-forward
    const previousUnpaidInvoices = await Invoice.find({
      customer: customerId,
      paymentStatus: { $in: ["Unpaid", "Partially Paid"] },
    }).sort({ issueDate: 1 });

    const carryForwardAmount = previousUnpaidInvoices.reduce(
      (total, invoice) => {
        return total + (invoice.totalAmount - (invoice.paidAmount || 0));
      },
      0
    );

    // Calculate partial payment amounts
    let partialPaymentAmount = totalAmount;
    let balanceAmount = 0;

    if (isPartialPayment) {
      const fullPeriodAmount = await calculateFullPeriodAmount(
        customerId,
        effectiveStartDate,
        end
      );
      balanceAmount = fullPeriodAmount - partialPaymentAmount;
    }

    const grandTotal =
      (isPartialPayment ? partialPaymentAmount : totalAmount) +
      carryForwardAmount;

    return res.json({
      success: true,
      message: "Customer data retrieved successfully",
      customer: {
        _id: customer._id,
        name: customer.name,
        phoneNumber: customer.phoneNumber,
        address: customer.address,
        subscriptionPlan: customer.subscriptionPlan,
        paymentMethod: customer.paymentMethod,
        paymentStatus: customer.paymentStatus,
        deliveryBoy: customer.deliveryBoy?.name,
      },
      period: {
        startDate: startDateStr,
        endDate: endDateStr,
      },
      products,
      grandTotal,
      partialPayment: isPartialPayment
        ? {
            partialPaymentAmount,
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

module.exports = {
  createCustomerInvoice,
  getAllCustomerInvoices,
  searchCustomers,
  getCustomerData,
};
