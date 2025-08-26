const Customer = require("../models/coustomerModel");
const ErrorHandler = require("../utils/errorhendler");
const catchAsyncErrors = require("../middlewares/catchAsyncErrors");
const Invoice = require("../models/invoicesModel");
const generateInvoiceNumber = require("../utils/generateInvoiceNumber");

exports.allCustomerInvoices = catchAsyncErrors(async (req, res, next) => {
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
});

// Helper to format date as dd/mm/yyyy
function formatDate(date) {
  const d = new Date(date);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

exports.generateInvoiceForCustomer = async (req, res, next) => {
  try {
    const { customerId } = req.body;

    if (!customerId) {
      return next(new ErrorHandler("Customer ID is required", 400));
    }

    // Fetch customer with subscription products
    const customer = await Customer.findById(customerId).populate(
      "products.product"
    );
    if (!customer) {
      return next(new ErrorHandler("Customer not found", 404));
    }

    if (!customer.products || customer.products.length === 0) {
      return next(new ErrorHandler("Customer has no products", 404));
    }

    // Hardcoded default values
    const DairyAddress = `17, S Ambazari Rd, Madhav Nagar,<br />Nagpur 440010,<br />Maharashtra`;
    const defaultGST = "3215658686786767";

    // Aggregate product data
    const productMap = {};
    customer.products.forEach((item) => {
      const p = item.product;
      const key = p.productCode;

      if (!productMap[key]) {
        productMap[key] = {
          productName: p.productName,
          productCode: p.productCode,
          description: p.description,
          size: p.size,
          quantity: item.quantity || 0,
          price: p.price,
          total: (item.quantity || 0) * p.price,
        };
      } else {
        productMap[key].quantity += item.quantity || 0;
        productMap[key].total += (item.quantity || 0) * p.price;
      }
    });

    const productsArray = Object.values(productMap);

    // Calculate subtotal & totalAmount
    const subtotal = productsArray.reduce((acc, p) => acc + p.total, 0);
    const totalAmount = subtotal;

    // Generate invoice number
    const invoiceNumber = generateInvoiceNumber();

    // Create invoice in DB
    const invoice = await Invoice.create({
      invoiceNumber,
      customer: customer._id,
      totalAmount,
      subTotal: subtotal,
      issueDate: new Date(),
      status: "Unpaid",
    });
    await invoice.save();
    // Prepare payload for frontend
    const payload = {
      invoiceNumber,
      customerName: customer.name,
      customerAddress: customer.address,
      DairyAddress,
      GST: defaultGST,
      issueDate: formatDate(new Date()),
      products: productsArray,
      subtotal,
      totalAmount,
      status: "Unpaid",
    };

    res.status(200).json({
      success: true,
      invoice: payload,
    });
  } catch (err) {
    next(
      err instanceof Error
        ? err
        : new ErrorHandler(err.message || "Something went wrong", 500)
    );
  }
};
