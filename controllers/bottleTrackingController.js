const Customer = require("../models/customerModel");
const CustomerOrders = require("../models/customerOrderModel");
const {
  formatDateToDDMMYYYY,
  parseUniversalDate,
} = require("../utils/parsedDateAndDay");

// Get bottle count for a specific date
// Helper function to map product size to bottle size
// const mapProductSizeToBottleSize = (productSize) => {
//   if (!productSize) return "1ltr";

//   const sizeStr = productSize.toString().toLowerCase();

//   if (sizeStr.includes("1/2")) {
//     return "1/2ltr";
//   }

//   if (sizeStr.includes("1l") || sizeStr.includes("1 l")) {
//     return "1ltr";
//   }

//   return "1ltr";
// };

const convertSizeToBottles = (productSize, quantity = 1) => {
  if (!productSize) return { "1ltr": 0, "1/2ltr": 0 };

  const sizeStr = productSize.toString().toLowerCase().replace(/\s/g, "");
  let sizeInLiters = 0;

  // Agar "1/2ltr" likha hai
  if (sizeStr.includes("1/2")) {
    sizeInLiters = 0.5;
  } else {
    sizeInLiters = parseFloat(sizeStr); // "2.5ltr" => 2.5
    if (isNaN(sizeInLiters)) sizeInLiters = 1; // fallback
  }

  const fullLiters = Math.floor(sizeInLiters); // pure liters
  const hasHalf = sizeInLiters % 1 !== 0; // 0.5 part hai kya?

  return {
    "1ltr": fullLiters * quantity,
    "1/2ltr": (hasHalf ? 1 : 0) * quantity,
  };
};

// ✅ Get bottle count for a specific date
// const getBottleCountForDate = async (req, res) => {
//   try {
//     const { date } = req.query;

//     let targetDate = new Date();

//     if (date) {
//       try {
//         targetDate = parseUniversalDate(date);
//         if (!targetDate) {
//           targetDate = new Date(date);
//           if (isNaN(targetDate.getTime())) {
//             return res.status(400).json({
//               success: false,
//               message: `Invalid date format. Use DD-MM-YYYY, DD/MM/YYYY, or YYYY-MM-DD format`,
//             });
//           }
//         }
//       } catch (error) {
//         return res.status(400).json({
//           success: false,
//           message: `Invalid date format: ${error.message}. Use DD-MM-YYYY, DD/MM/YYYY, or YYYY-MM-DD format`,
//         });
//       }
//     }

//     const year = targetDate.getUTCFullYear();
//     const month = targetDate.getUTCMonth();
//     const day = targetDate.getUTCDate();
//     targetDate = new Date(Date.UTC(year, month, day, 0, 0, 0, 0));

//     const today = new Date();
//     const todayYear = today.getUTCFullYear();
//     const todayMonth = today.getUTCMonth();
//     const todayDay = today.getUTCDate();
//     today.setTime(Date.UTC(todayYear, todayMonth, todayDay, 0, 0, 0, 0));

//     let bottleCount = {
//       "1/2ltr": 0,
//       "1ltr": 0,
//       total: 0,
//     };

//     // Helper function to calculate bottles from products
//     const calculateBottles = (products) => {
//       products.forEach((product) => {
//         const productName =
//           product.productName ||
//           (product.product && product.product.productName);
//         if (productName && productName.toLowerCase().includes("milk")) {
//           const bottleSize = mapProductSizeToBottleSize(product.productSize);
//           const quantity = product.quantity || 0;
//           bottleCount[bottleSize] += quantity;
//           bottleCount.total += quantity;
//         }
//       });
//     };

//     if (targetDate.getTime() === today.getTime()) {
//       const orders = await CustomerOrders.find({
//         deliveryDate: formatDateToDDMMYYYY(targetDate),
//         status: { $in: ["Pending", "Delivered", "Returned"] },
//       });
//       orders.forEach((order) => calculateBottles(order.products));
//     } else {
//       const customers = await Customer.find({
//         subscriptionStatus: "active",
//         isDeleted: false,
//       }).populate("products.product");

//       const targetDateStr = formatDateToDDMMYYYY(targetDate);
//       const eligibleCustomers = customers.filter((customer) => {
//         const { subscriptionPlan, startDate, endDate, customDeliveryDates } =
//           customer;

//         try {
//           switch (subscriptionPlan) {
//             case "Monthly":
//               if (!startDate || !endDate) return false;
//               const target = parseUniversalDate(targetDateStr);
//               const start = parseUniversalDate(startDate);
//               const end = parseUniversalDate(endDate);
//               return target >= start && target <= end;

