const mongoose = require("mongoose");

const customerSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Customer name is required"],
    },
    phoneNumber: {
      type: Number,
      required: [true, "Phone number is required"],
      validate: {
        validator: function (v) {
          return /^\d{10}$/.test(v); // Ensure exactly 10 digits
        },
        message: "Phone number must be exactly 10 digits",
      },
      unique: true,
    },
    image: {
      type: String,
     default:
     "https://static.vecteezy.com/system/resources/previews/020/911/740/non_2x/user-profile-icon-profile-avatar-user-icon-male-icon-face-icon-profile-icon-free-png.png",
    },
    gender: {
      type: String,
      enum: ["Male", "Female", "Other"],
    },
    address: {
      type: String,
      required: [true, "Address is required"],
    },

    // ✅ Subscription products
    products: [
      {
        product: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Product",
          required: true,
        },
        price: {
          type: String,
          required: true
        },
        productSize: {
          type: String,
          required: true
        },

        quantity: {
          type: Number,
          required: true,
          min: [1, "Quantity must be at least 1"],
        },

        subscriptionPlan: {
          type: String,
          enum: ["Monthly", "One Day", "Alternate Days"],
          // required: true,
        },

        deliveryDays: {
          type: String,
          enum: [
            "Daily",
            "Alternate Days",
            "Monday to Friday",
            "Weekends",
            "Custom Date",
          ],
          default: "Daily",
        },
        customDeliveryDates: {
          type: [Date],
          default: [],
        },
        startDate: {
          type: Date,
          default: Date.now,
        },

        endDate: {
          type: Date,
          default: Date.now,
        },
        totalPrice: {
          type: Number,
          required: true,
        },
      },
    ],

    absentDays: {
      type: [Date],
      default: [],
    },

    deliveryBoy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "DeliveryBoy",
    },

    amountPaidTillDate: {
      type: Number,
      default: 0,
    },
    amountDue: {
      type: Number,
      default: 0,
    },
    customerStatus:{
      type:String,
      enum:["Active","Inactive"],
      default:"Active"
    },
    // paymentMethod:{
    //   type:String,
    //   enum:["Cash","UPI"],
    //   default:"Cash"
    // },
    // paymentStatus:{
    //   type:String,
    //   enum:["Paid","Partially Paid","Unpaid"],
    //   default:"Pending"
    // },
  },
  { timestamps: true }
);

// ✅ Virtual populate for delivery history
// customerSchema.virtual("deliveryHistory", {
//   ref: "DeliveryHistory",
//   localField: "_id",
//   foreignField: "customer",
// });

// customerSchema.set("toJSON", { virtuals: true });
// customerSchema.set("toObject", { virtuals: true });

module.exports = mongoose.model("Customer", customerSchema);
