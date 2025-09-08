const mongoose = require("mongoose");

// Subdocument for each product inside an order - matches customer.products structure
const productOrderSchema = new mongoose.Schema(
  {
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
    },
    price: {
      type: String,
      required: true,
    },
    productSize: {
      type: String,
      required: true,
    },
    quantity: {
      type: Number,
      required: true,
      min: [1, "Quantity must be at least 1"],
    },
    totalPrice: {
      type: Number,
      required: true,
    },
  },
  { _id: false }
);

const customerOrdersSchema = new mongoose.Schema(
  {
    orderNumber: {
      type: String,
      unique: true,
      required: true,
    },
    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Customer",
      required: true,
    },
    deliveryBoy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "DeliveryBoy",
      required: true,
    },
    deliveryDate: {
      type: String, // Store as dd/mm/yyyy format
      default: () => {
        const today = new Date();
        const day = String(today.getDate()).padStart(2, "0");
        const month = String(today.getMonth() + 1).padStart(2, "0");
        const year = today.getFullYear();
        return `${day}/${month}/${year}`;
      },
    },
    paymentMethod: {
      type: String,
      enum: ["Cash", "Card", "Online"],
      default: "Cash",
    },
    paymentStatus: {
      type: String,
      enum: ["Pending", "Unpaid", "Partially Paid", "Paid"],
      default: "Pending",
    },

    products: [productOrderSchema], // 👈 array of products with reference + extra fields    

    // Financial
    totalAmount: {
      type: Number,
      default: 0,
    },

    cancellationReason: {
      type: String,
    },

    // Status
    status: {
      type: String,
      enum: [
        "Scheduled",
        "Out for Delivery",
        "Delivered",
        "Failed",
        "Cancelled",
      ],
      default: "Scheduled",
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("CustomerOrders", customerOrdersSchema);