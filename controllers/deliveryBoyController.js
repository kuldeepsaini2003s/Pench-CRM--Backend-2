const DeliveryBoy = require("../models/deliveryBoyModel");
const mongoose = require("mongoose");
const CustomerOrders = require("../models/customerOrderModel");
const { formatDateToDDMMYYYY } = require("../utils/parsedDateAndDay");
const Customer = require("../models/customerModel");
const FRONTEND_BASE =
  process.env.FRONTEND_BASE_URL || "https://pench-delivery-boy-app.netlify.app";
const tokenExpiry = parseInt(process.env.TOKEN_TTL_MIN) || 15; // token expiry in minutes

// ✅ Register Delivery Boy
const registerDeliveryBoy = async (req, res) => {
  try {
    const { name, email, phoneNumber, area, password, address } = req.body;
    const profileImage = req?.file;

    if (!name || !email || !phoneNumber || !area || !password || !address) {
      return res.status(400).json({
        success: false,
        message: "All fields are required",
      });
    }

    const existing = await DeliveryBoy.findOne({ email });

    const existingPhoneNumber = await DeliveryBoy.findOne({ phoneNumber });

    if (existing) {
      return res
        .status(400)
        .json({ success: false, message: "Email already exists" });
    }

    if (existingPhoneNumber) {
      return res
        .status(400)
        .json({ success: false, message: "PhoneNumber already exists" });
    }

    const deliveryBoy = await DeliveryBoy.create({
      name,
      email,
      phoneNumber,
      area,
      password,
      profileImage,
      address,
    });

    return res.status(201).json({
      success: true,
      message: "Delivery boy registered successfully",
      deliveryBoy,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ✅ Login Delivery Boy
const loginDeliveryBoy = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "All fields are required",
      });
    }
    // Fetch password explicitly (since select:false is set for password)
    const deliveryBoy = await DeliveryBoy.findOne({ email }).select(
      "+password"
    );

    if (!deliveryBoy) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid email or password" });
    }

    // Compare entered password with hashed password
    const isMatch = await deliveryBoy.comparePassword(password);

    if (!isMatch) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid email or password" });
    }

    // Generate JWT token
    const token = await deliveryBoy.generateToken();

    return res.status(200).json({
      success: true,
      message: "Delivery boy logged in successfully",
      token,
      deliveryBoy: {
        _id: deliveryBoy._id,
        name: deliveryBoy.name,
        email: deliveryBoy.email,
        password: deliveryBoy.password,
        phoneNumber: deliveryBoy.phoneNumber,
        area: deliveryBoy.area,
        profileImage: deliveryBoy.profileImage,
        shareToken: deliveryBoy.shareToken,
      },
    });
  } catch (error) {
    console.error("Login error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ✅ Get all delivery boys
const getAllDeliveryBoys = async (req, res) => {
  try {
    let {
      page = 1,
      limit = 10,
      search = "",
      sortField = "",
      sortOrder = "desc",
    } = req.query;
    page = parseInt(page);
    limit = parseInt(limit);

    // Build filter object
    const filter = { isDeleted: false };
    if (search) {
      if (!isNaN(search)) {
        // 🔹 search is numeric, match exact phone number
        filter.$or = [
          { name: { $regex: search, $options: "i" } },
          { phoneNumber: Number(search) }, // ✅ exact match for number
          { area: { $regex: search, $options: "i" } },
        ];
      } else {
        // 🔹 search is string, apply regex only on text fields
        filter.$or = [
          { name: { $regex: search, $options: "i" } },
          { area: { $regex: search, $options: "i" } },
        ];
      }
    }

    // Sorting
    let sort = {};
    if (sortField) {
      sort[sortField] = sortOrder === "asc" ? 1 : -1;
    } else {
      sort = { createdAt: -1 };
    }

    // Fetch data with pagination
    const [totalDeliveryBoys, deliveryBoys] = await Promise.all([
      DeliveryBoy.countDocuments(filter),
      DeliveryBoy.find(filter)
        .select("-encryptedPassword -password")
        .skip((page - 1) * limit)
        .limit(limit)
        .sort(sort),
    ]);

    const totalPages = Math.ceil(totalDeliveryBoys / limit);
    const hasPrevious = page > 1;
    const hasNext = page < totalPages;

    res.status(200).json({
      success: true,
      totalDeliveryBoys,
      currentPage: page,
      totalPages,
      hasPrevious,
      hasNext,
      deliveryBoys,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ✅ Get Delivery Boy By Id
const getDeliveryBoyById = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid delivery boy ID.",
      });
    }

    // Include encryptedPassword in query
    const deliveryBoy = await DeliveryBoy.findById(id).select(
      "+encryptedPassword"
    );

    if (!deliveryBoy) {
      return res.status(404).json({
        success: false,
        message: "Delivery boy not found",
      });
    }

    const customer = await Customer.find({deliveryBoy: id})
    .populate("products.product", "productName") // only fetch productName
    .select("name phoneNumber startDate products")

    const assignedCustomers = customer.map((c) => {
      const productNames = c.products.map((p) => p.product?.productName || "");
      const productSizes = c.products.map((p) => p.productSize);

      return {
        _id: c._id,
        name: c.name,
        phoneNumber: c.phoneNumber,
        startDate: c.startDate,
        productName: productNames.join(", "), // comma separated
        productSize: productSizes.join(", "), // comma separated
      };
    });
    let plainPassword = null;
    try {
      plainPassword = deliveryBoy.getPlainPassword();
    } catch (error) {
      console.error("Error getting plain password:", error);
    }

    const deliveryBoyCredentialShareableLink = `${FRONTEND_BASE}?t=${deliveryBoy.shareToken}`;

    return res.status(200).json({
      success: true,
      message: "Delivery Boy By Id Fetch Successfully",
      data: {
        id: deliveryBoy._id,
        name: deliveryBoy.name,
        email: deliveryBoy.email,
        password: plainPassword, // ✅ Plaintext password
        phoneNumber: deliveryBoy.phoneNumber,
        area: deliveryBoy.area,
        address: deliveryBoy.address || "",
        profileImage: deliveryBoy.profileImage,
        isDeleted: deliveryBoy.isDeleted,
        createdAt: deliveryBoy.createdAt,
        updatedAt: deliveryBoy.updatedAt,
        credentialShareableLink: deliveryBoyCredentialShareableLink,
        assignedCustomers,
      },
    });
  } catch (error) {
    console.error("Error in getDeliveryBoyById:", error);
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// ✅ Get Single Delivery Boy
const getDeliveryBoyProfile = async (req, res) => {
  try {
    const deliveryBoy = req.deliveryBoy._id;
    if (!deliveryBoy) {
      return res
        .status(404)
        .json({ success: false, message: "Delivery boy not found" });
    }
    const deliveryBoyProfile = await DeliveryBoy.findById(deliveryBoy).select(
      "-password"
    );
    if (!deliveryBoyProfile) {
      return res
        .status(404)
        .json({ success: false, message: "Delivery boy not found" });
    }
    return res.status(200).json({
      success: true,
      message: "Delivery Boy Profile Fetch Successfully",
      deliveryBoyProfile,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ✅ Update Delivery Boy
const updateDeliveryBoy = async (req, res) => {
  try {
    const { id } = req.params;

    // Validate ID
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid delivery boy ID." });
    }

    const { name, email, phoneNumber, area, password, address } = req.body;
    const profileImage = req?.file?.path;

    // Email validation
    if (email) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return res.status(400).json({
          success: false,
          message: "Please provide a valid email address",
        });
      }
    }

    // Phone number validation
    if (phoneNumber) {
      const phoneRegex = /^[6-9]\d{9}$/;
      if (!phoneRegex.test(phoneNumber.toString())) {
        return res.status(400).json({
          success: false,
          message:
            "Please provide a valid 10-digit phone number starting with 6-9",
        });
      }
    }

    // Fetch existing delivery boy
    const deliveryBoy = await DeliveryBoy.findById(id).select(
      "+encryptedPassword"
    );
    if (!deliveryBoy) {
      return res
        .status(404)
        .json({ success: false, message: "Delivery boy not found" });
    }

    // Check for duplicate email (if email is being updated)
    if (email && email !== deliveryBoy.email) {
      const existingEmail = await DeliveryBoy.findOne({
        email,
        _id: { $ne: id },
      });
      if (existingEmail) {
        return res.status(400).json({
          success: false,
          message: "Email already exists",
        });
      }
    }

    // Check for duplicate phone number (if phone number is being updated)
    if (phoneNumber && phoneNumber !== deliveryBoy.phoneNumber) {
      const existingPhone = await DeliveryBoy.findOne({
        phoneNumber,
        _id: { $ne: id },
      });
      if (existingPhone) {
        return res.status(400).json({
          success: false,
          message: "Phone number already exists",
        });
      }
    }

    // Update fields if provided
    if (name) deliveryBoy.name = name;
    if (email) deliveryBoy.email = email;
    if (phoneNumber) deliveryBoy.phoneNumber = phoneNumber;
    if (area) deliveryBoy.area = area;
    if (address) deliveryBoy.address = address;
    if (profileImage) deliveryBoy.profileImage = profileImage;

    if (password) {
      deliveryBoy.password = password; // sirf plain assign karo
    }

    // Save with validation
    await deliveryBoy.save({ validateBeforeSave: true });

    return res.status(200).json({
      success: true,
      message: "Delivery Boy updated successfully",
      deliveryBoy,
    });
  } catch (error) {
    console.error("Error updating delivery boy:", error);
    return res
      .status(500)
      .json({ success: false, message: "Internal server error." });
  }
};

// ✅ Delete Delivery Boy
const deleteDeliveryBoy = async (req, res) => {
  try {
    const { id } = req.params;
    const deliveryBoy = await DeliveryBoy.findByIdAndUpdate(id, {
      isDeleted: true,
    });
    if (!deliveryBoy) {
      return res
        .status(404)
        .json({ success: false, message: "Delivery boy not found" });
    }
    return res
      .status(200)
      .json({ success: true, message: "Delivery Boy Deleted successfully" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

//✅ Get Orders By Delivery Boy
const getOrdersByDeliveryBoy = async (req, res) => {
  try {
    const deliveryBoyId = req?.deliveryBoy?._id;

    let { page = 1, limit = 10 } = req.query;
    page = parseInt(page);
    limit = parseInt(limit);

    const deliveryBoy = await DeliveryBoy.findById(deliveryBoyId);

    if (!deliveryBoy) {
      return res.status(404).json({
        success: false,
        message: "Delivery boy not found",
      });
    }

    const today = new Date();
    const todayFormatted = formatDateToDDMMYYYY(today);

    // Debug: Check what orders exist for this delivery boy
    console.log("=== DEBUG INFO ===");
    console.log("Delivery Boy ID:", deliveryBoyId);
    console.log("Today formatted:", todayFormatted);

    // Check all orders for this delivery boy
    const allOrdersForDeliveryBoy = await CustomerOrders.find({
      deliveryBoy: deliveryBoyId,
    });
    console.log(
      "Total orders for delivery boy:",
      allOrdersForDeliveryBoy.length
    );

    // Check orders for today
    const todayOrders = await CustomerOrders.find({
      deliveryBoy: deliveryBoyId,
      deliveryDate: todayFormatted,
    });
    console.log("Orders for today:", todayOrders.length);
    console.log(
      "Today orders details:",
      todayOrders.map((o) => ({
        id: o._id,
        status: o.status,
        deliveryDate: o.deliveryDate,
      }))
    );

    // Check pending orders for today
    const pendingTodayOrders = await CustomerOrders.find({
      deliveryBoy: deliveryBoyId,
      deliveryDate: todayFormatted,
      status: "Pending",
    });
    console.log("Pending orders for today:", pendingTodayOrders.length);

    const filter = {
      deliveryBoy: deliveryBoyId,
      deliveryDate: todayFormatted,
      status: "Pending",
    };

    const [totalOrders, orders] = await Promise.all([
      CustomerOrders.countDocuments(filter),
      CustomerOrders.find(filter)
        .populate("customer", "name phoneNumber address image")
        .populate("products._id", "productImage")
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
    ]);
    console.log("orders", orders);
    const transformedOrders = orders.map((order) => ({
      ...order.toObject(),
      products: order.products.map((product) => ({
        _id: product?._id?._id,
        productImage: product?.productImage,
        productName: product?.productName,
        price: product?.price,
        productSize: product?.productSize,
        quantity: product?.quantity,
        totalPrice: product?.totalPrice,
      })),
    }));
    console.log("transformedOrders", transformedOrders);

    const totalPages = Math.ceil(totalOrders / limit);
    const hasPrevious = page > 1;
    const hasNext = page < totalPages;

    return res.status(200).json({
      success: true,
      message: `Found ${transformedOrders.length} orders for today (${todayFormatted})`,
      totalOrders,
      totalPages,
      currentPage: page,
      previous: hasPrevious,
      next: hasNext,
      orders: transformedOrders,
    });
  } catch (error) {
    console.error("getOrdersByDeliveryBoy Error:", error);
    return res.status(500).json({
      success: false,
      message: "Error fetching delivery boy orders",
      error: error.message,
    });
  }
};

//✅ Share Genearted  Token
const shareConsumeToken = async (req, res) => {
  try {
    const { token } = req.query;
    if (!token) {
      return res.staus(400).json({
        success: false,
        message: "Token is required",
      });
    }
    const sharedToken = await DeliveryBoy.findOne({ shareToken: token }).select(
      "_id name email password +encryptedPassword"
    );

    if (!sharedToken) {
      return res.status(404).json({
        success: false,
        message: "Share token not found",
      });
    }

    if (new Date() > new Date(sharedToken.shareTokenExpiresAt)) {
      return res
        .status(410)
        .json({ success: false, message: "Share token expired" });
    }

    let plainPassword = null;
    let hashedPassword = null;
    try {
      plainPassword = sharedToken.getPlainPassword();
      hashedPassword = sharedToken.password;
    } catch (err) {
      console.error("Decrypt error:", err);
    }

    sharedToken.shareTokenUsed = true;
    await sharedToken.save();

    return res.status(200).json({
      success: true,
      message: "Share token consumed successfully",
      shareToken: {
        _id: sharedToken._id,
        email: sharedToken.email,
        hashedPassword: hashedPassword,
        password: plainPassword,
        deliveryBoyName: sharedToken.name,
      },
    });
  } catch (error) {
    console.log("Error in shareConsumeToken:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to consume token",
      error: error.message,
    });
  }
};

// ✅ Get DeliveryBoy Own Bootle Tracking Record
const getDeliveryBoyOwnBootleTrackingRecord = async (req, res) => {
  try {
    const deliveryBoyId = req.deliveryBoy?._id;

    if (!deliveryBoyId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    const deliveryBoy = await DeliveryBoy.findById(deliveryBoyId);
    if (!deliveryBoy) {
      return res.status(404).json({
        success: false,
        message: "Delivery boy not found",
      });
    }

    // Get all relevant orders
    const orders = await CustomerOrders.find({
      deliveryBoy: deliveryBoyId,
      status: { $in: ["Pending"] },
    });

    let totalIssued = 0,
      totalReturned = 0;
    let oneLtrIssued = 0,
      oneLtrReturned = 0;
    let halfLtrIssued = 0,
      halfLtrReturned = 0;

    for (const order of orders) {
      // issued bottles (only milk bottles)
      for (const p of order.products) {
        if (p.productName === "Milk") {
          if (p.productSize === "1ltr") {
            oneLtrIssued += p.quantity;
          } else if (p.productSize === "1/2ltr") {
            halfLtrIssued += p.quantity;
          }
          totalIssued += p.quantity;
        }
      }

      // returned bottles (count only actual entries)
      if (order.bottleReturnSize && order.bottleReturnSize.length > 0) {
        order.bottleReturnSize.forEach((size) => {
          if (size === "1ltr") oneLtrReturned += 1;
          if (size === "1/2ltr") halfLtrReturned += 1;
        });
      }
    }

    // ✅ calculate totals correctly here
    totalReturned = oneLtrReturned + halfLtrReturned;

    const response = {
      _id: deliveryBoy._id,
      deliveryBoy: deliveryBoy.name,
      total: {
        issued: totalIssued,
        returned: totalReturned,
      },
      yetToReturn: totalIssued - totalReturned,
      "1ltr": {
        issued: oneLtrIssued,
        returned: oneLtrReturned,
        yetToReturn: oneLtrIssued - oneLtrReturned,
      },
      "1/2ltr": {
        issued: halfLtrIssued,
        returned: halfLtrReturned,
        yetToReturn: halfLtrIssued - halfLtrReturned,
      },
    };

    return res.json({
      success: true,
      message: "Delivery boy own bottle tracking record fetched successfully",
      trackingRecord: response,
    });
  } catch (error) {
    console.error("getDeliveryBoyOwnBootleTrackingRecord error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to get delivery boy own bottle tracking record",
    });
  }
};

//✅ Order history
const getOrderHistory = async (req, res) => {
  try {
    const deliveryBoyId = req.deliveryBoy.id; // 👈 authorization middleware se aayega
    let { status = "All", page = 1, limit = 10 } = req.query;
    page = parseInt(page);
    limit = parseInt(limit);
    const skip = (page - 1) * limit;

    // Get today's date in dd/mm/yyyy format
    const today = new Date();
    const day = String(today.getDate()).padStart(2, "0");
    const month = String(today.getMonth() + 1).padStart(2, "0");
    const year = today.getFullYear();
    const todayDate = `${day}/${month}/${year}`;

    // Base filter
    let filter = {
      deliveryBoy: deliveryBoyId,
      deliveryDate: todayDate, // 👈 sirf aaj ki date ke orders
    };

    // Status filter
    if (status !== "All") {
      filter.status = { $regex: new RegExp(`^${status}$`, "i") };
    }

    // Get total count
    const totalOrders = await CustomerOrders.countDocuments(filter);

    // Query with populate
    const orders = await CustomerOrders.find(filter)
      .populate({
        path: "customer",
        select: "name phoneNumber image address",
      })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    // Format response
    const formattedOrders = orders.map((order) => ({
      orderId: order._id,
      orderNumber: order.orderNumber,
      status: order.status,
      paymentStatus: order.paymentStatus,
      totalAmount: order.totalAmount,
      deliveryDate: order.deliveryDate,

      customer: {
        name: order.customer?.name,
        phoneNumber: order.customer?.phoneNumber,
        image: order.customer?.image,
        address: order.customer?.address,
      },

      products: order.products.map((p) => ({
        productName: p.productName,
        productSize: p.productSize,
        productImage: p.productImage,
      })),
    }));

    const totalPages = Math.ceil(totalOrders / limit);
    const hasPrevious = page > 1;
    const hasNext = page < totalPages;

    return res.status(200).json({
      success: true,
      message: "Order history fetched successfully",
      totalOrders,
      currentPage: page,
      totalPages,
      previous: hasPrevious,
      next: hasNext,
      orders: formattedOrders,
    });
  } catch (error) {
    console.error("getOrderHistory Error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to get order history",
      error: error.message,
    });
  }
};

// Logout Delivery Boy
const logoutDeliveryBoy = async (req, res) => {
  try {
    res.clearCookie("token");
    return res.status(200).json({
      success: true,
      message: "Delivery Boy logged out successfully",
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to logout delivery boy",
    });
  }
};

//✅ Get Pending Bottles
const getPendingBottles = async (req, res) => {
  try {
    const deliveryBoyId = req.deliveryBoy?._id;
    if (!deliveryBoyId) {
      return res.status(400).json({
        success: false,
        message: "Delivery Boy ID is required",
      });
    }

    // ✅ Get all delivered orders with pending bottles
    const orders = await CustomerOrders.find({
      deliveryBoy: deliveryBoyId,
      status: "Delivered",
      $or: [
        { pendingBottleQuantity: { $gt: 0 } }, // still pending
        { "bottleReturns.0": { $exists: true } } // OR at least 1 return entry exists
      ],
    })
      .populate("customer", "_id name phoneNumber address")
      .populate("products._id", "productImage");

    if (!orders.length) {
      return res.status(404).json({
        success: false,
        message: "No pending bottles found for any customer",
      });
    }

    // ✅ Group data by customer
    const customersMap = {};

    orders.forEach((order) => {
      const cust = order.customer;
      if (!customersMap[cust._id]) {
        customersMap[cust._id] = {
          customerId: cust._id,
          name: cust.name,
          phoneNumber: cust.phoneNumber,
          address: cust.address,
          totalPendingBottleQuantity: 0,
          totalBottleReturnedQuantity: 0,
          products: [],
        };
      }

      // ✅ Collect milk products for this order
      const milkProducts = order.products.filter(
        (p) => p.productName.toLowerCase() === "milk"
      );

      if (milkProducts.length > 0) {
        const productNames = milkProducts.map((p) => p.productName).join(", ");
        const productSizes = milkProducts.map((p) => p.productSize).join(", ");
        const productQuantities = milkProducts
          .map((p) => p.quantity)
          .join(", ");

        // ✅ Total bottles returned for this order (from array)
        const totalReturnedForOrder = (order.bottleReturns || []).reduce(
          (sum, b) => sum + b.quantity,
          0
        );

        customersMap[cust._id].products.push({
          orderId: order._id,
          orderNumber: order.orderNumber,
          productName: productNames,
          productSize: productSizes,
          quantity: productQuantities,
          productImage: order.products[0]._id?.productImage || null,
          bottlePendingQuantity: order.pendingBottleQuantity || 0,
          bottleReturns: order.bottleReturns || [], // 👈 return full array
          bottlesReturned: totalReturnedForOrder,
        });

        // ✅ Update customer totals
        customersMap[cust._id].totalPendingBottleQuantity +=
          order.pendingBottleQuantity || 0;
        customersMap[cust._id].totalBottleReturnedQuantity +=
          totalReturnedForOrder;
      }
    });

    const customers = Object.values(customersMap);

    return res.status(200).json({
      success: true,
      message: "Pending bottles data fetched successfully",
      totalCustomers: customers.length,
      customers,
    });
  } catch (error) {
    console.error("getPendingBottles Error:", error);
    return res.status(500).json({
      success: false,
      message: "Error fetching pending bottles",
      error: error.message,
    });
  }
};

module.exports = {
  registerDeliveryBoy,
  loginDeliveryBoy,
  getAllDeliveryBoys,
  getDeliveryBoyProfile,
  updateDeliveryBoy,
  deleteDeliveryBoy,
  getDeliveryBoyById,
  getOrdersByDeliveryBoy,
  shareConsumeToken,
  getDeliveryBoyOwnBootleTrackingRecord,
  getOrderHistory,
  getPendingBottles,
  logoutDeliveryBoy,
};
