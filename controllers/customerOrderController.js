
const CustomerOrders = require("../models/customerOrderModel");
const Customer = require("../models/customerModel")
const{ generateOrderNumber }=require("../utils/generateOrderNumber")
const mongoose = require("mongoose");

// Create automatic orders for a customer based on their subscription plan and start date
const createAutomaticOrdersForCustomer = async (customerId, deliveryBoyId) => {
  try {
    const customer = await Customer.findById(customerId).populate(
      "products.product"
    );
 
    if (!customer || !customer.products || customer.products.length === 0) {
      return { success: false, message: "No products found for customer" };
    }
 
    const deliveryDate = customer.startDate;
 
    const ordersCreated = [];
 
    let shouldDeliver = false;
 
    if (
      customer.subscriptionPlan === "Monthly" ||
      customer.subscriptionPlan === "Alternate Days"
    ) {
      shouldDeliver = true; // Always deliver on start date for these plans
    } else if (customer.subscriptionPlan === "Custom Date") {
      // For custom date, check if start date is in custom delivery dates
      shouldDeliver =
        customer.customDeliveryDates &&
        customer.customDeliveryDates.includes(deliveryDate);
    }
 
    if (shouldDeliver) {
      const orderNumber = await generateOrderNumber();
      const orderItems = [];
      let totalAmount = 0;
 
      // Create order items for all products
      for (const product of customer.products) {
        if (!product.product) continue;
 
        const itemTotalPrice = product.quantity * parseFloat(product.price);
        totalAmount += itemTotalPrice;
 
        orderItems.push({
          _id: product.product._id,
          productName: product.product.productName,
          price: product.price,
          productSize: product.productSize,
          quantity: product.quantity,
          totalPrice: itemTotalPrice,
        });
      }
 
      const order = new CustomerOrders({
        customer: customerId,
        deliveryBoy: deliveryBoyId,
        deliveryDate: deliveryDate, // Use customer's start date directly
        products: orderItems,
        orderNumber,
        totalAmount,
        status: "Scheduled",
      });
 
      await order.save();
      ordersCreated.push(order);
    }
 
    return {
      success: true,
      message: `Created ${ordersCreated.length} automatic orders for start date: ${deliveryDate}`,
      orders: ordersCreated,
    };
  } catch (error) {
    console.error("Error creating automatic orders:", error);
    return {
      success: false,
      message: "Error creating automatic orders",
      error: error.message,
    };
  }
};

const getAllOrders = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    // Build filter object
    const filter = {};
    if (req.query.status) filter.status = req.query.status;
    if (req.query.customer) filter.customer = req.query.customer;
    if (req.query.deliveryBoy) filter.deliveryBoy = req.query.deliveryBoy;

    const orders = await CustomerCustomOrder.find(filter)
   .populate("customer", "name phoneNumber address ")
        .populate("product", "productName price size")
      .populate("deliveryBoy", "name phone")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const totalOrders = await CustomerCustomOrder.countDocuments(filter);

    res.status(200).json({
      success: true,
      data: orders,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(totalOrders / limit),
        totalOrders,
        hasNext: page < Math.ceil(totalOrders / limit),
        hasPrev: page > 1,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error fetching orders",
      error: error.message,
    });
  }
};

// Get single order by ID
const getOrderById = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid order ID",
      });
    }

    const order = await CustomerCustomOrder.findById(id)
    .populate("customer", "name phoneNumber address ")
        .populate("product", "productName price size")
      .populate("deliveryBoy", "name phone")

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    res.status(200).json({
      success: true,
      data: order,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error fetching order",
      error: error.message,
    });
  }
};

// Update order
const updateOrder = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid order ID",
      });
    }

    const updatedOrder = await CustomerCustomOrder.findByIdAndUpdate(
      id,
      updates,
      { new: true, runValidators: true }
    )
     .populate("customer", "name phoneNumber address ")
        .populate("product", "productName price size")
      .populate("deliveryBoy", "name phone")

    if (!updatedOrder) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Order updated successfully",
      data: updatedOrder,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error updating order",
      error: error.message,
    });
  }
};

// Delete order
const deleteOrder = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid order ID",
      });
    }

    const deletedOrder = await CustomerCustomOrder.findByIdAndDelete(id);

    if (!deletedOrder) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Order deleted successfully",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error deleting order",
      error: error.message,
    });
  }
};

// Get orders by customer ID
const getOrdersByCustomer = async (req, res) => {
  try {
    const { customerId } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    if (!mongoose.Types.ObjectId.isValid(customerId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid customer ID",
      });
    }

    const orders = await CustomerCustomOrder.find({ customer: customerId })
   .populate("customer", "name phoneNumber address ")
        .populate("product", "productName price size")
      .populate("deliveryBoy", "name phone")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const totalOrders = await CustomerCustomOrder.countDocuments({ customer: customerId });

    res.status(200).json({
      success: true,
      data: orders,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(totalOrders / limit),
        totalOrders,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error fetching customer orders",
      error: error.message,
    });
  }
};

module.exports = {
  createAutomaticOrdersForCustomer,
  getAllOrders,
  getOrderById,
  updateOrder,
  deleteOrder,
  getOrdersByCustomer,
};