//             case "Alternate Days":
//               if (!startDate) return false;
//               const targetAlt = parseUniversalDate(targetDateStr);
//               const startAlt = parseUniversalDate(startDate);
//               const diffTime = targetAlt - startAlt;
//               const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
//               return diffDays >= 0 && diffDays % 2 === 0;

//             case "Custom Date":
//               if (!customDeliveryDates || !Array.isArray(customDeliveryDates))
//                 return false;
//               return customDeliveryDates.some((deliveryDate) => {
//                 try {
//                   const deliveryDateStr =
//                     typeof deliveryDate === "string"
//                       ? deliveryDate
//                       : formatDateToDDMMYYYY(new Date(deliveryDate));
//                   return deliveryDateStr === targetDateStr;
//                 } catch (error) {
//                   console.error("Error parsing custom delivery date:", error);
//                   return false;
//                 }
//               });

//             default:
//               return false;
//           }
//         } catch (error) {
//           console.error("Error processing customer subscription:", error);
//           return false;
//         }
//       });

//       const presentCustomers = eligibleCustomers.filter((customer) => {
//         if (!customer.absentDays || customer.absentDays.length === 0)
//           return true;
//         return !customer.absentDays.some((absentDate) => {
//           const absentDateStr = absentDate.toISOString().split("T")[0];
//           const targetDateStr = targetDate.toISOString().split("T")[0];
//           return absentDateStr === targetDateStr;
//         });
//       });

//       presentCustomers.forEach((customer) =>
//         calculateBottles(customer.products)
//       );
//     }

//     return res.status(200).json({
//       success: true,
//       message: `Bottle count for ${targetDate.toISOString().split("T")[0]}`,
//       data: {
//         totalBottles: { issue: bottleCount.total, return: 0 },
//         "1/2ltr": { issue: bottleCount["1/2ltr"], return: 0 },
//         "1ltr": { issue: bottleCount["1ltr"], return: 0 },
//       },
//     });
//   } catch (error) {
//     console.error("Error calculating bottle count:", error);
//     res.status(500).json({
//       success: false,
//       message: "Error calculating bottle count",
//       error: error.message,
//     });
//   }
// };

