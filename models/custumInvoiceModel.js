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
      type: [String],
      required: true,
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
