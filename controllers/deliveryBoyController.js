const DeliveryBoy = require("../models/deliveryBoyModel");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const Customer = require("../models/coustomerModel");
const CustomerCustomOrder = require("../models/customerCustomOrder");
const {
  formatOrderResponse,
  shouldDeliverOnDate,
} = require("../utils/dateUtils");

// Generate JWT
const generateToken = (id) => {
  return jwt.sign({ id }, process.env.ACCESS_TOKEN_SECRET, {
    expiresIn: process.env.ACCESS_TOKEN_EXPIRY || "7d",
  });
};

// 📌 Register Delivery Boy
const registerDeliveryBoy = async (req, res) => {
  try {
    const { name, email, phoneNumber, area, password } = req.body;
    const profileImage = req.file.path;

    const existing = await DeliveryBoy.findOne({ email });
    if (existing) {
      return res
        .status(400)
        .json({ success: false, message: "Email already exists" });
    }

    const deliveryBoy = await DeliveryBoy.create({
      name,
      email,
      phoneNumber,
      area,
      password,
      profileImage,
    });

    res.status(201).json({
      success: true,
      message: "Delivery boy registered successfully",
      deliveryBoy,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// 📌 Login Delivery Boy
const loginDeliveryBoy = async (req, res) => {
  try {
    const { email, password } = req.body;

    const deliveryBoy = await DeliveryBoy.findOne({ email }).select(
      "+password"
    );
    if (!deliveryBoy) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid email or password" });
    }

    const isMatch = await deliveryBoy.comparePassword(password);
    if (!isMatch) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid email or password" });
    }

    const token = generateToken(deliveryBoy._id);

    res.status(200).json({
      success: true,
      token,
      deliveryBoy,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};


// ✅ Get all delivery boys 
const getAllDeliveryBoys = async (req, res) => {
  try {
    let { page = 1, limit = 10, search = "", sortField = "", sortOrder = "desc" } = req.query;
    page = parseInt(page);
    limit = parseInt(limit);

    // Build filter object
    const filter = {isDeleted: false};
    if (search) {
      if (!isNaN(search)) {
        // 🔹 search is numeric, match exact phone number
        filter.$or = [
          { name: { $regex: search, $options: "i" } },
          { phoneNumber: Number(search) },  // ✅ exact match for number
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
const getDeliveryBoyById = async(req, res) =>{
  try {
    const {id} = req.params
    const deliveryBoy = await DeliveryBoy.findById(id)

    if(!deliveryBoy){
      return res.status(404).json({success: false, message: "Delivery boy not found"})
    }
    
    return res.status(200).json({
      success: true, 
      message: "Delivery Boy By Id Fetch Successfully",
      deliveryBoy
    })
    
  } catch (error) {
    console.log(error)
    return res.status(500).json({success: false, message: error.message})
  }
}

// ✅ Get Single Delivery Boy
const getDeliveryBoyProfile = async (req, res) => {
  try {
      const deliveryBoy = req.deliveryBoy._id
      if(!deliveryBoy){
        return res.status(404).json({success: false, message: "Delivery boy not found"})
      }
      const deliveryBoyProfile = await DeliveryBoy.findById(deliveryBoy).select("-password")
      if(!deliveryBoyProfile){
        return res.status(404).json({success: false, message: "Delivery boy not found"})
      }
      return res.status(200).json({
        success: true, 
        message: "Delivery Boy Profile Fetch Successfully",
        deliveryBoyProfile
      })
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// 📌 Update Delivery Boy
const updateDeliveryBoy = async (req, res) => {
  try {
      const deliveryBoy = req.deliveryBoy._id
      if(!deliveryBoy){
        return res.status(404).json({success: false, message: "Delivery boy not found"})
      }
      const{name, email, phoneNumber, area, password} = req.body
      const profileImage = req?.file?.path

      const updateData={}

      if(name) updateData.name = name
      if(email) updateData.email = email
      if(phoneNumber) updateData.phoneNumber = phoneNumber
      if(area) updateData.area = area
      if(password) updateData.password = password
      if(profileImage) updateData.profileImage = profileImage

      const updatedDeliveryBoy = await DeliveryBoy.findByIdAndUpdate(deliveryBoy, updateData, { new: true,runValidators:true  })

      return res.status(200).json({ success: true, message: "Delivery Boy Updated successfully", updatedDeliveryBoy });
  } catch (error) {
   return  res.status(500).json({ success: false, message: error.message });
  }
};

// 📌 Delete Delivery Boy
const deleteDeliveryBoy = async (req, res) => {
  try {
    const{id} = req.params
    const deliveryBoy = await DeliveryBoy.findByIdAndUpdate(id, { isDeleted: true });
    if (!deliveryBoy) {
      return res
        .status(404)
        .json({ success: false, message: "Delivery boy not found" });
    }
   return res.status(200).json({ success: true, message: "Delivery Boy Deleted successfully" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const getOrders = async (req, res) => {
  try {
    const {
      customerId,
      deliveryBoyId,
      date,
      fromDate,
      toDate,
      productId,
      status,
      page = 1,
      limit = 10,
    } = req.query;

    // Build filter object
    const filter = {};
    const customerFilter = {};
    const customOrderFilter = {};

    // Customer filter
    if (customerId) {
      if (!mongoose.Types.ObjectId.isValid(customerId)) {
        return res.status(400).json({
          success: false,
          message: "Invalid customer ID format",
        });
      }
      filter.customer = new mongoose.Types.ObjectId(customerId);
      customerFilter._id = new mongoose.Types.ObjectId(customerId);
    }

    // Delivery boy filter
    if (deliveryBoyId) {
      if (!mongoose.Types.ObjectId.isValid(deliveryBoyId)) {
        return res.status(400).json({
          success: false,
          message: "Invalid delivery boy ID format",
        });
      }
      filter.deliveryBoy = new mongoose.Types.ObjectId(deliveryBoyId);
      customerFilter.deliveryBoy = new mongoose.Types.ObjectId(deliveryBoyId);
      customOrderFilter.deliveryBoy = new mongoose.Types.ObjectId(
        deliveryBoyId
      );
    }

    // Date filtering
    let dateFilter = {};
    if (date) {
      // Single date filter
      const targetDate = new Date(date);
      if (isNaN(targetDate.getTime())) {
        return res.status(400).json({
          success: false,
          message: "Invalid date format. Use ISO format (YYYY-MM-DD)",
        });
      }
      const startOfDay = new Date(targetDate);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(targetDate);
      endOfDay.setHours(23, 59, 59, 999);

      dateFilter = {
        $gte: startOfDay,
        $lt: endOfDay,
      };
    } else if (fromDate || toDate) {
      // Date range filter
      dateFilter = {};
      if (fromDate) {
        const from = new Date(fromDate);
        if (isNaN(from.getTime())) {
          return res.status(400).json({
            success: false,
            message: "Invalid fromDate format. Use ISO format (YYYY-MM-DD)",
          });
        }
        from.setHours(0, 0, 0, 0);
        dateFilter.$gte = from;
      }
      if (toDate) {
        const to = new Date(toDate);
        if (isNaN(to.getTime())) {
          return res.status(400).json({
            success: false,
            message: "Invalid toDate format. Use ISO format (YYYY-MM-DD)",
          });
        }
        to.setHours(23, 59, 59, 999);
        dateFilter.$lte = to;
      }
    }

    // Product filter
    if (productId) {
      if (!mongoose.Types.ObjectId.isValid(productId)) {
        return res.status(400).json({
          success: false,
          message: "Invalid product ID format",
        });
      }
      filter["products.product"] = new mongoose.Types.ObjectId(productId);
      customOrderFilter.product = new mongoose.Types.ObjectId(productId);
    }

    // Status filter (for custom orders)
    if (status) {
      customOrderFilter.status = status;
    }

    // Pagination
    const pageNumber = parseInt(page);
    const pageSize = parseInt(limit);
    const skip = (pageNumber - 1) * pageSize;

    // Set target date for delivery calculation (use today if no date specified)
    let targetDateForDelivery = new Date();
    if (date) {
      targetDateForDelivery = new Date(date);
    }
    targetDateForDelivery.setHours(0, 0, 0, 0);

    // Find customers with filters
    const customers = await Customer.find(customerFilter)
      .populate("products.product")
      .populate({
        path: "deliveryBoy",
        select: "name phoneNumber email",
      })
      .skip(skip)
      .limit(pageSize);

    // Find custom orders with filters
    const customOrders = await CustomerCustomOrder.find({
      ...customOrderFilter,
      ...(Object.keys(dateFilter).length > 0 && { date: dateFilter }),
    })
      .populate("customer", "name phoneNumber address userProfile gender")
      .populate("product")
      .populate({
        path: "deliveryBoy",
        select: "name phoneNumber email",
      })
      .skip(skip)
      .limit(pageSize);

    // Get total counts for pagination
    const totalCustomers = await Customer.countDocuments(customerFilter);
    const totalCustomOrders = await CustomerCustomOrder.countDocuments({
      ...customOrderFilter,
      ...(Object.keys(dateFilter).length > 0 && { date: dateFilter }),
    });

    // Format orders
    const formattedOrders = await formatOrderResponse(
      customers,
      customOrders,
      targetDateForDelivery,
      deliveryBoyId
    );

    // Prepare response
    const response = {
      success: true,
      message: `Orders${
        date ? ` for ${targetDateForDelivery.toDateString()}` : ""
      }`,
      data: {
        date: targetDateForDelivery,
        filters: {
          customerId,
          deliveryBoyId,
          date,
          fromDate,
          toDate,
          productId,
          status,
        },
        pagination: {
          currentPage: pageNumber,
          totalPages: Math.ceil(
            (totalCustomers + totalCustomOrders) / pageSize
          ),
          totalItems: totalCustomers + totalCustomOrders,
          pageSize,
          hasNext:
            pageNumber <
            Math.ceil((totalCustomers + totalCustomOrders) / pageSize),
          hasPrev: pageNumber > 1,
        },
        summary: {
          totalOrders: formattedOrders.customers.reduce(
            (total, customer) => total + customer.orders.length,
            0
          ),
          totalCustomers: formattedOrders.customers.length,
          totalBottles: formattedOrders.totalBottlesRequired,
          subscriptionOrders: formattedOrders.customers.reduce(
            (total, customer) =>
              total +
              customer.orders.filter(
                (order) => order.orderType === "subscription"
              ).length,
            0
          ),
          customOrders: formattedOrders.customers.reduce(
            (total, customer) =>
              total +
              customer.orders.filter((order) => order.orderType === "custom")
                .length,
            0
          ),
        },
        customers: formattedOrders.customers,
        bottleSummary: formattedOrders.bottleSummary,
      },
    };

    res.status(200).json(response);
  } catch (error) {
    console.error("Error fetching orders:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

// Get orders for a date range
const getOrdersByDateRange = async (req, res) => {
  try {
    const { deliveryBoyId } = req.params;
    const { startDate, endDate } = req.query;

    if (!mongoose.Types.ObjectId.isValid(deliveryBoyId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid delivery boy ID format",
      });
    }

    // Validate date range
    const start = new Date(startDate);
    const end = new Date(endDate);

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return res.status(400).json({
        success: false,
        message: "Invalid date range format. Use ISO format (YYYY-MM-DD)",
      });
    }

    if (start > end) {
      return res.status(400).json({
        success: false,
        message: "Start date cannot be after end date",
      });
    }

    // Find customers with products assigned to this delivery boy
    const customers = await Customer.find({
      deliveryBoy: new mongoose.Types.ObjectId(deliveryBoyId),
    })
      .populate("products.product")
      .populate({
        path: "deliveryBoy",
        select: "name phoneNumber email", // only fetch these fields
      });

    const allOrders = [];
    const currentDate = new Date(start);

    // Check each day in the date range
    while (currentDate <= end) {
      const dateOrders = formatOrderResponse(
        customers,
        new Date(currentDate),
        deliveryBoyId
      );

      if (dateOrders.length > 0) {
        allOrders.push({
          date: new Date(currentDate),
          orders: dateOrders,
          totalOrders: dateOrders.length,
        });
      }

      currentDate.setDate(currentDate.getDate() + 1);
    }

    res.status(200).json({
      success: true,
      message: `Orders from ${start.toDateString()} to ${end.toDateString()}`,
      data: {
        startDate: start,
        endDate: end,
        totalDays: allOrders.length,
        ordersByDate: allOrders,
      },
    });
  } catch (error) {
    console.error("Error fetching orders by date range:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch orders by date range",
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
  getOrders,
  getOrdersByDateRange,
  getDeliveryBoyById,
  // getOrderStatistics,
};