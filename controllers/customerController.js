const Customer = require("../models/coustomerModel");
const DeliveryHistory = require("../models/delhiveryHistory");
const CustomerCustomOrder = require("../models/customerCustomOrder");
const mongoose = require("mongoose");
const DeliveryBoy = require("../models/delhiveryBoyModel");
const Product = require("../models/productModel");

// ✅ Create Customer
const createCustomer = async (req, res) => {
  try {
    const { name, phoneNumber, gender, address, deliveryBoyName, products } =
      req.body;

    // 1. DeliveryBoy validate
    const deliveryBoy = await DeliveryBoy.findOne({ name: deliveryBoyName });
    if (!deliveryBoy) {
      const allDeliveryBoys = await DeliveryBoy.find({}, "name");
      return res.status(400).json({
        success: false,
        message: "Invalid delivery boy name, please select from dropdown",
        availableDeliveryBoys: allDeliveryBoys.map((d) => d.name),
      });
    }

    // ✅ helper to parse "dd/mm/yyyy"
    const parseDDMMYYYYtoDate = (dateStr) => {
      if (!dateStr) return null;
      const [day, month, year] = dateStr.split("/");
      return new Date(`${year}-${month}-${day}`);
    };

    // ✅ helper to format Date -> dd/mm/yyyy
    const formatDateToDDMMYYYY = (dateObj) => {
      if (!dateObj) return null;
      const d = new Date(dateObj);
      const day = String(d.getDate()).padStart(2, "0");
      const month = String(d.getMonth() + 1).padStart(2, "0");
      const year = d.getFullYear();
      return `${day}/${month}/${year}`;
    };

    // 2. Validate Products
    const validatedProducts = [];
    for (let item of products) {
      const {
        productName,
        price,
        quantity,
        subscriptionPlan,
        deliveryDays,
        productSize,
        customDeliveryDates,
        startDate,
        endDate,
        totalPrice,
      } = item;

      // Product find by name
      const productDoc = await Product.findOne({ productName });
      if (!productDoc) {
        const allProducts = await Product.find({}, "productName");
        return res.status(400).json({
          success: false,
          message: `Invalid product name: ${productName}, please select from dropdown`,
          availableProducts: allProducts.map((p) => p.productName),
        });
      }

      // Validate product size if provided
      if (productSize && !productDoc.size.includes(productSize)) {
        return res.status(400).json({
          success: false,
          message: `Invalid product size: ${productSize} for product: ${productName}`,
          availableSizes: productDoc.size,
        });
      }

      // ✅ Parse dates before saving
      const parsedCustomDates = Array.isArray(customDeliveryDates)
        ? customDeliveryDates.map((d) => parseDDMMYYYYtoDate(d))
        : [];

      let parsedStartDate = parseDDMMYYYYtoDate(startDate);
      let parsedEndDate = parseDDMMYYYYtoDate(endDate);

      // ✅ If Monthly subscription & startDate is missing → take first custom date
      if (
        subscriptionPlan === "Monthly" &&
        !parsedStartDate &&
        parsedCustomDates.length > 0
      ) {
        parsedStartDate = parsedCustomDates[0];
      }

      validatedProducts.push({
        product: productDoc._id,
        price,
        quantity,
        productSize,
        subscriptionPlan,
        deliveryDays,
        customDeliveryDates: parsedCustomDates,
        startDate: parsedStartDate,
        endDate: parsedEndDate,
        totalPrice,
      });
    }

    // 3. Customer create
    const customer = new Customer({
      name,
      phoneNumber,
      gender,
      address,
      products: validatedProducts,
      deliveryBoy: deliveryBoy._id,
    });

    await customer.save();

    // ✅ Format response before sending
    const formattedCustomer = {
      ...customer.toObject(),
      products: customer.products.map((p) => ({
        ...p.toObject(),
        customDeliveryDates: p.customDeliveryDates.map((d) =>
          formatDateToDDMMYYYY(d)
        ),
        startDate: formatDateToDDMMYYYY(p.startDate),
        endDate: formatDateToDDMMYYYY(p.endDate),
      })),
    };

    res.status(201).json({
      success: true,
      message: "Customer created successfully",
      data: formattedCustomer,
    });
  } catch (error) {
    console.error("Error creating customer:", error);
    res.status(500).json({
      success: false,
      message: "Failed to create customer",
      error: error.message,
    });
  }
};

