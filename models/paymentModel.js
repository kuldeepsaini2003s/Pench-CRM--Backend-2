
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
    paidDates: [
      {
        type: Date,
      }
    ],
    paymentMethod: {
      type: String,
      enum: ["COD", "Online"],
      default: "COD",
    },
    paymentStatus: {
      type: String,
      enum: ["Paid", "Unpaid", "Partially Paid"],
    },
    month:{
        type:String,
        default: new Date().toLocaleString("default", { month: "long" }),
    },
    year:{
        type:String,
        default: new Date().getFullYear(),
    },
    razorpayLinkId:{
        type:String,
    },
    razorpayLinkStatus:{
        type:String,
    },
    razorpayPaymentId:{
        type:String,
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model("Payment", paymentSchema);
