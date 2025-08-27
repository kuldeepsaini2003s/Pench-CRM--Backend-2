const mongoose = require("mongoose");

// Subdocument for each product inside an order
const productOrderSchema = new mongoose.Schema(
  {
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
    },
    quantity: { type: Number, required: true },
    price: { type: Number, required: true },
    totalPrice: { type: Number, required: true },
  },
  { _id: false }
);

const customerCustomSchema = new mongoose.Schema(
  {
    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Customer",
      required: true,
    },
    date: {
      type: Date,
      default: Date.now,
    },
    products: [productOrderSchema], // 👈 array of products with reference + extra fields
    deliveryBoy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "DeliveryBoy",
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("CustomerCustomOrder", customerCustomSchema);
