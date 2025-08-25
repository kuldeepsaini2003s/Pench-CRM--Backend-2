const Invoice = require("../models/custumInvoiceModel");
const ErrorHandler = require("../utils/errorhendler");
const generateInvoiceNumber = require("../utils/generateInvoiceNumber");
const catchAsyncErrors = require("../middlewares/catchAsyncErrors");
const { generateInvoicePDF } = require("../service/pdfService");
const { uploadBufferToCloudinary } = require("../service/cloudinaryService");

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

  // ✅ PDF generate
  const pdfBuffer = await generateInvoicePDF(invoice);

  // ✅ Upload Cloudinary
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
});
