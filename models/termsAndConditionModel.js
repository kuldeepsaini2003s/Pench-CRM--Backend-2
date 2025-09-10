const mongoose = require("mongoose");
const deliveryBoyTermsAndConditionSchema = new mongoose.Schema(
    {
      description: { type: String, required: true },
    },
    { timestamps: true }
 );

module.exports = mongoose.model("deliveryBoyTermsAndCondition", deliveryBoyTermsAndConditionSchema);