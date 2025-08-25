const Customer = require("../models/coustomerModel");
const ErrorHandler = require("../utils/errorhendler");
const catchAsyncErrors = require("../middlewares/catchAsyncErrors");

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

  // 🔹 Query object banate hain
  let query = {};

  if (name) {
    query.name = { $regex: name, $options: "i" }; // case-insensitive search
  }

  if (phoneNumber) {
    query.phoneNumber = { $regex: phoneNumber, $options: "i" };
  }

  // Status filter (Unpaid, Paid, Partially Paid) - Derived logic
  if (status) {
    query["products.status"] = status;
  }

  // Date range filter
  if (startDate && endDate) {
    query.createdAt = { $gte: new Date(startDate), $lte: new Date(endDate) };
  }

  // 🔹 Pagination
  page = parseInt(page);
  limit = parseInt(limit);
  const skip = (page - 1) * limit;

  // 🔹 Fetch customers
  const customers = await Customer.find(query)
    .select("name phoneNumber products createdAt")
    .sort(sort)
    .skip(skip)
    .limit(limit);

  if (!customers || customers.length === 0) {
    return next(new ErrorHandler("No customers found", 404));
  }

  // 🔹 Format customers
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

  // 🔹 Total Count for Pagination
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
