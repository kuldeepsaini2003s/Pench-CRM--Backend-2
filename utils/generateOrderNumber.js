const CustomerOrders = require("../models/customerOrderModel");

const generateOrderNumber = async () => {
  try {
    const highestOrder = await CustomerOrders.findOne(
      {},
      { orderNumber: 1 }
    ).sort({ orderNumber: -1 });

    let nextOrderNumber = 1; // Default to 1 if no orders exist

    if (highestOrder && highestOrder.orderNumber) {
      const numericPart = parseInt(highestOrder.orderNumber.replace(/\D/g, ""));
      if (!isNaN(numericPart) && numericPart > 0) {
        nextOrderNumber = numericPart + 1;
      } else {
        nextOrderNumber = 1;
      }
    }

    const orderNumber = `ORD-${String(nextOrderNumber).padStart(4, "0")}`;
    
    return orderNumber;
  } catch (error) {
    console.error("Error generating order number:", error);
    return `ORD-${Date.now()}`;
  }
};

module.exports = { generateOrderNumber };
