const Customer = require("../models/coustomerModel");
const DeliveryHistory = require("../models/delhiveryHistory");
const CustomerCustomOrder = require("../models/customerCustomOrder");
const mongoose = require("mongoose");

const createCustomer = async (req, res) => {
  try {
    const { name, phoneNumber, gender, address, products, deliveryBoy } =
      req.body;

    // Check if customer with phone number already exists
    const existingCustomer = await Customer.findOne({ phoneNumber });
    if (existingCustomer) {
      return res.status(400).json({
        success: false,
        message: "Customer with this phone number already exists",
      });
    }

    // Process products to ensure deliveryDays has valid values
    const processedProducts = Array.isArray(products)
      ? products.map((product) => ({
          ...product,
          deliveryDays:
            product.deliveryDays &&
            [
              "Daily",
              "Alternate Days",
              "Monday to Friday",
              "Weekends",
              "Custom",
            ].includes(product.deliveryDays)
              ? product.deliveryDays
              : "Daily",
          // Ensure customDeliveryDates is an array
          customDeliveryDates: Array.isArray(product.customDeliveryDates)
            ? product.customDeliveryDates
            : [],
          // Set default startDate if not provided
          startDate: product.startDate
            ? new Date(product.startDate)
            : new Date(),
          // Convert endDate to Date object if provided
          endDate: product.endDate ? new Date(product.endDate) : undefined,
        }))
      : [];

    const newCustomer = new Customer({
      name,
      phoneNumber,
      gender,
      address,
      products: processedProducts,
      deliveryBoy,
    });

    const savedCustomer = await newCustomer.save();
    const populatedCustomer = await Customer.findById(savedCustomer._id)
      .populate(
        "products.product",
        "productName price productType size productCode description"
      )
      .populate("deliveryBoy", "name phoneNumber email");

    res.status(201).json({
      success: true,
      message: "Customer created successfully",
      data: populatedCustomer,
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: "Phone number already exists",
      });
    }

    // Handle validation errors specifically
    if (error.name === "ValidationError") {
      const errors = Object.values(error.errors).map((err) => err.message);
      return res.status(400).json({
        success: false,
        message: "Validation error",
        errors: errors,
      });
    }

    res.status(500).json({
      success: false,
      message: "Error creating customer",
      error: error.message,
    });
  }
};

// Get all customers
const getAllCustomers = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    // Build filter object
    const filter = {};
    if (req.query.gender) filter.gender = req.query.gender;
    if (req.query.deliveryBoy) filter.deliveryBoy = req.query.deliveryBoy;
    if (req.query.name) {
      filter.name = { $regex: req.query.name, $options: "i" };
    }
    if (req.query.phoneNumber) {
      filter.phoneNumber = { $regex: req.query.phoneNumber };
    }
    if (req.query.search) {
      filter.$or = [
        { name: { $regex: req.query.search, $options: "i" } },
        { phoneNumber: { $regex: req.query.search, $options: "i" } },
        { address: { $regex: req.query.search, $options: "i" } },
      ];
    }
    // Product-wise filtering
    if (req.query.product) {
      filter["products.product"] = req.query.product;
    }
    if (req.query.size) {
      filter["products.size"] = req.query.size;
    }
    if (req.query.subscriptionPlan) {
      filter["products.subscriptionPlan"] = req.query.subscriptionPlan;
    }
    if (req.query.deliveryDays) {
      filter["products.deliveryDays"] = req.query.deliveryDays;
    }

    const customers = await Customer.find(filter)
      .populate({
        path: "products.product",
        select: "productName price   size",
        match: {
          ...(req.query.productType && { productType: req.query.productType }),
          ...(req.query.productCategory && {
            category: req.query.productCategory,
          }),
        },
      })
      .populate("deliveryBoy", "name phoneNumber email")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    // Filter out customers who have no products after population (due to productType/category filter)
    const filteredCustomers = customers.filter((customer) =>
      customer.products.some((product) => product.product !== null)
    );

    const totalCustomers = await Customer.countDocuments(filter);

    res.status(200).json({
      success: true,
      data: filteredCustomers,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(totalCustomers / limit),
        totalCustomers,
        hasNext: page < Math.ceil(totalCustomers / limit),
        hasPrev: page > 1,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error fetching customers",
      error: error.message,
    });
  }
};

// Get single customer by ID
const getCustomerById = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid customer ID",
      });
    }

    const customer = await Customer.findById(id)
      .populate("products.product", "productName price size  description")
      .populate("deliveryBoy", "name phoneNumber email address");

    if (!customer) {
      return res.status(404).json({
        success: false,
        message: "Customer not found",
      });
    }

    res.status(200).json({
      success: true,
      data: customer,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error fetching customer",
      error: error.message,
    });
  }
};

// Update customer
const updateCustomer = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid customer ID",
      });
    }

    // If updating phone number, check for duplicates
    if (updates.phoneNumber) {
      const existingCustomer = await Customer.findOne({
        phoneNumber: updates.phoneNumber,
        _id: { $ne: id },
      });
      if (existingCustomer) {
        return res.status(400).json({
          success: false,
          message: "Phone number already exists",
        });
      }
    }

    const updatedCustomer = await Customer.findByIdAndUpdate(id, updates, {
      new: true,
      runValidators: true,
    })
      .populate("products.product", "productName price category")
      .populate("deliveryBoy", "name phoneNumber email");

    if (!updatedCustomer) {
      return res.status(404).json({
        success: false,
        message: "Customer not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Customer updated successfully",
      data: updatedCustomer,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error updating customer",
      error: error.message,
    });
  }
};

