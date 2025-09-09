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
  formatDateToDDMMYYYY,
  parseDDMMYYYYtoDate,
} = require("../utils/parsedDateAndDay");

// Helper function to calculate end date for alternate days subscription
const calculateAlternateDaysEndDate = (startDate) => {
  const start = new Date(startDate);
  const year = start.getFullYear();
  const month = start.getMonth();

  const lastDayOfMonth = new Date(year, month + 1, 0).getDate();

  const deliveryDates = [];

  for (let day = start.getDate(); day <= lastDayOfMonth; day += 2) {
    deliveryDates.push(day);
  }

  const lastDeliveryDate = deliveryDates[deliveryDates.length - 1];

  return lastDeliveryDate;
};

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
      subscriptionStatus,
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
      !subscriptionPlan ||
      !subscriptionStatus
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
    const validPaymentMethods = ["COD", "Online"];

    if (paymentMethod && !validPaymentMethods.includes(paymentMethod)) {
      return res.status(400).json({
        success: false,
        message: `Invalid payment method "${paymentMethod}". Please select from dropdown.`,
        availablePaymentMethod: validPaymentMethods,
      });
    }

    const validSubscriptionStatus = ["active", "inactive"];

    if (subscriptionStatus && !validSubscriptionStatus.includes(subscriptionStatus)) {
      return res.status(400).json({
        success: false,
        message: `Invalid subscription status "${subscriptionStatus}". Please select from dropdown.`,
        availableSubscriptionStatus: validSubscriptionStatus,
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
      // For Monthly and Alternate Days: start = provided date or today
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      finalStartDate = startDate || formatDateToDDMMYYYY(today);

      if (subscriptionPlan === "Alternate Days") {
        const parsedStartDate = parseDDMMYYYYtoDate(finalStartDate);
        const lastDeliveryDay = calculateAlternateDaysEndDate(parsedStartDate);

        // Create end date with the last delivery day
        const endDate = new Date(
          parsedStartDate.getFullYear(),
          parsedStartDate.getMonth(),
          lastDeliveryDay
        );
        finalEndDate = formatDateToDDMMYYYY(endDate);
      } else {
        // For Monthly: end = month end
        const parsedStartDate = parseDDMMYYYYtoDate(finalStartDate);
        const monthEndDate = new Date(
          parsedStartDate.getFullYear(),
          parsedStartDate.getMonth() + 1,
          0
        );
        finalEndDate = formatDateToDDMMYYYY(monthEndDate);
      }
    }

    // 🔹 Customer create
    const customer = new Customer({
      name,
      phoneNumber,
      address,
      subscriptionPlan,
      subscriptionStatus,
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
      subscriptionPlan,
      subscriptionStatus,
      customDeliveryDates,
    } = req?.body;

    const image = req?.file;

    const customer = await Customer.findById(id);

    if (!customer) {
      return res.status(404).json({
        success: false,
        message: "Customer not found",
      });
    }

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

    if (
      subscriptionPlan &&
      !["Monthly", "Custom Date", "Alternate Days"].includes(subscriptionPlan)
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Invalid subscription plan. Must be Monthly, Custom Date, or Alternate Days",
      });
    }

    if (
      subscriptionStatus &&
      !["active", "inactive"].includes(subscriptionStatus)
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Invalid subscription status. Must be active or inactive",
      });
    }

    const customerUpdates = {};

    if (name) customerUpdates.name = name;
    if (phoneNumber) customerUpdates.phoneNumber = phoneNumber;
    if (address) customerUpdates.address = address;

    if (subscriptionPlan) {
      customerUpdates.subscriptionPlan = subscriptionPlan;

      if (
        subscriptionPlan === "Monthly" ||
        subscriptionPlan === "Alternate Days"
      ) {
        customerUpdates.customDeliveryDates = [];

        if (subscriptionPlan === "Alternate Days") {
          const startDate =
            customer.startDate || formatDateToDDMMYYYY(new Date());
          const parsedStartDate = parseDDMMYYYYtoDate(startDate);
          const lastDeliveryDay =
            calculateAlternateDaysEndDate(parsedStartDate);

          const endDate = new Date(
            parsedStartDate.getFullYear(),
            parsedStartDate.getMonth(),
            lastDeliveryDay
          );
          customerUpdates.endDate = formatDateToDDMMYYYY(endDate);
        } else if (subscriptionPlan === "Monthly") {
          const startDate =
            customer.startDate || formatDateToDDMMYYYY(new Date());
          const parsedStartDate = parseDDMMYYYYtoDate(startDate);
          const monthEndDate = new Date(
            parsedStartDate.getFullYear(),
            parsedStartDate.getMonth() + 1,
            0
          );
          customerUpdates.endDate = formatDateToDDMMYYYY(monthEndDate);
        }
      }
    }
    if (subscriptionStatus) {
      customerUpdates.subscriptionStatus = subscriptionStatus;
    }

    if (customDeliveryDates && Array.isArray(customDeliveryDates)) {
      if (subscriptionPlan === "Custom Date") {
        const existingDates = customer.customDeliveryDates || [];

        const mergedDates = [
          ...new Set([...existingDates, ...customDeliveryDates]),
        ];
        customerUpdates.endDate = mergedDates[mergedDates.length - 1];
        customerUpdates.customDeliveryDates = mergedDates;
      }
    }

    if (image) customerUpdates.image = image?.path;

    const updatedCustomer = await Customer.findByIdAndUpdate(
      id,
      customerUpdates,
      { new: true, runValidators: true }
    );

    if (!updatedCustomer) {
      return res.status(404).json({
        success: false,
        message: "Customer not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Customer updated successfully",
      updatedCustomer: updatedCustomer,
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
    const subscriptionPlan = await Customer.schema.path("subscriptionPlan")
      .enumValues;
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

//✅DropDown Api For Subscription Status
const getSubscriptionStatus = async(req, res) =>{
  try {
    const subscriptionStatus = await Customer.schema.path("subscriptionStatus")
      .enumValues;
    res.status(200).json({
      success: true,
      message: "All Subscription Status fetched successfully",
      subscriptionStatus,
    });
  } catch (error) {
    console.log(error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch subscription status",
    });
  }
}

// ✅Add product To customer subscription
const addProductToCustomer = async (req, res) => {
  try {
    const { customerId } = req.params;
    const { productName, price, productSize, quantity } = req.body;

    const customer = await Customer.findById(customerId);

    if (!customer) {
      return res.status(404).json({
        success: false,
        message: "Customer not found",
      });
    }

    if (!productName || !price || !productSize || !quantity) {
      return res.status(400).json({
        success: false,
        message:
          "productName, price, productSize, quantity, and totalPrice are required",
      });
    }

    const product = await Product.findOne({ productName });

    if (!product) {
      const allProducts = await Product.find({}, "productName");
      return res.status(404).json({
        success: false,
        message: `Product "${productName}" not found. Please select from available products.`,
        availableProducts: allProducts.map((p) => p.productName),
      });
    }

    const existingProduct = customer.products.find(
      (p) => p.product.toString() === product._id.toString()
    );

    if (existingProduct) {
      return res.status(400).json({
        success: false,
        message: "Product already exists in customer's subscription",
      });
    }

    if (!product.size.includes(productSize)) {
      return res.status(400).json({
        success: false,
        message: `Invalid product size "${productSize}" for "${productName}". Please select from available sizes.`,
        availableSizes: product.size,
      });
    }

    const totalPrice = quantity * price;

    const newProduct = {
      product: product._id,
      price: price,
      productSize: productSize,
      quantity: quantity,
      totalPrice: totalPrice,
    };

    customer.products.push(newProduct);

    await customer.save();

    const updatedCustomer = await Customer.findById(id);

    return res.status(200).json({
      success: true,
      message: "New Product added successfully to customer subscription",
      addedNewProduct: updatedCustomer,
    });
  } catch (error) {
    console.error("Error adding product to customer subscription:", error);
    return res.status(500).json({
      success: false,
      message: "Error adding product to customer subscription",
      error: error.message,
    });
  }
};

// ✅ Remove product from customer subscription
const removeProductFromCustomer = async (req, res) => {
  try {
    const { customerId } = req.params;
    const { productName } = req.body;

    const customer = await Customer.findById(customerId);

    if (!customer) {
      return res.status(404).json({
        success: false,
        message: "Customer not found",
      });
    }

    const product = await Product.findOne({ productName });

    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }

    const productIndex = customer.products.findIndex(
      (p) => p.product.toString() === product._id.toString()
    );

    if (productIndex === -1) {
      return res.status(404).json({
        success: false,
        message: "Product not found for this customer subscription",
      });
    }

    customer.products.splice(productIndex, 1);

    await customer.save();

    const updatedCustomer = await Customer.findById(id);

    return res.status(200).json({
      success: true,
      message: "Product removed from customer subscription successfully",
      removedProduct: updatedCustomer,
    });
  } catch (error) {
    console.error("Error removing product from customer subscription:", error);
    return res.status(500).json({
      success: false,
      message: "Error removing product from customer subscription",
      error: error.message,
    });
  }
};

// ✅Update existing product of customer
const updateCustomerProduct = async (req, res) => {
  try {
    const { customerId } = req.params;
    const { quantity, price, productName, productSize } = req.body;

    if (!customerId) {
      return res.status(400).json({
        success: false,
        message: "Customer ID is required",
      });
    }

    const customer = await Customer.findById(customerId);

    if (!customer) {
      return res.status(404).json({
        success: false,
        message: "Customer not found",
      });
    }

    let product = null;
    let productIndex = -1;

    if (productName) {
      product = await Product.findOne({ productName });

      if (!product) {
        const allProducts = await Product.find({}, "productName");
        return res.status(404).json({
          success: false,
          message: `Product "${productName}" not found. Please select from available products.`,
          availableProducts: allProducts.map((p) => p.productName),
        });
      }

      // Find the product in customer's products array
      productIndex = customer.products.findIndex(
        (p) => p.product.toString() === product._id.toString()
      );

      if (productIndex === -1) {
        return res.status(404).json({
          success: false,
          message: "Product not found in customer's products",
        });
      }
    } else {
      return res.status(400).json({
        success: false,
        message: "productName is required to identify which product to update",
      });
    }

    if (productSize && !product.size.includes(productSize)) {
      return res.status(400).json({
        success: false,
        message: `Invalid product size "${productSize}" for "${productName}". Please select from available sizes.`,
        availableSizes: product.size,
      });
    }

    const currentProduct = customer.products[productIndex];

    if (quantity) currentProduct.quantity = quantity;
    if (price) currentProduct.price = price;
    if (productSize) currentProduct.productSize = productSize;
    if (product) currentProduct.product = product._id;

    // Recalculate totalPrice if quantity or price changed
    if (quantity || price) {
      const newQuantity = quantity || currentProduct.quantity;
      const newPrice = price || currentProduct.price;
      currentProduct.totalPrice = newQuantity * parseFloat(newPrice);
    }

    await customer.save();

    return res.status(200).json({
      success: true,
      message: "Customer product updated successfully",
      updatedProduct: customer,
    });
  } catch (error) {
    console.error("Error updating customer product:", error);
    return res.status(500).json({
      success: false,
      message: "Error updating customer product",
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
  getSubscriptionStatus,
  addProductToCustomer,
  removeProductFromCustomer,
  updateCustomerProduct,
};
