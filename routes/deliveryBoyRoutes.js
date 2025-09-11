const express = require("express");
const {
  registerDeliveryBoy,
  loginDeliveryBoy,
  getAllDeliveryBoys,
  updateDeliveryBoy,
  deleteDeliveryBoy,
  getDeliveryBoyProfile,
  getDeliveryBoyById,
  getOrdersByDeliveryBoy,
} = require("../controllers/deliveryBoyController");

const {upload} = require("../config/cloudinary");
const {
  verifyDeliveryBoyToken,
} = require("../middlewares/deliveryBoy.middleware");

const router = express.Router();

// Auth routes
router.post("/register", upload.single("profileImage"), registerDeliveryBoy);
router.post("/login", loginDeliveryBoy);
router.get("/getAllDeliveryBoy", getAllDeliveryBoys);
router.get(
  "/deliveryBoyProfile",
  verifyDeliveryBoyToken,
  getDeliveryBoyProfile
);
router.get("/getDeliveryBoyById/:id", getDeliveryBoyById);
router.put("/updateDeliveryBoyProfile/:id", upload.single("profileImage"), updateDeliveryBoy);
router.put("/delete/:id", deleteDeliveryBoy);


router.get("/getOrdersByDeliveryBoy",  verifyDeliveryBoyToken,  getOrdersByDeliveryBoy);


module.exports = router;
