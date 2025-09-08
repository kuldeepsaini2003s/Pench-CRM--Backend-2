const Customer = require("../models/customerModel");
const DeliveryHistory = require("../models/deliveryHistory");
const CustomerOrders = require("../models/customerOrderModel");
const mongoose = require("mongoose");
const DeliveryBoy = require("../models/deliveryBoyModel");
const Product = require("../models/productModel");
const {
  createAutomaticOrdersForCustomer,
} = require("./customerOrderController");
const {
  shouldDeliverOnDate,
  formatDateToDDMMYYYY,
  parseDDMMYYYYtoDate,
} = require("../utils/parsedDateAndDay");

// ✅ Create Customer
const createCustomer = async (req, res) => {
  try {
    const {
      name,
      phoneNumber,
      address,
      deliveryBoyName,
      products,
      startDate,
      subscriptionPlan,
      customDeliveryDates,
      paymentMethod,
      paymentStatus,
    } = req.body;

    if (
      !name ||
      !phoneNumber ||
      !address ||
      !deliveryBoyName ||
      !products ||
      !subscriptionPlan
    ) {
      return res.status(400).json({
        success: false,
        message: "All fields are required",
      });
    }

    // DeliveryBoy validate
    const deliveryBoy = await DeliveryBoy.findOne({ name: deliveryBoyName });

    if (!deliveryBoy) {
      const allDeliveryBoys = await DeliveryBoy.find({}, "name");
      return res.status(400).json({
        success: false,
        message: "Invalid delivery boy name, please select from dropdown",
        availableDeliveryBoys: allDeliveryBoys.map((d) => d.name),
      });
    }

    // Payment Status validation
    const validPaymentStatus = ["Paid", "Partially Paid", "Unpaid"];

    if (paymentStatus && !validPaymentStatus.includes(paymentStatus)) {
      return res.status(400).json({
        success: false,
        message: `Invalid payment status "${paymentStatus}". Please select from dropdown.`,
        availablePaymentStatus: validPaymentStatus,
      });
    }

    // Payment Method validation
    const validPaymentMethods = ["Cash", "UPI"];

    if (paymentMethod && !validPaymentMethods.includes(paymentMethod)) {
      return res.status(400).json({
        success: false,
        message: `Invalid payment method "${paymentMethod}". Please select from dropdown.`,
        availablePaymentMethod: validPaymentMethods,
      });
    }

    // Validate Products
    const validatedProducts = [];

    for (let item of products) {
      const { productName, price, productSize, quantity, totalPrice } = item;

      if (!productName || !price || !productSize || !quantity || !totalPrice) {
        return res.status(400).json({
          success: false,
          message: "All product fields are required",
        });
      }

      // Product validate
      const productDoc = await Product.findOne({ productName });

      if (!productDoc) {
        const allProducts = await Product.find({}, "productName");
        return res.status(400).json({
          success: false,
          message: `Invalid product name: ${productName}. Please select from dropdown.`,
          availableProducts: allProducts.map((p) => p.productName),
        });
      }

      // productSize validate
      if (!productDoc.size.includes(productSize)) {
        return res.status(400).json({
          success: false,
          message: `Invalid size "${productSize}" for ${productName}. Please select from dropdown.`,
          availableSizes: productDoc.size,
        });
      }

      validatedProducts.push({
        product: productDoc._id,
        productSize,
        price,
        quantity,
        totalPrice,
      });
    }

    const parsedCustomDates = Array.isArray(customDeliveryDates)
      ? customDeliveryDates
      : [];

    let finalStartDate, finalEndDate;

    if (subscriptionPlan === "Custom Date") {
      // For Custom Date: start = first custom date, end = last custom date
      if (parsedCustomDates.length === 0) {
        return res.status(400).json({
          success: false,
          message:
            "Custom delivery dates are required for Custom Date subscription plan",
        });
      }
      finalStartDate = parsedCustomDates[0];
      finalEndDate = parsedCustomDates[parsedCustomDates.length - 1];
    } else {
      // For Monthly and Alternate Days: start = provided date or today, end = month end
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      finalStartDate = startDate || formatDateToDDMMYYYY(today);

      // Calculate month end date
      const parsedStartDate = parseDDMMYYYYtoDate(finalStartDate);
      const monthEndDate = new Date(
        parsedStartDate.getFullYear(),
        parsedStartDate.getMonth() + 1,
        0
      );
      finalEndDate = formatDateToDDMMYYYY(monthEndDate);
    }

    // 🔹 Customer create
    const customer = new Customer({
      name,
      phoneNumber,
      address,
      subscriptionPlan,
      customDeliveryDates: parsedCustomDates,
      startDate: finalStartDate,
      endDate: finalEndDate,
      products: validatedProducts,
      deliveryBoy: deliveryBoy._id,
      paymentMethod,
      paymentStatus,
    });

    await customer.save();

    // Create automatic orders for start date
    try {
      const orderResult = await createAutomaticOrdersForCustomer(
        customer._id,
        deliveryBoy._id
      );
    } catch (orderError) {
      console.error("Error creating automatic orders:", orderError);
    }

    res.status(201).json({
      success: true,
      message: "Customer created successfully",
      data: customer,
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
    const filter = { isDeleted: false };

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
        price: firstProduct ? firstProduct.price : "",
        subscriptionPlan: c.products[0]?.subscriptionPlan || "",
        deliveryDays: c.products[0]?.deliveryDays || "",
        isDeleted: c.isDeleted,
      };
    });
    console.log("formattedCustomers", formattedCustomers);

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
      message: "Customer By Id fetched successfully",
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
      address,
      customerStatus,
      paymentMethod,
      paymentStatus,
      deliveryBoyId,
      // Product update fields
      productName,
      productSize,
      quantity,
      price,
      subscriptionPlan,
      deliveryDays,
      startDate,
      customDeliveryDates,
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

    // Store original delivery boy for comparison
    const originalDeliveryBoy = customer.deliveryBoy;

    // Validate phone number uniqueness if updating
    if (phoneNumber && phoneNumber !== customer.phoneNumber) {
      const existingCustomer = await Customer.findOne({
        phoneNumber: phoneNumber,
        _id: { $ne: id },
      });

      if (existingCustomer) {
        return res.status(400).json({
          success: false,
          message: "Phone number already in use by another customer",
        });
      }
    }

    // Validate delivery boy if provided
    if (deliveryBoyId) {
      const deliveryBoy = await DeliveryBoy.findById(deliveryBoyId);
      if (!deliveryBoy) {
        return res.status(404).json({
          success: false,
          message: "Delivery boy not found",
        });
      }
    }

    // Validate subscription plan if provided
    if (
      subscriptionPlan &&
      !["Monthly", "One Day", "Alternate Days"].includes(subscriptionPlan)
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Invalid subscription plan. Must be Monthly, One Day, or Alternate Days",
      });
    }

    // Validate delivery days if provided
    if (
      deliveryDays &&
      ![
        "Daily",
        "Alternate Days",
        "Monday to Friday",
        "Weekends",
        "Custom Date",
      ].includes(deliveryDays)
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid delivery days",
      });
    }

    // Validate subscription plan vs delivery days
    if (subscriptionPlan && deliveryDays) {
      if (subscriptionPlan !== "Monthly" && deliveryDays) {
        return res.status(400).json({
          success: false,
          message: "deliveryDays is only allowed for Monthly subscription",
        });
      }
    }

    // Set delivery days based on subscription plan (if subscription plan is being updated)
    let finalDeliveryDays = deliveryDays;
    if (subscriptionPlan) {
      if (subscriptionPlan === "One Day") {
        finalDeliveryDays = "Daily";
      } else if (subscriptionPlan === "Alternate Days") {
        finalDeliveryDays = "Alternate Days";
      } else if (subscriptionPlan === "Monthly") {
        finalDeliveryDays = deliveryDays || "Daily"; // Default to Daily if not provided
      }
    }

    // Prepare customer field updates
    const customerUpdates = {};
    if (name) customerUpdates.name = name;
    if (phoneNumber) customerUpdates.phoneNumber = phoneNumber;
    if (address) customerUpdates.address = address;
    if (customerStatus) customerUpdates.customerStatus = customerStatus;
    if (paymentMethod) customerUpdates.paymentMethod = paymentMethod;
    if (paymentStatus) customerUpdates.paymentStatus = paymentStatus;
    if (deliveryBoyId) customerUpdates.deliveryBoy = deliveryBoyId;

    // Handle product updates if productName is provided
    let productUpdates = {};
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

      // Validate product size if provided
      if (productSize && !product.size.includes(productSize)) {
        return res.status(400).json({
          success: false,
          message: `Invalid product size. Available sizes: ${product.size.join(
            ", "
          )}`,
        });
      }

      // Build product updates
      if (productSize) {
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
      if (price) {
        productUpdates[`products.${productIndex}.price`] = price;
      }
      if (subscriptionPlan) {
        productUpdates[`products.${productIndex}.subscriptionPlan`] =
          subscriptionPlan;

        // Set delivery days based on subscription plan
        if (subscriptionPlan === "One Day") {
          productUpdates[`products.${productIndex}.deliveryDays`] = "Daily";
        } else if (subscriptionPlan === "Alternate Days") {
          productUpdates[`products.${productIndex}.deliveryDays`] =
            "Alternate Days";
        } else if (subscriptionPlan === "Monthly") {
          productUpdates[`products.${productIndex}.deliveryDays`] =
            finalDeliveryDays || "Daily";
        }
      }
      if (deliveryDays && subscriptionPlan === "Monthly") {
        productUpdates[`products.${productIndex}.deliveryDays`] = deliveryDays;
      }

      // Handle start date and calculate end date
      if (startDate || subscriptionPlan) {
        const currentProduct = customer.products[productIndex];
        const currentSubscriptionPlan =
          subscriptionPlan || currentProduct.subscriptionPlan;
        const currentDeliveryDays =
          finalDeliveryDays || currentProduct.deliveryDays;

        // Calculate start and end dates based on subscription plan
        const { startDate: calculatedStartDate, endDate: calculatedEndDate } =
          calculateSubscriptionDates(
            currentSubscriptionPlan,
            currentDeliveryDays,
            startDate
          );

        // Use provided start date or calculated start date
        const finalStartDate = startDate || calculatedStartDate;
        const finalEndDate = calculatedEndDate;

        productUpdates[`products.${productIndex}.startDate`] = finalStartDate;
        productUpdates[`products.${productIndex}.endDate`] = finalEndDate;
      }
      if (customDeliveryDates) {
        // Keep custom delivery dates in dd/mm/yyyy format
        productUpdates[`products.${productIndex}.customDeliveryDates`] =
          customDeliveryDates;
      }

      // Recalculate total price if quantity or price changed
      const currentProduct = customer.products[productIndex];
      const newQuantity = quantity || currentProduct.quantity;
      const newPrice = price || currentProduct.price;
      productUpdates[`products.${productIndex}.totalPrice`] =
        newQuantity * newPrice;
    }

    // Apply all updates
    const allUpdates = { ...customerUpdates, ...productUpdates };
    if (Object.keys(allUpdates).length > 0) {
      await Customer.findByIdAndUpdate(id, { $set: allUpdates });
    }

    // Update dependent records if delivery boy changed
    if (
      deliveryBoyId &&
      originalDeliveryBoy &&
      deliveryBoyId.toString() !== originalDeliveryBoy.toString()
    ) {
      await updateDeliveryBoyInExistingOrders(id, deliveryBoyId);
    }

    // Fetch updated customer with populated data
    const updatedCustomer = await Customer.findById(id)
      .populate("products.product", "productName price size")
      .populate("deliveryBoy", "name");

    res.status(200).json({
      success: true,
      message: "Customer updated successfully",
      data: updatedCustomer,
    });
  } catch (error) {
    console.error("Error updating customer:", error);
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

    const deletedCustomer = await Customer.findByIdAndUpdate(id, {
      isDeleted: true,
    });

    if (!deletedCustomer) {
      return res.status(404).json({
        success: false,
        message: "Customer not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Customer deleted successfully",
    });
  } catch (error) {
    return res.status(500).json({
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

        const customOrders = await CustomerOrders.find({
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

//✅ Create Additional Order
const createAdditionalOrder = async (req, res) => {
  try {
    const { customer, date, products, deliveryBoy } = req.body;

    // Validation
    if (!customer || !products || products.length === 0 || !grandTotal) {
      return res.status(400).json({
        success: false,
        message: "Customer, products, and required fields",
      });
    }

    for (let item of products) {
      const { productName, price, productSize, quantity, totalPrice } = item;
      if (!productName || !price || !productSize || !quantity || !totalPrice) {
        return res.status(400).json({
          success: false,
          message: "All product fields are required",
        });
      }

      // Product validate
      const productDoc = await Prodcut.findOne({name})
    }



    const newOrder = new CustomerOrders({
      customer,
      date,
      products,
      deliveryBoy,
    });

    const savedOrder = await newOrder.save();

    const populatedOrder = await CustomerOrders.findById(savedOrder._id)
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

//✅ DropDown Api for Payment Method
const getPaymentMethods = async (req, res) => {
  try {
    const paymentMethods = await Customer.schema.path("paymentMethod")
      .enumValues;
    res.status(200).json({
      success: true,
      message: "Payment Methods fetched successfully",
      paymentMethods,
    });
  } catch (error) {
    console.log(error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch payment methods",
    });
  }
};

//✅ DropDown Api for Payment Status
const getPaymentStatus = async (req, res) => {
  try {
    const paymentStatus = await Customer.schema.path("paymentStatus")
      .enumValues;
    res.status(200).json({
      success: true,
      message: "Payment Status fetched successfully",
      paymentStatus,
    });
  } catch (error) {
    console.log(error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch payment status",
    });
  }
};

const addProductToCustomer = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      productName,
      price,
      productSize,
      quantity,
      subscriptionPlan,
      deliveryDays,
      startDate,
      endDate,
      customDeliveryDates,
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

    // Validate required fields
    if (
      !productName ||
      !price ||
      !productSize ||
      !quantity ||
      !subscriptionPlan
    ) {
      return res.status(400).json({
        success: false,
        message:
          "productName, price, productSize, quantity, and subscriptionPlan are required",
      });
    }

    // Find the product
    const product = await Product.findOne({ productName });
    if (!product) {
      const allProducts = await Product.find({}, "productName");
      return res.status(404).json({
        success: false,
        message: `Product "${productName}" not found. Please select from available products.`,
        availableProducts: allProducts.map((p) => p.productName),
      });
    }

    // Check if product already exists in customer's subscription
    const existingProduct = customer.products.find(
      (p) => p.product.toString() === product._id.toString()
    );

    if (existingProduct) {
      return res.status(400).json({
        success: false,
        message: "Product already exists in customer's subscription",
      });
    }

    // Validate product size
    if (!product.size.includes(productSize)) {
      return res.status(400).json({
        success: false,
        message: `Invalid product size "${productSize}" for "${productName}". Please select from available sizes.`,
        availableSizes: product.size,
      });
    }

    // Validate subscription plan
    if (!["Monthly", "One Day", "Alternate Days"].includes(subscriptionPlan)) {
      return res.status(400).json({
        success: false,
        message:
          "Invalid subscription plan. Must be Monthly, Daily, or Alternate Days",
      });
    }

    // Validate delivery days
    if (
      deliveryDays &&
      ![
        "Daily",
        "Alternate Days",
        "Monday to Friday",
        "Weekends",
        "Custom Date",
      ].includes(deliveryDays)
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid delivery days",
      });
    }

    // Validate subscription plan vs delivery days
    if (subscriptionPlan !== "Monthly" && deliveryDays) {
      return res.status(400).json({
        success: false,
        message: "deliveryDays is only allowed for Monthly subscription",
      });
    }

    // Set delivery days based on subscription plan
    let finalDeliveryDays = deliveryDays;
    if (subscriptionPlan === "One Day") {
      finalDeliveryDays = "Daily";
    } else if (subscriptionPlan === "Alternate Days") {
      finalDeliveryDays = "Alternate Days";
    } else if (subscriptionPlan === "Monthly") {
      finalDeliveryDays = deliveryDays || "Daily"; // Default to Daily if not provided
    }

    // Parse dates with new logic - keep in dd/mm/yyyy format
    const finalStartDate = startDate || formatDateToDDMMYYYY(new Date()); // Let the calculation function handle default

    // Calculate start and end dates based on subscription plan
    const { startDate: calculatedStartDate, endDate: calculatedEndDate } =
      calculateSubscriptionDates(
        subscriptionPlan,
        finalDeliveryDays,
        finalStartDate
      );

    // Use provided start date or calculated start date
    const finalStartDateToUse = finalStartDate || calculatedStartDate;
    const finalEndDateToUse = endDate || calculatedEndDate;

    // Keep custom delivery dates in dd/mm/yyyy format
    const parsedCustomDates = customDeliveryDates || [];

    // Calculate total price
    const totalPrice = quantity * price;

    // Create new product object
    const newProduct = {
      product: product._id,
      price: price,
      productSize: productSize,
      quantity: quantity,
      startDate: finalStartDateToUse,
      endDate: finalEndDateToUse,
      totalPrice: totalPrice,
    };

    // Add product to customer
    customer.products.push(newProduct);
    await customer.save();

    // Check if new product should be delivered tomorrow and add to existing orders
    try {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(0, 0, 0, 0);

      // Check if the new product should be delivered tomorrow
      const shouldDeliverTomorrow = shouldDeliverOnDate(
        customer,
        newProduct,
        tomorrow
      );

      if (shouldDeliverTomorrow) {
        // Find existing orders for tomorrow for this customer
        const existingOrders = await customerOrders.find({
          customer: id,
          deliveryDate: {
            $gte: tomorrow,
            $lt: new Date(tomorrow.getTime() + 24 * 60 * 60 * 1000), // Next day
          },
          status: { $in: ["Scheduled", "Out for Delivery"] },
        });

        // Add the new product to existing orders
        for (const order of existingOrders) {
          // Check if product already exists in this order
          const productExists = order.products.some(
            (p) => p.product.toString() === product._id.toString()
          );

          if (!productExists) {
            // Add new product to the order
            order.products.push({
              product: product._id,
              deliveryQuantity: quantity,
              quantity: quantity,
              price: price,
              totalPrice: totalPrice,
            });

            // Recalculate total amount
            order.totalAmount = order.products.reduce(
              (sum, item) => sum + item.totalPrice,
              0
            );

            await order.save();
          }
        }
      }
    } catch (orderUpdateError) {
      console.error(
        "Error updating existing orders with new product:",
        orderUpdateError
      );
      // Don't fail the product addition if order update fails
    }

    // Fetch updated customer with populated data
    const updatedCustomer = await Customer.findById(id)
      .populate("products.product", "productName price size")
      .populate("deliveryBoy", "name");

    res.status(200).json({
      success: true,
      message: "Product added to customer subscription successfully",
      data: updatedCustomer,
    });
  } catch (error) {
    console.error("Error adding product to customer:", error);
    res.status(500).json({
      success: false,
      message: "Error adding product to customer",
      error: error.message,
    });
  }
};

// Remove product from customer subscription
const removeProductFromCustomer = async (req, res) => {
  try {
    const { id } = req.params;
    const { productName } = req.body;

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

    // Find the product
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
        message: "Product not found in customer's subscription",
      });
    }

    // Remove the product
    customer.products.splice(productIndex, 1);
    await customer.save();

    // Fetch updated customer with populated data
    const updatedCustomer = await Customer.findById(id)
      .populate("products.product", "productName price size description")
      .populate("deliveryBoy", "name phoneNumber email address");

    res.status(200).json({
      success: true,
      message: "Product removed from customer subscription successfully",
      data: updatedCustomer,
    });
  } catch (error) {
    console.error("Error removing product from customer:", error);
    res.status(500).json({
      success: false,
      message: "Error removing product from customer",
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
  getDeliveryDays,
  getSubscriptionPlan,
  getPaymentMethods,
  getPaymentStatus,
  addProductToCustomer,
  removeProductFromCustomer,
};