// Delete customer
const deleteCustomer = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid customer ID",
      });
    }

    const deletedCustomer = await Customer.findByIdAndDelete(id);

    if (!deletedCustomer) {
      return res.status(404).json({
        success: false,
        message: "Customer not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Customer deleted successfully",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error deleting customer",
      error: error.message,
    });
  }
};

const makeAbsentDays = async (req, res) => {
  try {
    const { id } = req.params;
    const { dates } = req.body; // array of YYYY-MM-DD strings

    if (!dates || !Array.isArray(dates)) {
      return res.status(400).json({
        success: false,
        error: "dates must be an array of ISO date strings (YYYY-MM-DD)",
      });
    }

    const customer = await Customer.findById(id).populate("products.product");
    if (!customer) {
      return res.status(404).json({
        success: false,
        error: "Customer not found",
      });
    }

    const updatedAbsentDays = customer.absentDays.map(
      (d) => d.toISOString().split("T")[0]
    ); // convert to YYYY-MM-DD array
    const deliveryHistoryEntries = [];

    for (const dateStr of dates) {
      const [year, month, day] = dateStr.split("-").map(Number);
      const normalizedDate = new Date(Date.UTC(year, month - 1, day));

      // Check if already absent
      const isAlreadyAbsent = updatedAbsentDays.includes(dateStr);

      if (isAlreadyAbsent) {
        // 🔹 Remove from absent
        customer.absentDays = customer.absentDays.filter(
          (d) => d.toISOString().split("T")[0] !== dateStr
        );

        // 🔹 Remove from DeliveryHistory
        await DeliveryHistory.deleteMany({
          customer: id,
          date: normalizedDate,
          status: "Missed",
        });

        deliveryHistoryEntries.push({
          date: dateStr,
          action: "removed",
        });
      } else {
        // 🔹 Mark as absent
        customer.absentDays.push(normalizedDate);

        // Fetch custom orders for this date
        const startOfDay = new Date(Date.UTC(year, month - 1, day));
        const endOfDay = new Date(
          Date.UTC(year, month - 1, day, 23, 59, 59, 999)
        );

        const customOrders = await CustomerCustomOrder.find({
          customer: id,
          date: { $gte: startOfDay, $lt: endOfDay },
        }).populate("product");

        const allProducts = [
          // Subscription products
          ...customer.products.map((product) => ({
            product: product.product,
            price: product.price,
            quantity: product.quantity,
            isDelivered: false,
            status: "absent",
            totalPrice: product.totalPrice,
            orderType: "subscription",
          })),
          // Custom orders
          ...customOrders.map((customOrder) => ({
            product: customOrder.product,
            quantity: customOrder.quantity,
            price: customOrder.price,
            isDelivered: false,
            status: "absent",
            totalPrice: customOrder.totalPrice,
            orderType: "custom",
            customOrderId: customOrder._id,
          })),
        ];

        const historyEntry = await DeliveryHistory.create({
          customer: id,
          date: normalizedDate,
          totalPrice: allProducts.reduce(
            (sum, item) => sum + (item.totalPrice || 0),
            0
          ),
          status: "Missed",
          remarks: "Customer absent",
          deliveryBoy: customer.deliveryBoy,
          products: allProducts,
        });

        deliveryHistoryEntries.push({
          date: dateStr,
          action: "added",
          historyId: historyEntry._id,
        });
      }
    }

    await customer.save();

    res.json({
      success: true,
      message: "Absent days updated successfully",
      data: {
        customer: {
          _id: customer._id,
          name: customer.name,
          phoneNumber: customer.phoneNumber,
          absentDays: customer.absentDays,
        },
        changes: deliveryHistoryEntries,
      },
    });
  } catch (err) {
    console.error("Error in toggleAbsentDays:", err);
    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
};

const createCustomOrder = async (req, res) => {
  try {
    const { customer, date, products, deliveryBoy } = req.body;

    // Validation
    if (!customer || !products || products.length === 0 || !grandTotal) {
      return res.status(400).json({
        success: false,
        message: "Customer, products, and required fields",
      });
    }

    const newOrder = new CustomerCustomOrder({
      customer,
      date,
      products,
      deliveryBoy,
    });

    const savedOrder = await newOrder.save();

    const populatedOrder = await CustomerCustomOrder.findById(savedOrder._id)
      .populate("customer", "name phoneNumber address")
      .populate("products.product", "productName price size") // 👈 only ref is populated
      .populate("deliveryBoy", "name phone");

    res.status(201).json({
      success: true,
      message: "Order created successfully",
      data: populatedOrder,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error creating order",
      error: error.message,
    });
  }
};

module.exports = {
  createCustomer,
  getAllCustomers,
  getCustomerById,
  updateCustomer,
  deleteCustomer,
  makeAbsentDays,
  createCustomOrder,
};