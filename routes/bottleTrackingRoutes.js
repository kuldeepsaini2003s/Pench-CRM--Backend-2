const express = require("express");
const router = express.Router();
const {
  createTransaction,
  getAllTransactions,
  getTransactionsByDeliveryBoy,
  updateTransaction,
  deleteTransaction,
  getPendingBalance,
  updateReturnedBottles,
  getBottleCountForDate,
  getAllBottleTrackingOrders,
} = require("../controllers/bottleTrackingController");

// POST - create transaction
router.post("/", createTransaction);

// GET - all transactions
router.get("/", getAllTransactions);

// GET - transactions by delivery boy
router.get("/deliveryBoy/:id", getTransactionsByDeliveryBoy);

// GET - current pending balance
router.get("/pending/:id", getPendingBalance);

// PUT - update transaction
router.put("/:id", updateTransaction);

// DELETE - delete transaction
router.delete("/:id", deleteTransaction);
router.put("/:id/return", updateReturnedBottles);

// Bottle tracking route
router.get("/bottles/count", getBottleCountForDate);

// GET - all bottle tracking orders (milk products only)
router.get("/orders", getAllBottleTrackingOrders);

module.exports = router;