const getBottleCountForDate = async (req, res) => {
  try {
    const { date } = req.query;

    let targetDate = new Date();

    if (date) {
      try {
        targetDate = parseUniversalDate(date);
        if (!targetDate) {
          targetDate = new Date(date);
          if (isNaN(targetDate.getTime())) {
            return res.status(400).json({
              success: false,
              message: `Invalid date format. Use DD-MM-YYYY, DD/MM/YYYY, or YYYY-MM-DD format`,
            });
          }
        }
      } catch (error) {
        return res.status(400).json({
          success: false,
          message: `Invalid date format: ${error.message}. Use DD-MM-YYYY, DD/MM/YYYY, or YYYY-MM-DD format`,
        });
      }
    }

    const year = targetDate.getUTCFullYear();
    const month = targetDate.getUTCMonth();
    const day = targetDate.getUTCDate();
    targetDate = new Date(Date.UTC(year, month, day, 0, 0, 0, 0));

    const today = new Date();
    const todayYear = today.getUTCFullYear();
    const todayMonth = today.getUTCMonth();
    const todayDay = today.getUTCDate();
    today.setTime(Date.UTC(todayYear, todayMonth, todayDay, 0, 0, 0, 0));

    let bottleCount = {
      "1/2ltr": 0,
      "1ltr": 0,
      total: 0,
    };

    let bottleReturnsCount = {
      "1/2ltr": 0,
      "1ltr": 0,
      total: 0,
    };

    // Helper: calculate bottles from products
    const calculateBottles = (products) => {
      products.forEach((product) => {
        const productName =
          product.productName ||
          (product.product && product.product.productName);

        if (productName && productName.toLowerCase().includes("milk")) {
          const quantity = product.quantity || 0;
          const bottles = convertSizeToBottles(product.productSize, quantity);

          bottleCount["1ltr"] += bottles["1ltr"];
          bottleCount["1/2ltr"] += bottles["1/2ltr"];
          bottleCount.total += bottles["1ltr"] + bottles["1/2ltr"];
        }
      });
    };

    // Helper: calculate bottle returns from orders
    const calculateBottleReturns = (orders) => {
      orders.forEach((order) => {
        if (order.bottleReturns && Array.isArray(order.bottleReturns)) {
          order.bottleReturns.forEach((returnItem) => {
            const size = returnItem.size;
            const quantity = returnItem.quantity || 0;
            const bottles = convertSizeToBottles(size, quantity);
            bottleReturnsCount["1ltr"] += bottles["1ltr"];
            bottleReturnsCount["1/2ltr"] += bottles["1/2ltr"];
          });
        }
      });

      bottleReturnsCount.total =
        bottleReturnsCount["1ltr"] + bottleReturnsCount["1/2ltr"];
    };

    if (targetDate.getTime() === today.getTime()) {
      const orders = await CustomerOrders.find({
        deliveryDate: formatDateToDDMMYYYY(targetDate),
        status: { $in: ["Pending", "Delivered", "Returned"] },
      });
      orders.forEach((order) => calculateBottles(order.products));
      calculateBottleReturns(orders);
    } else {
      const customers = await Customer.find({
        subscriptionStatus: "active",
        isDeleted: false,
      }).populate("products.product");

      const targetDateStr = formatDateToDDMMYYYY(targetDate);
      const eligibleCustomers = customers.filter((customer) => {
        const { subscriptionPlan, startDate, endDate, customDeliveryDates } =
          customer;

        try {
          switch (subscriptionPlan) {
            case "Monthly":
              if (!startDate || !endDate) return false;
              const target = parseUniversalDate(targetDateStr);
              const start = parseUniversalDate(startDate);
              const end = parseUniversalDate(endDate);
              return target >= start && target <= end;

            case "Alternate Days":
              if (!startDate) return false;
              const targetAlt = parseUniversalDate(targetDateStr);
              const startAlt = parseUniversalDate(startDate);
              const diffTime = targetAlt - startAlt;
              const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
              return diffDays >= 0 && diffDays % 2 === 0;

            case "Custom Date":
              if (!customDeliveryDates || !Array.isArray(customDeliveryDates))
                return false;
              return customDeliveryDates.some((deliveryDate) => {
                try {
                  const deliveryDateStr =
                    typeof deliveryDate === "string"
                      ? deliveryDate
                      : formatDateToDDMMYYYY(new Date(deliveryDate));
                  return deliveryDateStr === targetDateStr;
                } catch (error) {
                  console.error("Error parsing custom delivery date:", error);
                  return false;
                }
              });

            default:
              return false;
          }
        } catch (error) {
          console.error("Error processing customer subscription:", error);
          return false;
        }
      });

      const presentCustomers = eligibleCustomers.filter((customer) => {
        if (!customer.absentDays || customer.absentDays.length === 0)
          return true;
        return !customer.absentDays.some((absentDate) => {
          const absentDateStr = absentDate.toISOString().split("T")[0];
          const targetDateStr = targetDate.toISOString().split("T")[0];
          return absentDateStr === targetDateStr;
        });
      });

      presentCustomers.forEach((customer) =>
        calculateBottles(customer.products)
      );
    }

    return res.status(200).json({
      success: true,
      message: `Bottle count for ${formatDateToDDMMYYYY(targetDate)}`,
      data: {
        totalBottles: {
          issue: bottleCount.total,
          return: bottleReturnsCount.total,
        },
        "1/2ltr": {
          issue: bottleCount["1/2ltr"],
          return: bottleReturnsCount["1/2ltr"],
        },
        "1ltr": {
          issue: bottleCount["1ltr"],
          return: bottleReturnsCount["1ltr"],
        },
      },
    });
  } catch (error) {
    console.error("Error calculating bottle count:", error);
    res.status(500).json({
      success: false,
      message: "Error calculating bottle count",
      error: error.message,
    });
  }
};

