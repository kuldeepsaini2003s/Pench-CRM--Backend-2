const mongoose = require("mongoose");

const invoiceSchema = new mongoose.Schema(
  {
    customerName: {
      type: String,
      required: true,
    },
    phoneNumber: {
      type: String,
      required: true,
    },
    invoiceNumber: {
      type: String,
      unique: true,
      required: true,
    },
    invoiceDate: {
      type: Date,
      default: Date.now,
    },
    productType: {
      type: String,
      required: [true, "Product name is required"],
    },
    productSize: {
      type: String,
      required: true,
      enum: ["250gm", "500gm", "1kg", "1/2ltr", "1ltr", "1/4ltr"], // allowed sizes
    },
    productQuantity: {
      type: Number,
      required: true,
    },
    price: {
      type: Number,
      required: true,
    },
    subscriptionPlan: {
      type: String,
      enum: ["Monthly", "Weekly", "Daily"],
      required: true,
    },
    paymentMode: {
      type: String,
      required: true,
      enum: ["Cash", "Online", "UPI"],
    },
    paymentStatus: {
      type: String,
      required: true,
      enum: ["Paid", "Unpaid"],
    },
    pdfUrl: {
      type: String,
      required: false,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("customInvoiceModel", invoiceSchema);
