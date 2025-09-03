const Invoice = require("../models/invoicesModel");
const ErrorHandler = require("../utils/errorhendler");
const generateInvoiceNumber = require("../utils/generateInvoiceNumber");
const { generateInvoicePDF } = require("../service/pdfService");
const { uploadBufferToCloudinary } = require("../service/cloudinaryService");
const Customer = require("../models/coustomerModel");

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
        success:false,
        message:"All required fields must be filled"
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
    console.log(error)
    return res.status(500).json({
      success:false,
      message:"Failed To Create Invoice"
    })
  }
}

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
}

//✅ DropDown Api for Payment Method
const getPaymentMethods = async (req, res) => {
  try {
    const paymentMethods = await Invoice.schema.path("paymentMethod").enumValues;
    res.status(200).json({
      success: true,
      paymentMethods,
    });
  } catch (error) {
    console.log(error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch payment methods",
    });
  }
}

//✅ DropDown Api for Payment Status
const getPaymentStatus = async (req, res) => {
  try {
    const paymentStatus = await Invoice.schema.path("paymentStatus").enumValues;
    res.status(200).json({
      success: true,
      paymentStatus,
    });
  } catch (error) {
    console.log(error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch payment status",
    });
  }
}

module.exports = {
  createCustomerInvoice,
  getAllCustomerInvoices,
  getPaymentMethods,
  getPaymentStatus,
  
}