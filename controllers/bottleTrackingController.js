const BottleTransaction = require("../models/bottleTrackingModel");
const DeliveryBoy = require("../models/deliveryBoyModel");
const Customer = require("../models/customerModel");
const CustomerOrders = require("../models/customerOrderModel");
const {
  formatDateToDDMMYYYY,
  parseUniversalDate,
} = require("../utils/parsedDateAndDay");

// ✅ Create new transaction (assign bottles with sizes)
const createTransaction = async (req, res) => {
  try {
    const { deliveryBoy, assigned, returned, remarks } = req.body;

    // find last transaction for this delivery boy
    const lastTransaction = await BottleTransaction.findOne({
      deliveryBoy,
    }).sort({ createdAt: -1 });

    let prevPending = lastTransaction ? lastTransaction.pending : [];

    // initialize pending by merging prevPending + assigned - returned
    const pending = [];

    const sizes = ["0.5L", "1L"];

    sizes.forEach((size) => {
      const prev = prevPending.find((p) => p.size === size)?.count || 0;
      const assignCount = assigned?.find((a) => a.size === size)?.count || 0;
      const returnCount = returned?.find((r) => r.size === size)?.count || 0;

      pending.push({
        size,
        count: prev + assignCount - returnCount,
      });
    });

    const transaction = await BottleTransaction.create({
      deliveryBoy,
      assigned,
      returned,
      pending,
      remarks,
    });

    res.status(201).json({ success: true, transaction });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// ✅ Get all transactions
const getAllTransactions = async (req, res) => {
  try {
    const transactions = await BottleTransaction.find().populate(
      "deliveryBoy",
      "name phoneNumber area"
    );
    res.status(200).json({ success: true, transactions });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// ✅ Get transactions by delivery boy
const getTransactionsByDeliveryBoy = async (req, res) => {
  try {
    const { id } = req.params;
    const transactions = await BottleTransaction.find({
      deliveryBoy: id,
    }).populate("deliveryBoy", "name phoneNumber area");

    res.status(200).json({ success: true, transactions });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// ✅ Update a transaction (edit remarks or values)
const updateTransaction = async (req, res) => {
  try {
    const { id } = req.params;
    const transaction = await BottleTransaction.findByIdAndUpdate(
      id,
      req.body,
      { new: true }
    );

    if (!transaction)
      return res
        .status(404)
        .json({ success: false, message: "Transaction not found" });

    res.status(200).json({ success: true, transaction });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// ✅ Delete transaction
const deleteTransaction = async (req, res) => {
  try {
    const { id } = req.params;
    const transaction = await BottleTransaction.findByIdAndDelete(id);

    if (!transaction)
      return res
        .status(404)
        .json({ success: false, message: "Transaction not found" });

    res.status(200).json({ success: true, message: "Transaction deleted" });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// ✅ Get current pending balance for a delivery boy
const getPendingBalance = async (req, res) => {
  try {
    const { id } = req.params;
    const lastTransaction = await BottleTransaction.findOne({
      deliveryBoy: id,
    }).sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      pending: lastTransaction ? lastTransaction.pending : [],
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// ✅ Update returned bottles by size
const updateReturnedBottles = async (req, res) => {
  try {
    const { id } = req.params; // transaction id
    const { size, count } = req.body; // size: "0.5L"/"1L", count: number

    if (!size || count === undefined || count < 0) {
      return res.status(400).json({
        success: false,
        message: "Size and returned count are required and must be >= 0",
      });
    }

    let transaction = await BottleTransaction.findById(id);
    if (!transaction) {
      return res
        .status(404)
        .json({ success: false, message: "Transaction not found" });
    }

    // Update returned entry
    let returnedEntry = transaction.returned.find((r) => r.size === size);
    if (!returnedEntry) {
      transaction.returned.push({ size, count: 0 });
      returnedEntry = transaction.returned.find((r) => r.size === size);
    }
    returnedEntry.count += count;

    // Find assigned entry
    const assignedEntry = transaction.assigned.find((a) => a.size === size);
    if (!assignedEntry) {
      return res
        .status(400)
        .json({ success: false, message: `No assigned bottles for ${size}` });
    }

    // Update pending = assigned - returned
    let pendingEntry = transaction.pending.find((p) => p.size === size);
    if (!pendingEntry) {
      transaction.pending.push({ size, count: 0 });
      pendingEntry = transaction.pending.find((p) => p.size === size);
    }
    pendingEntry.count = assignedEntry.count - returnedEntry.count;

    await transaction.save();

    res.status(200).json({
      success: true,
      message: `Returned bottles updated successfully for ${size}`,
      transaction,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// Get bottle count for a specific date
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

    // Helper function to calculate bottles from products
    const calculateBottles = (products) => {
      products.forEach((product) => {
        const productName =
          product.productName ||
          (product.product && product.product.productName);
        if (productName && productName.toLowerCase().includes("milk")) {
          const bottleSize = mapProductSizeToBottleSize(product.productSize);
          const quantity = product.quantity || 0;
          bottleCount[bottleSize] += quantity;
          bottleCount.total += quantity;
        }
      });
    };


    if (targetDate.getTime() === today.getTime()) {      
      const orders = await CustomerOrders.find({
        deliveryDate: formatDateToDDMMYYYY(targetDate),
        status: { $in: ["Pending", "Delivered"] },
      });
      orders.forEach((order) => calculateBottles(order.products));
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
      message: `Bottle count for ${targetDate.toISOString().split("T")[0]}`,
      data: {
        totalBottles: { issue: bottleCount.total, return: 0 },
        "1/2ltr": { issue: bottleCount["1/2ltr"], return: 0 },
        "1ltr": { issue: bottleCount["1ltr"], return: 0 },
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

// Helper function to map product size to bottle size
const mapProductSizeToBottleSize = (productSize) => {
  if (!productSize) return "1ltr";

  const sizeStr = productSize.toString().toLowerCase();

  if (sizeStr.includes("1/2")) {
    return "1/2ltr";
  }

  if (sizeStr.includes("1l") || sizeStr.includes("1 l")) {
    return "1ltr";
  }

  return "1ltr";
};

module.exports = {
  createTransaction,
  getAllTransactions,
  getTransactionsByDeliveryBoy,
  updateTransaction,
  deleteTransaction,
  getPendingBalance,
  updateReturnedBottles,
  getBottleCountForDate,
};
