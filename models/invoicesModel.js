const mongoose = require("mongoose");

const invoiceSchema = new mongoose.Schema(
  {
    pdf: {
      type: String,
    },
    invoiceNumber: {
      type: String,
    },
    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Customer",
    },
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
    },
    customerOrder: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "CustomerOrder",
    },

    totalAmount: {
      type: Number,
    },
    subTotal: {
      type: Number,
    },

    // paidAmount: {
    //   type: Number,
    // },

    // paidDate: {
    //   type: Date,
    // },
    // note: {
    //   type: String,
    // },
    paymentMethod: {
      type: String,
      enum: ["Cash", "Card", "Online", "Other"],
      default: "Cash",
    },
    issueDate: {
      type: Date,
    },
    status: {
      type: String,
      enum: ["Paid", "Unpaid", "Partially Paid"],
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Invoice", invoiceSchema);
