const express = require("express");
const router = express.Router();
const { getAllProductsDelivery, getProductDeliveryById, deleteOrder } = require("../controllers/deliveryManagementController");

router.get("/getAllProductsDelivery", getAllProductsDelivery);
router.get("/getProductDeliveryById/:orderId", getProductDeliveryById);
router.delete("/deleteOrder/:orderId", deleteOrder);

module.exports = router;