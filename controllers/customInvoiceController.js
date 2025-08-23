const path = require("path");
const ejs = require("ejs");
const puppeteer = require("puppeteer");
const Invoice = require("../models/custumInvoiceModel");
const ErrorHandler = require("../utils/errorhendler");
const generateInvoiceNumber = require("../utils/generateInvoiceNumber");
const catchAsyncErrors = require("../middlewares/catchAsyncErrors");

function formatDate(date) {
  const d = new Date(date);
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
}

// Create Invoice & Generate PDF
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

  const templatePath = path.join(
    __dirname,
    "../public/templates/customInvoiceTemplate.ejs"
  );

  const formattedDate = formatDate(invoice.invoiceDate);

  const html = await ejs.renderFile(templatePath, { invoice, formattedDate });

  const browser = await puppeteer.launch();
  const page = await browser.newPage();

  await page.setContent(html, { waitUntil: "networkidle0" });

  const pdfBuffer = await page.pdf({
    format: "A4",
    printBackground: true,
  });

  await browser.close();

  res.set({
    "Content-Type": "application/pdf",
    "Content-Disposition": `attachment; filename=invoice-${invoiceNumber}.pdf`,
    "Content-Length": pdfBuffer.length,
  });

  res.send(pdfBuffer);
});
