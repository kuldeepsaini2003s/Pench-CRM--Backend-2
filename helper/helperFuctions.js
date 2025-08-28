const { isToday } = require("../utils/dateUtils");

const checkSubscriptionStatus = (p) => {
  const today = new Date();
  if (p.endDate && p.endDate < today) return "Inactive";
  if (p.startDate && p.startDate > today) return "Inactive";
  if (p.subscriptionPlan === "Daily") return "Active";
  if (p.subscriptionPlan === "Monthly") {
    return "Active";
  }

  if (p.subscriptionPlan === "Alternate Days") {
    const diff = Math.floor(
      (today - new Date(p.startDate)) / (1000 * 60 * 60 * 24)
    );
    return diff % 2 === 0 ? "Active" : "Inactive";
  }
  if (p.deliveryDays === "Custom") {
    if (Array.isArray(p.customDeliveryDates)) {
      const found = p.customDeliveryDates.some((d) => isToday(new Date(d)));
      return found ? "Active" : "Inactive";
    }
  }

  return "Inactive";
};

module.exports = {
  checkSubscriptionStatus,
};
