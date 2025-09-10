const mongoose = require("mongoose");

const supportMobileNumberSchema = new mongoose.Schema(
  {
    contactNumber: {
      type: Number,
      required: [true, "Contact number is required"],
      validate: {
        validator: function (v) {
          // Convert to string for length check
          return v && v.toString().length === 10;
        },
        message: "Contact number should be at least 10 digits long",
      },
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("SupportMobileNumber", supportMobileNumberSchema);
