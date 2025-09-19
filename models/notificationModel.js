const mongoose = require("mongoose");
const { formatDateToDDMMYYYY } = require("../utils/parsedDateAndDay");

const notificationSchema = new mongoose.Schema(
  {
    deliveryBoy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "DeliveryBoy",
      required: true,
    },
    type: {
      type: String,
      enum: [
        "customer_absent",
        "delivery_assigned",
        "delivery_completed",
        "delivery_failed",
        "payment_reminder",
        "subscription_update",
        "general",
      ],
      required: true,
    },
    title: {
      type: String,
      required: true,
      maxlength: 100,
    },
    message: {
      type: String,
      required: true,
      maxlength: 500,
    },
    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Customer",
    },
    isRead: {
      type: Boolean,
      default: false,
    },
    readAt: {
      type: String,
      default: "",
    },
    deliveryDate: {
      type: String,
      default: "",
    },
  },
  {
    timestamps: true,
  }
);

// 🔎 Indexes for faster queries
notificationSchema.index({ deliveryBoy: 1, isRead: 1, createdAt: -1 });
notificationSchema.index({ type: 1, createdAt: -1 });
notificationSchema.index({ customer: 1, createdAt: -1 });

// ✅ Instance method: mark notification as read
notificationSchema.methods.markAsRead = function () {
  this.isRead = true;
  this.readAt = formatDateToDDMMYYYY(new Date());
  return this.save();
};

// ✅ Static method: create absent notification
notificationSchema.statics.createCustomerAbsentNotification = async function (
  deliveryBoyId,
  customerId,
  absentDates,
  customerName
) {
  const notification = new this({
    deliveryBoy: deliveryBoyId,
    type: "customer_absent",
    title: "Customer Absent",
    message: `${customerName} is absent today`,
    customer: customerId,
    deliveryDate: absentDates[0],
  });

  return await notification.save();
};

// ✅ Static method: get unread count
notificationSchema.statics.getUnreadCount = async function (deliveryBoyId) {
  return await this.countDocuments({
    deliveryBoy: deliveryBoyId,
    isRead: false,
  });
};

// ✅ Static method: get all notifications (no pagination)
notificationSchema.statics.getNotificationsForDeliveryBoy = async function (
  deliveryBoyId
) {
  const query = { deliveryBoy: deliveryBoyId };
  const notifications = await this.find(query)
    .populate("customer", "name phoneNumber")
    .sort({ createdAt: -1 });

    const total = await this.countDocuments(query);
  return { total, notifications }; 
};

module.exports = mongoose.model("Notification", notificationSchema);
