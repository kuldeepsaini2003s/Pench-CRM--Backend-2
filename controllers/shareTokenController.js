const crypto = require("crypto")
const ShareToken = require("../models/shareTokenModel");
const DeliveryBoy = require("../models/deliveryBoyModel");
const mongoose = require("mongoose");


//
const FRONTEND_BASE = process.env.FRONTEND_BASE_URL || "https://pench-delivery-boy-app.netlify.app";
const tokenExpiry = parseInt(process.env.TOKEN_TTL_MIN) || 15; // token expiry in minutes

//✅ Generate Delivery Boy Share Link
const generateDeliveryBoyShareLink = async (req, res) => {
    try {
        const { id } = req.params;
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid delivery boy ID",
            });
        }
        const deliveryBoy = await DeliveryBoy.findById(id);
        if (!deliveryBoy) {
            return res.status(404).json({
                success: false,
                message: "Delivery boy not found",
            });
        }

        //✅ Create Token
        const token = crypto.randomBytes(16).toString("hex");
        const expiresAt = new Date(Date.now() + tokenExpiry * 60 * 1000);
await ShareToken.create({
            token,
            deliveryBoy: deliveryBoy._id,
            expiresAt,
        });

        const shareableLink = `${FRONTEND_BASE}/?t=${token}`;

        //✅ WhatsApp Link
        const message = `Hi! Use this link to sign in the delivery app (valid ${tokenExpiry} minutes): ${shareableLink}`;
        const whatsappLink = `https://web.whatsapp.com/send?text=${encodeURIComponent(message)}`;

        return res.status(200).json({
            success: true,
            message: "Delivery boy share link generated successfully",
            shareableLink,
            whatsappLink,
        })

    } catch (error) {
        console.log("Error in generateDeliveryBoyShareLink:", error);
        return res.status(500).json({
            success: false,
            message: "Error in generating delivery boy share link",
            error: error.message,
        });
    }
}

//✅ Share Token
const shareConsumeToken = async (req, res) => {
    try {
        const { token } = req.query
        if (!token) {
            return res.status(400).json({
                success: false,
                message: "Token is required",
            });
        }
        const shareToken = await ShareToken.findOne({ token }).populate({
            path: "deliveryBoy",
            select: "+encryptedPassword", // ✅ include encryptedPassword
        });

        console.log("shareToken:", shareToken);

        if (!shareToken) {
            return res.status(404).json({
                success: false,
                message: "Share token not found",
            });
        }

        if (shareToken.used) {
            return res.status(410).josn({
                succes: false,
                message: "Token Already Used"
            })
        }
        if (new Date() > new Date(shareToken.expiresAt)) {
            return res.status(410).json({ success: false, message: "Token expired" });
        }

        const deliveryBoy = shareToken.deliveryBoy;
        if (!deliveryBoy) {
            return res.status(404).json({ success: false, message: "Delivery boy not found" });
        }

        let plainPassword = null;
        try {
          plainPassword = deliveryBoy.getPlainPassword(); // ✅ now works
        } catch (err) {
          console.error("Decrypt error:", err);
        }
      
        shareToken.used = true;
        await shareToken.save();

        return res.status(200).json({
            success: true,
            message:"Delivery boy share link generated successfully",
            shareToken: {
                email: deliveryBoy.email,
                password: plainPassword,
                name: deliveryBoy.name,
            },
        });


    } catch (error) {
        console.log("Error in shareToken:", error);
        return res.status(500).json({
            success: false,
            message: "Internal server error",
            error: error.message,
        });
    }
}

module.exports = {
    generateDeliveryBoyShareLink,
    shareConsumeToken,
}