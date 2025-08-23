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
    invoiceDate: {
      type: Date,
      required: true,
    },
    productType: {
      type: String,
      required: true,
    },
    productSize: {
      type: String,
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
    },
    paymentMode: {
      type: String,
      required: true,
      enum: ["Cash", "Card", "UPI", "Bank Transfer"],
    },
    paymentStatus: {
      type: String,
      required: true,
      enum: ["Pending", "Paid", "Failed"],
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Invoice", invoiceSchema);
