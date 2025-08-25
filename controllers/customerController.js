const Customer = require("../models/coustomerModel");
const DeliveryHistory = require("../models/delhiveryHistory");
const CustomerCustomOrder = require("../models/customerCustomOrder");

// ➡️ Create new customer
exports.createCustomer = async (req, res) => {
  try {
    const customer = new Customer(req.body);
    await customer.save();
    res.status(201).json({ success: true, data: customer });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
};

// ➡️ Get all customers
exports.getCustomers = async (req, res) => {
  try {
    const customers = await Customer.find()
      .populate("products.product", "productName price size stock")
      .populate("deliveryBoy", "name phoneNumber");
    res.json({ success: true, data: customers });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// ➡️ Get single customer by ID
exports.getCustomerById = async (req, res) => {
  try {
    const customer = await Customer.findById(req.params.id)
      .populate("products.product", "name price size")
      .populate("deliveryBoy", "name phoneNumber");
    if (!customer) return res.status(404).json({ success: false, error: "Customer not found" });
    res.json({ success: true, data: customer });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// ➡️ Update customer
exports.updateCustomer = async (req, res) => {
  try {
    const customer = await Customer.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });
    if (!customer) return res.status(404).json({ success: false, error: "Customer not found" });
    res.json({ success: true, data: customer });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
};

// ➡️ Delete customer
exports.deleteCustomer = async (req, res) => {
  try {
    const customer = await Customer.findByIdAndDelete(req.params.id);
    if (!customer) return res.status(404).json({ success: false, error: "Customer not found" });
    res.json({ success: true, message: "Customer deleted" });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};


exports.makeAbsentDays = async (req, res) => {
  try {
    const { id } = req.params;
    const { absentDays } = req.body;

    // Validate input
    if (!absentDays || !Array.isArray(absentDays)) {
      return res.status(400).json({
        success: false,
        error: "absentDays must be an array of dates"
      });
    }

    const customer = await Customer.findById(id).populate('products.product');
    if (!customer) {
      return res.status(404).json({
        success: false,
        error: "Customer not found"
      });
    }

    // Validate and format dates
    const formattedAbsentDays = [];
    const deliveryHistoryEntries = [];

    for (const dateStr of absentDays) {
      try {
        const date = new Date(dateStr);
        if (isNaN(date.getTime())) {
          return res.status(400).json({
            success: false,
            error: `Invalid date format: ${dateStr}. Use ISO format (YYYY-MM-DD)`
          });
        }

        // Normalize date to remove time component
        date.setHours(0, 0, 0, 0);
        formattedAbsentDays.push(date);

        // Fetch custom orders for this date
        const customOrders = await CustomerCustomOrder.find({
          customer: id,
          date: {
            $gte: new Date(date.setHours(0, 0, 0, 0)),
            $lt: new Date(date.setHours(23, 59, 59, 999))
          }
        }).populate('product');

        // Combine subscription products and custom orders
        const allProducts = [
          // Subscription products
          ...customer.products.map(product => ({
            product: product.product,
            quantity: product.quantity,
            isDelivered: false,
             status:"absent",
            totalPrice: product.totalPrice,
            orderType: 'subscription'
          })),
          // Custom orders
          ...customOrders.map(customOrder => ({
            product: customOrder.product,
            quantity: customOrder.quantity,
            isDelivered: false,
            status:"absent",
            totalPrice: customOrder.totalPrice,
            orderType: 'custom',
            customOrderId: customOrder._id
          }))
        ];

        // Create delivery history entry for each absent day
        const historyEntry = await DeliveryHistory.create({
          customer: id,
          date: date,
          status: "Missed",
          remarks: "Customer absent",
          deliveryBoy: customer.deliveryBoy,
          products: allProducts
        });

        deliveryHistoryEntries.push(historyEntry);

      } catch (error) {
        console.error(`Error processing date ${dateStr}:`, error);
        return res.status(400).json({
          success: false,
          error: `Invalid date: ${dateStr}`
        });
      }
    }

    // Update customer's absent days (avoid duplicates)
    const uniqueAbsentDays = [...new Set([...customer.absentDays, ...formattedAbsentDays])];
    customer.absentDays = uniqueAbsentDays;

    await customer.save();

    res.json({
      success: true,
      data: {
        customer: customer,
        deliveryHistory: deliveryHistoryEntries
      },
      message: `Marked ${formattedAbsentDays.length} days as absent and created delivery history entries`
    });
  } catch (err) {
    console.error("Error in makeAbsentDays:", err);
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
};