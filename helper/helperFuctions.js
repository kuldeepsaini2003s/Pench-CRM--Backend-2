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

// Helper function to calculate full period amount
const calculateFullPeriodAmount = async (customerId, startDate, endDate) => {
  const orders = await CustomerOrders.find({
    customer: customerId,
    status: "Delivered",
    deliveryDate: {
      $gte: formatDateToDDMMYYYY(startDate),
      $lte: formatDateToDDMMYYYY(endDate),
    },
  }).populate("products._id", "productName productCode price size description");

  const productMap = new Map();
  orders.forEach((order) => {
    order.products.forEach((product) => {
      const key = `${product._id._id}_${product.productSize}`;
      if (productMap.has(key)) {
        const existing = productMap.get(key);
        existing.totalPrice += product.totalPrice;
      } else {
        productMap.set(key, {
          totalPrice: product.totalPrice,
        });
      }
    });
  });

  return Array.from(productMap.values()).reduce(
    (sum, product) => sum + product.totalPrice,
    0
  );
};

module.exports = {
  checkSubscriptionStatus,
  calculateFullPeriodAmount,
};
