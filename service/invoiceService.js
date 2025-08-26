const { generateInvoicePDF } = require("./pdfService");
const { uploadBufferToCloudinary } = require("./cloudinaryService");
const Invoice = require("../models/invoicesModel");
const generateInvoiceNumber = require("../utils/generateInvoiceNumber");

async function processCustomerInvoice(customer) {
  // 🔹 Step 1: Create Invoice Data
  const invoiceNumber = generateInvoiceNumber();
  const subtotal = customer.products.reduce(
    (acc, item) => acc + item.quantity * item.product.price,
    0
  );

  const invoiceData = {
    invoiceNumber,
    customer: customer._id,
    subTotal: subtotal,
    totalAmount: subtotal, // GST or discount add karna ho to yaha kare
    issueDate: new Date(),
    status: "Unpaid",
  };

  // 🔹 Step 2: Save invoice in DB (temp without PDF)
  const invoice = await Invoice.create(invoiceData);

  // 🔹 Step 3: Generate PDF Buffer
  const pdfBuffer = await generateInvoicePDF({
    ...invoiceData,
    customerName: customer.name,
    customerAddress: customer.address,
    products: customer.products.map((p) => ({
      productName: p.product.productName,
      quantity: p.quantity,
      price: p.product.price,
      total: p.quantity * p.product.price,
    })),
  });

  // 🔹 Step 4: Upload PDF to Cloudinary
  const cloudResult = await uploadBufferToCloudinary(
    pdfBuffer,
    `invoice-${invoiceNumber}`
  );

  // 🔹 Step 5: Save Cloudinary URL in DB
  invoice.pdf = cloudResult.secure_url;
  await invoice.save();

  return invoice;
}

module.exports = { processCustomerInvoice };
