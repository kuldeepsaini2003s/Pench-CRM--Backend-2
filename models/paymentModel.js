
const mongoose = require("mongoose");
const paymentSchema = new mongoose.Schema(
  {

    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Customer",
    },
    totalAmount: {
      type: Number,
    },
    paidAmount: {
      type: Number,
      default:0
    },
    balanceAmount:{
        type:Number,
        default:0
    },
    paidDate: {
      type: Date,
    },
    paymentMethod: {
      type: String,
      enum: ["COD", "Online"],
      default: "COD",
    },
    paymentStatus: {
      type: String,
      enum: ["Paid", "Unpaid", "Partially Paid"],
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Payment", paymentSchema);
