const Notification = require("../models/notificationModel");
const DeliveryBoy = require("../models/deliveryBoyModel");
const { formatDateToDDMMYYYY } = require("../utils/parsedDateAndDay");

// Get notifications for a delivery boy
const getAllNotifications = async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;

    const deliveryBoy = await DeliveryBoy.findById(req.deliveryBoy._id);

    if (!deliveryBoy) {
      return res.status(404).json({
        success: false,
        message: "Delivery boy not found",
      });
    }

    const result = await Notification.getNotificationsForDeliveryBoy(
      deliveryBoy._id,
      {
        page: parseInt(page),
        limit: parseInt(limit),
      }
    );

    return res.status(200).json({
      success: true,
      message: "Notifications fetched successfully",
      data: result,
    });
  } catch (error) {
    console.error("Error fetching notifications:", error);
    return res.status(500).json({
      success: false,
      message: "Error fetching notifications",
      error: error.message,
    });
  }
};

// Mark notification as read
const markNotificationAsRead = async (req, res) => {
  try {
    const { notificationId } = req.params;

    const notification = await Notification.findById(notificationId);

    if (!notification) {
      return res.status(404).json({
        success: false,
        message: "Notification not found",
      });
    }
    
    if (notification?.isRead) {
      return res.status(200).json({
        success: true,
        message: "Notifications already marked as read",
      });
    }

    await notification.markAsRead();

    return res.status(200).json({
      success: true,
      message: "Notification marked as read",
      data: notification,
    });
  } catch (error) {
    console.error("Error marking notification as read:", error);
    return res.status(500).json({
      success: false,
      message: "Error marking notification as read",
      error: error.message,
    });
  }
};

// Get unread notification count
const getUnreadCount = async (req, res) => {
  try {
    const deliveryBoy = await DeliveryBoy.findById(req?.deliveryBoy?._id);

    if (!deliveryBoy) {
      return res.status(404).json({
        success: false,
        message: "Delivery boy not found",
      });
    }

    const unreadCount = await Notification.getUnreadCount(deliveryBoy?._id);

    return res.status(200).json({
      success: true,
      message: "Unread count fetched successfully",
      unreadCount,
    });
  } catch (error) {
    console.error("Error fetching unread count:", error);
    return res.status(500).json({
      success: false,
      message: "Error fetching unread count",
      error: error.message,
    });
  }
};

// Delete notification
const deleteNotification = async (req, res) => {
  try {
    const { notificationId } = req.params;

    const notification = await Notification.findByIdAndDelete(notificationId);

    if (!notification) {
      return res.status(404).json({
        success: false,
        message: "Notification not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Notification deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting notification:", error);
    return res.status(500).json({
      success: false,
      message: "Error deleting notification",
      error: error.message,
    });
  }
};

module.exports = {
  getAllNotifications,
  markNotificationAsRead,
  getUnreadCount,
  deleteNotification,
};