// ✅ Get all customers
const getAllCustomers = async (req, res) => {
  try {
    let {
      page = 1,
      limit = 10,
      search = "",
      customerStatus,
      productName,
    } = req.query;

    page = parseInt(page);
    limit = parseInt(limit);

    // ---- Build filter ----
    const filter = {};

    if (customerStatus) filter.customerStatus = customerStatus;
    console.log("customerStatus", customerStatus);

    if (search) {
      const regex = new RegExp(search, "i");
      if (!isNaN(search)) {
        filter.$or = [{ name: regex }, { phoneNumber: Number(search) }];
      } else {
        filter.$or = [{ name: regex }];
      }
    }

    // ---- Query DB ----
    const [totalCustomers, customers] = await Promise.all([
      Customer.countDocuments(filter),
      Customer.find(filter)
        .populate({
          path: "products.product",
          select: "productName price size",
          match: productName
            ? { productName: { $regex: productName, $options: "i" } }
            : {},
        })
        .populate("deliveryBoy", "name phoneNumber email")
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
    ]);

    // ✅ Filter customers with valid products
    const filteredCustomers = customers.filter((customer) =>
      customer.products.some((p) => p.product !== null)
    );

    // ✅ Only Required Fields
    const formattedCustomers = filteredCustomers.map((c) => {
      const firstProduct = c.products[0]?.product;
      return {
        _id: c._id,
        customerStatus: c.customerStatus,
        image: c.image,
        customerName: c.name,
        phoneNumber: c.phoneNumber,
        productName: firstProduct ? firstProduct.productName : "",
        size: firstProduct ? firstProduct.size : "",
        subscriptionPlan: c.products[0]?.subscriptionPlan || "",
        deliveryDays: c.products[0]?.deliveryDays || "",
      };
    });

    // ---- Pagination meta ----
    const totalPages = Math.ceil(totalCustomers / limit);
    const hasPrevious = page > 1;
    const hasNext = page < totalPages;

    return res.status(200).json({
      success: true,
      message: "All Customers fetched successfully",
      totalCustomers,
      totalPages,
      currentPage: page,
      previous: hasPrevious,
      next: hasNext,
      customers: formattedCustomers,
    });
  } catch (error) {
    console.error("getAllCustomers Error:", error);
    return res.status(500).json({
      success: false,
      message: "Error fetching customers",
      error: error.message,
    });
  }
};

//✅ Get single customer by ID
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

// ✅ Update customer
const updateCustomer = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      name,
      phoneNumber,
      subscriptionPlan,
      address,
      productName,
      productSize,
      quantity,
    } = req.body;

    // Validate customer ID
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid customer ID",
      });
    }

    // Find the customer
    const customer = await Customer.findById(id);
    if (!customer) {
      return res.status(404).json({
        success: false,
        message: "Customer not found",
      });
    }

    // If updating phone number, check for duplicates
    if (phoneNumber) {
      const existingCustomer = await Customer.findOne({
        phoneNumber: phoneNumber,
        _id: { $ne: id },
      });

      if (existingCustomer) {
        return res.status(400).json({
          success: false,
          message: "Phone number already exists",
        });
      }
    }

    // Validate subscription plan if provided
    if (
      subscriptionPlan &&
      !["Monthly", "Daily", "Alternate Days"].includes(subscriptionPlan)
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Invalid subscription plan. Must be Monthly, Daily, or Alternate Days",
      });
    }

    // Prepare updates for customer fields
    const customerUpdates = {};
    if (name) customerUpdates.name = name;
    if (phoneNumber) customerUpdates.phoneNumber = phoneNumber;
    if (subscriptionPlan) customerUpdates.subscriptionPlan = subscriptionPlan;
    if (address) customerUpdates.address = address;

    // Handle product updates if productName is provided
    if (productName) {
      // Find the product by name
      const product = await Product.findOne({ productName });
      if (!product) {
        return res.status(404).json({
          success: false,
          message: "Product not found",
        });
      }

      // Find the product in customer's products array
      const productIndex = customer.products.findIndex(
        (p) => p.product.toString() === product._id.toString()
      );

      if (productIndex === -1) {
        return res.status(404).json({
          success: false,
          message: "Product not found in customer's products",
        });
      }

      // Update the specific product in the products array
      const productUpdates = {};
      if (productSize) {
        // Validate product size exists in product's size array
        if (!product.size.includes(productSize)) {
          return res.status(400).json({
            success: false,
            message: `Invalid product size. Available sizes: ${product.size.join(
              ", "
            )}`,
          });
        }
        productUpdates[`products.${productIndex}.productSize`] = productSize;
      }
      if (quantity) {
        if (quantity < 1) {
          return res.status(400).json({
            success: false,
            message: "Quantity must be at least 1",
          });
        }
        productUpdates[`products.${productIndex}.quantity`] = quantity;
      }

      // Apply product updates
      if (Object.keys(productUpdates).length > 0) {
        await Customer.findByIdAndUpdate(id, { $set: productUpdates });
      }
    }

    // Apply customer field updates
    if (Object.keys(customerUpdates).length > 0) {
      await Customer.findByIdAndUpdate(id, customerUpdates);
    }

    // Fetch updated customer with populated data
    const updatedCustomer = await Customer.findById(id)
      .populate("products.product", "productName price size")
      .populate("deliveryBoy", "name phoneNumber email");

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

// ✅Delete customer
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

// ✅ Make Absent Days
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

//✅ Create Custom Order
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

//✅ DropDown Api For deliveryDays
const getDeliveryDays = async (req, res) => {
  try {
    const deliveryDays = await Customer.schema.path("products.0.deliveryDays")
      .enumValues;
    return res.status(200).json({
      success: true,
      message: "Delivery days fetched successfully",
      deliveryDays,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Error fetching delivery days",
      error: error.message,
    });
  }
};

//✅ DropDown Api for subscriptionPlan
const getSubscriptionPlan = async (req, res) => {
  try {
    const subscriptionPlan = await Customer.schema.path(
      "products.0.subscriptionPlan"
    ).enumValues;
    return res.status(200).json({
      success: true,
      message: "Subscription plan fetched successfully",
      subscriptionPlan,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Error fetching subscription plan",
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
  getDeliveryDays,
  getSubscriptionPlan,
};
