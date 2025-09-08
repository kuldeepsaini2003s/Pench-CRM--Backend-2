const mongoose = require("mongoose");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const { encrypt, decrypt } = require("../utils/decrypt");

const deliveryBoySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Delivery boy name is required"],
      trim: true,
    },
    email: {
      type: String,
      required: [true, "Email is required"],
      unique: true,
      lowercase: true,
      match: [/\S+@\S+\.\S+/, "Please enter a valid email address"],
    },
    phoneNumber: {
      type: Number,
      required: [true, "Phone number is required"],
      unique: true,
      match: [/^[0-9]{10}$/, "Phone number must be 10 digits"],
    },
    area: {
      type: String,
      required: [true, "Delivery area is required"],
    },
    password: {
      type: String,
      required: [true, "Password is required"],
      minlength: [6, "Password must be at least 6 characters"],
    },
    encryptedPassword: {
      type: String,
      select: false,
    },
    profileImage: {
      type: String,
      default:
        "https://static.vecteezy.com/system/resources/previews/020/911/740/non_2x/user-profile-icon-profile-avatar-user-icon-male-icon-face-icon-profile-icon-free-png.png",
    },
    isDeleted: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

// Attach encrypt/decrypt static methods
deliveryBoySchema.statics.encrypt = encrypt;
deliveryBoySchema.statics.decrypt = decrypt;

// Hash + Encrypt password before saving
deliveryBoySchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();

  // ✅ Step 1: store encrypted plain password
  this.encryptedPassword = encrypt(this.password);

  // ✅ Step 2: hash the password for login comparison
  this.password = await bcrypt.hash(this.password, 10);

  next();
});

// Compare password method
deliveryBoySchema.methods.comparePassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

// Get decrypted password (plain text)
deliveryBoySchema.methods.getPlainPassword = function () {
  if (!this.encryptedPassword) {
    throw new Error("Encrypted password not found");
  }
  return decrypt(this.encryptedPassword);
};

// Generate JWT token
deliveryBoySchema.methods.getJWTToken = function () {
  return jwt.sign({ id: this._id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRE,
  });
};

module.exports = mongoose.model("DeliveryBoy", deliveryBoySchema);
