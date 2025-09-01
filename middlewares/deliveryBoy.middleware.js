const jwt = require("jsonwebtoken");
const DeliveryBoyModel = require("../models/delhiveryBoyModel");

const verifyDeliveryBoyToken = async (req, res, next) => {
  try {
    const token = req.headers.authorization.split(" ")[1] || req.cookies.token;
    if (!token) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }
    const decoded = await jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);    

    if (!decoded) {
      return res.status(401).json({
        success: false,
        message: "Invalid Token",
      });
    }
    const deliveryBoy = await DeliveryBoyModel.findById(decoded.id);    

    if (!deliveryBoy) {
      return res.status(401).json({
        success: false,
        message: "DeliveryBoy not found",
      });
    }
    req.deliveryBoy = deliveryBoy;
    next();
  } catch (error) {
    console.log("Authentication Error", error);
    if (error.name === "TokenExpiredError") {
      return res.status(401).json({
        success: false,
        message: "Token Expired",
      });
    }
    if (error.name === "JsonWebTokenError") {
      return res.status(401).json({
        success: false,
        message: "Invalid Token",
      });
    }
    return res.status(500).json({
      success: false,
      message: "Failed to authenticate",
    });
  }
};

module.exports = { verifyDeliveryBoyToken };
