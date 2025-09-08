const generateOrderNumber = async () => {
    try {
      const today = new Date();
      const dateString = today.toISOString().slice(0, 10).replace(/-/g, "");
   
      // Get count of orders created today
      const startOfDay = new Date(today);
      startOfDay.setHours(0, 0, 0, 0);
   
      const endOfDay = new Date(today);
      endOfDay.setHours(23, 59, 59, 999);
   
      const todayOrdersCount = await CustomerOrders.countDocuments({
        createdAt: {
          $gte: startOfDay,
          $lte: endOfDay,
        },
      });
   
      const orderNumber = `ORD-${dateString}-${String(
        todayOrdersCount + 1
      ).padStart(4, "0")}`;
      return orderNumber;
    } catch (error) {
      console.error("Error generating order number:", error);
      // Fallback to timestamp-based order number
      return `ORD-${Date.now()}`;
    }
  };

  module.exports = {generateOrderNumber};