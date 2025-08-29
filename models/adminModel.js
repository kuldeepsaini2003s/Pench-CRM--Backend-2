const mongoose = require("mongoose");
const validator = require("validator");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const adminSchema = new mongoose.Schema(
  {
    name: { type: String, trim: true },

    email: {
      type: String,
      required: [true, "Please enter your email"],
      unique: true,
      validate: [validator.isEmail, "Please enter a valid email address"],
      lowercase: true,
      index: true,
    },

    phoneNumber: {
      type: Number,
      match: [
        /^\+?[1-9]\d{1,14}$/,
        "Please provide a valid phone number with a country code (e.g., +1234567890)",
      ],
      maxlength: [15, "Phone number cannot be longer than 15 characters"],
    },

    gstNumber: {
      type: String,
      required: true,
      match: /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/,
    },

    password: {
      type: String,
      required: [true, "Please enter your password"],
      minLength: [8, "Password should be greater than 8 characters"],
      select: true,
    },

    address: { type: String },

    role: {
      type: String,
      enum: ["SUPER_ADMIN", "USER"],
      default: "SUPER_ADMIN",
    },

    status: {
      type: String,
      enum: ["active", "inactive", "suspended"],
      default: "active",
    },

    profileImage: {
      type: String,
     default:
        "https://static.vecteezy.com/system/resources/previews/020/911/740/non_2x/user-profile-icon-profile-avatar-user-icon-male-icon-face-icon-profile-icon-free-png.png",
    },

    otp: { type: String },
    otpExpire: { type: Date },

    isVerified: { type: Boolean, default: false },
  },
  { timestamps: true }
);


adminSchema.methods.generateToken = function () {
  return jwt.sign({ id: this._id }, process.env.ACCESS_TOKEN_SECRET, {
    expiresIn: "1h",
  });
};

adminSchema.methods.comparePassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

adminSchema.methods.hashPassowrd = async function(){
  return await bcrypt.hash(this.password, 10);
}
module.exports = mongoose.model("Admin", adminSchema);
