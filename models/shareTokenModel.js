const mongoose = require("mongoose");

const shareTokenSchema = new mongoose.Schema({
  token: { type: String, required: true, unique: true },
  deliveryBoy: { type: mongoose.Schema.Types.ObjectId, ref: "DeliveryBoy", required: true },
  used: { type: Boolean, default: false },
  expiresAt: { type: Date, required: true },
  createdAt: { type: Date, default: Date.now },
});

shareTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 }); // optional TTL index if you prefer DB-level expiry

module.exports = mongoose.model("ShareToken", shareTokenSchema);