//✅ Get All Bottle Tracking Orders (Milk products only)
const getAllBottleTrackingOrders = async (req, res) => {
  try {
    let {
      page = 1,
      limit = 10,
      size = "",
      startDate = "",
      endDate = "",
    } = req.query;

    page = parseInt(page);
    limit = parseInt(limit);
    const skip = (page - 1) * limit;

    const regexSize = size ? new RegExp(size, "i") : null;

    let pipeline = [
      {
        $lookup: {
          from: "customers",
          localField: "customer",
          foreignField: "_id",
          as: "customer",
        },
      },
      { $unwind: "$customer" },
      {
        $lookup: {
          from: "deliveryboys",
          localField: "deliveryBoy",
          foreignField: "_id",
          as: "deliveryBoy",
        },
      },
      { $unwind: "$deliveryBoy" },
      {
        $match: {
          "products.productName": { $regex: /milk/i },
        },
      },
      {
        $match: {
          "products.productSize": {
            $regex:
              /^(1\s*L|1\s*ltr|1\s*liter|1\s*l|0\.5\s*L|0\.5\s*ltr|1\/2\s*L|1\/2\s*ltr|1\/2\s*liter|1\/2\s*l|500\s*ml)$/i,
          },
        },
      },
    ];

    let dateMatch = {};

    if (startDate || endDate) {
      if (startDate && endDate) {
        const start = parseUniversalDate(startDate) || new Date(startDate);
        const end = parseUniversalDate(endDate) || new Date(endDate);

        if (!isNaN(start.getTime()) && !isNaN(end.getTime())) {
          const startDateStr = formatDateToDDMMYYYY(start);
          const endDateStr = formatDateToDDMMYYYY(end);
          dateMatch.deliveryDate = { $gte: startDateStr, $lte: endDateStr };
        }
      } else if (startDate) {
        const start = parseUniversalDate(startDate) || new Date(startDate);
        if (!isNaN(start.getTime())) {
          const startDateStr = formatDateToDDMMYYYY(start);
          dateMatch.deliveryDate = { $gte: startDateStr };
        }
      } else if (endDate) {
        const end = parseUniversalDate(endDate) || new Date(endDate);
        if (!isNaN(end.getTime())) {
          const endDateStr = formatDateToDDMMYYYY(end);
          dateMatch.deliveryDate = { $lte: endDateStr };
        }
      }
    } else {
      const today = new Date();
      const todayDateStr = formatDateToDDMMYYYY(today);
      dateMatch.deliveryDate = todayDateStr;
    }

    if (Object.keys(dateMatch).length > 0) {
      pipeline.push({ $match: dateMatch });
    }

    if (regexSize) {
      let productMatch = {};
      // Create a more precise regex that matches exact bottle sizes
      const exactSizeRegex = new RegExp(
        `^${size.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`,
        "i"
      );
      productMatch["products.productSize"] = exactSizeRegex;

      pipeline.push({ $match: productMatch });
    }

    const totalOrdersResult = await CustomerOrders.aggregate([
      ...pipeline,
      { $count: "total" },
    ]);

    const totalOrders = totalOrdersResult[0] ? totalOrdersResult[0].total : 0;

    pipeline.push({ $sort: { createdAt: -1 } });
    pipeline.push({ $skip: skip });
    pipeline.push({ $limit: limit });

    const orders = await CustomerOrders.aggregate(pipeline);

    if (!orders || orders.length === 0) {
      return res.status(404).json({
        success: false,
        message: "No bottle tracking orders found",
      });
    }

    const response = orders.map((order) => ({
      orderId: order._id,
      orderNumber: order.orderNumber,
      customerName: order.customer?.name || "N/A",
      phoneNumber: order.customer?.phoneNumber || "N/A",
      deliveryBoyName: order.deliveryBoy?.name || "N/A",
      deliveryDate: order.deliveryDate,
      bottlesReturned: order.bottlesReturned,
      orderStatus: order.status,
      paymentStatus: order.paymentStatus,
      totalAmount: order.totalAmount,
      products: order.products
        .filter(
          (p) =>
            p.productName.toLowerCase().includes("milk") &&
            /^(1\s*L|1\s*ltr|1\s*liter|1\s*l|0\.5\s*L|0\.5\s*ltr|1\/2\s*L|1\/2\s*ltr|1\/2\s*liter|1\/2\s*l|500\s*ml)$/i.test(
              p.productSize
            )
        )
        .map((p) => ({
          productName: p.productName,
          size: p.productSize,
          quantity: p.quantity,
          price: p.price,
          totalPrice: p.totalPrice,
        })),
    }));

    const totalPages = Math.ceil(totalOrders / limit);

    return res.status(200).json({
      success: true,
      message: "All bottle tracking orders fetched successfully",
      totalOrders,
      totalPages,
      currentPage: page,
      previous: page > 1,
      next: page < totalPages,
      orders: response,
    });
  } catch (error) {
    console.error("getAllBottleTrackingOrders Error:", error);
    return res.status(500).json({
      success: false,
      message: "Error fetching bottle tracking orders",
      error: error.message,
    });
  }
};

module.exports = {
  getBottleCountForDate,
  getAllBottleTrackingOrders,
};
