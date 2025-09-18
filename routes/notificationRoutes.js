const express = require("express");
const router = express.Router();
const {
  markNotificationAsRead,
  getAllNotifications,
  getUnreadCount,
  deleteNotification,
} = require("../controllers/notificationController");
const {
  verifyDeliveryBoyToken,
} = require("../middlewares/deliveryBoy.middleware");

router.get("/getAllNotifications", verifyDeliveryBoyToken, getAllNotifications);
router.get("/getUnreadCount", verifyDeliveryBoyToken, getUnreadCount);
router.put(
  "/markAsRead/:notificationId",
  verifyDeliveryBoyToken,
  markNotificationAsRead
);
router.delete(
  "/deleteNotification/:notificationId",
  verifyDeliveryBoyToken,
  deleteNotification
);

module.exports = router;
