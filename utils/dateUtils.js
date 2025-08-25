function isSameDay(date1, date2) {
  return date1.toDateString() === date2.toDateString();
}

function isWeekday(date) {
  const day = date.getDay();
  return day >= 1 && day <= 5;
}

function isWeekend(date) {
  const day = date.getDay();
  return day === 0 || day === 6;
}

function normalizeDate(date) {
  const normalized = new Date(date);
  normalized.setHours(0, 0, 0, 0);
  return normalized;
}

function isAbsentDay(customer, targetDate) {
  if (!customer.absentDays || !Array.isArray(customer.absentDays)) {
    return false;
  }

  return customer.absentDays.some(absentDate =>
    isSameDay(normalizeDate(absentDate), normalizeDate(targetDate))
  );
}

function shouldDeliverOnDate(customer, product, targetDate) {
  // Check if customer is absent on this day
  if (isAbsentDay(customer, targetDate)) {
    return false;
  }

  const startDate = normalizeDate(product.startDate);
  const endDate = normalizeDate(product.endDate);
  const normalizedTargetDate = normalizeDate(targetDate);

  // Check if within subscription period
  if (normalizedTargetDate < startDate || normalizedTargetDate > endDate) {
    return false;
  }

  switch (product.deliveryDays) {
    case "Daily":
      return true;

    case "Alternate Days":
      const daysDiff = Math.floor(
        (normalizedTargetDate - startDate) / (1000 * 60 * 60 * 24)
      );
      return daysDiff % 2 === 0;

    case "Monday to Friday":
      return isWeekday(normalizedTargetDate);

    case "Weekends":
      return isWeekend(normalizedTargetDate);

    case "Custom":
      if (!product.customDeliveryDates || product.customDeliveryDates.length === 0) {
        return false;
      }
      return product.customDeliveryDates.some((customDate) => {
        try {
          const customDateObj = normalizeDate(customDate);
          return isSameDay(customDateObj, normalizedTargetDate);
        } catch (error) {
          console.error("Error parsing custom delivery date:", error);
          return false;
        }
      });

    default:
      return false;
  }
}

async function formatOrderResponse(customers, customOrders, targetDate, deliveryBoyId) {
  const customerOrdersMap = new Map();
  const normalizedTargetDate = normalizeDate(targetDate);

  // Process subscription orders
  for (const customer of customers) {
    if (!customer.products || !Array.isArray(customer.products)) {
      continue;
    }

    const customerOrders = [];

    for (const product of customer.products) {
      if (!product || !product.product) {
        continue;
      }

      try {
        if (shouldDeliverOnDate(customer, product, normalizedTargetDate)) {
          customerOrders.push({
            orderType: "subscription",
            orderId: product._id,
            product: {
              _id: product.product._id,
              name: product.product.productName || "Unknown Product",
              description: product.product.description || "",
              quantity: product.quantity || 0,
              price: product.product.price || 0,
            },
            subscription: {
              plan: product.subscriptionPlan || "N/A",
              deliveryDays: product.deliveryDays || "N/A",
              startDate: product.startDate,
              endDate: product.endDate,
              customDeliveryDates: product.customDeliveryDates || [],
            },
            financials: {
              totalPrice: product.totalPrice || 0,
              amountPaid: product.amountPaidTillDate || 0,
              amountDue: product.amountDue || 0,
            },
            timestamps: {
              createdAt: product.createdAt,
              updatedAt: product.updatedAt,
            },
          });
        }
      } catch (error) {
        console.error("Error processing product:", error);
        continue;
      }
    }

    if (customerOrders.length > 0) {
      customerOrdersMap.set(customer._id.toString(), {
        customer: {
          _id: customer._id,
          name: customer.name || "N/A",
          phoneNumber: customer.phoneNumber || "N/A",
          address: customer.address || "N/A",
          userProfile: customer.userProfile || null,
          gender: customer.gender || "N/A",
        },
        orders: customerOrders
      });
    }
  }

  // Process custom orders
  for (const customOrder of customOrders) {
    if (!customOrder.customer || !customOrder.product) {
      continue;
    }

    const customerId = customOrder.customer._id.toString();
    const orderData = {
      orderType: "custom",
      orderId: customOrder._id,
      product: {
        _id: customOrder.product._id,
        name: customOrder.product.productName || "Unknown Product",
        description: customOrder.product.description || "",
        quantity: customOrder.quantity || 0,
        price: customOrder.product.price || 0,
      },
      financials: {
        totalPrice: customOrder.totalPrice || 0,
        amountPaid: 0, // Custom orders typically paid upfront
        amountDue: customOrder.totalPrice || 0,
      },
      timestamps: {
        createdAt: customOrder.createdAt,
        updatedAt: customOrder.updatedAt,
      },
    };

    if (customerOrdersMap.has(customerId)) {
      customerOrdersMap.get(customerId).orders.push(orderData);
    } else {
      customerOrdersMap.set(customerId, {
        customer: {
          _id: customOrder.customer._id,
          name: customOrder.customer.name || "N/A",
          phoneNumber: customOrder.customer.phoneNumber || "N/A",
          address: customOrder.customer.address || "N/A",
          userProfile: customOrder.customer.userProfile || null,
          gender: customOrder.customer.gender || "N/A",
        },
        orders: [orderData]
      });
    }
  }

  // Convert map to array
  return Array.from(customerOrdersMap.values());
}

module.exports = {
  isSameDay,
  isWeekday,
  isWeekend,
  normalizeDate,
  isAbsentDay,
  shouldDeliverOnDate,
  formatOrderResponse,
};