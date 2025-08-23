const Invoice = require("../models/custumInvoiceModel");
const ErrorHandler = require("../utils/errorhendler");
const generateInvoiceNumber = require("../utils/generateInvoiceNumber");
const catchAsyncErrors = require("../middlewares/catchAsyncErrors");

// Create Invoice
exports.createInvoice = catchAsyncErrors(async (req, res, next) => {
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

    // Validation
    if (
        !customerName ||
        !phoneNumber ||
        !productType ||
        !productSize ||
        !productQuantity ||
        !price ||
        !paymentMode
    ) {
        return next(new ErrorHandler("All required fields must be filled", 400));
    }

    // Generate unique invoice number
    const invoiceNumber = generateInvoiceNumber();

    // Create invoice
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
    });

    res.status(201).json({
        success: true,
        message: "Invoice created successfully",
        data: invoice,
    });
});
