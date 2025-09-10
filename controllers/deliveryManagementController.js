const CustomerOrder =  require("../models/customerOrderModel");

// ✅ Get All Products Delivery
const getAllProductsDelivery = async (req, res) => {
  try {
    let { page = 1, limit = 10, search = "", productName = "", size = "" } = req.query;
    page = parseInt(page);
    limit = parseInt(limit);
    const skip = (page - 1) * limit;


    const regexProduct = productName ? new RegExp(productName, "i") : null;
    const regexSize = size ? new RegExp(size, "i") : null;

    // ---- Aggregation Pipeline ----
    let pipeline = [
      {
        $lookup: {
          from: "customers",
          localField: "customer",
          foreignField: "_id",
          as: "customer",
        },
      },
      { $unwind: "$customer" },
      {
        $lookup: {
          from: "deliveryboys",
          localField: "deliveryBoy",
          foreignField: "_id",
          as: "deliveryBoy",
        },
      },
      { $unwind: "$deliveryBoy" },
    ];

    // 🔍 Search on customer/deliveryBoy
    if (search) {
      const isNumeric = !isNaN(search); // check if search is number
    
      if (isNumeric) {
        pipeline.push({
          $match: {
            $or: [
              { "customer.phoneNumber": Number(search) }, // ✅ exact number match
              { "customer.name": new RegExp(search, "i") },
              { "deliveryBoy.name": new RegExp(search, "i") },
            ],
          },
        });
      } else {
        pipeline.push({
          $match: {
            $or: [
              { "customer.name": new RegExp(search, "i") },
              { "deliveryBoy.name": new RegExp(search, "i") },
            ],
          },
        });
      }
    }

    // 🔍 Product filter
    if (regexProduct || regexSize) {
      let productMatch = {};
      if (regexProduct) productMatch["products.productName"] = regexProduct;
      if (regexSize) productMatch["products.productSize"] = regexSize;

      pipeline.push({ $match: productMatch });
    }

    // ---- Count total ----
    const totalOrdersResult = await CustomerOrder.aggregate([...pipeline, { $count: "total" }]);
    const totalOrders = totalOrdersResult[0] ? totalOrdersResult[0].total : 0;

    // ---- Pagination + Sorting ----
    pipeline.push({ $sort: { createdAt: -1 } });
    pipeline.push({ $skip: skip });
    pipeline.push({ $limit: limit });

    // ---- Fetch paginated data ----
    const orders = await CustomerOrder.aggregate(pipeline);

    if (!orders || orders.length === 0) {
      return res.status(404).json({
        success: false,
        message: "No delivery orders found",
      });
    }

    // ✅ Format Response
    const response = orders.map((order) => ({
      orderId: order._id,
      customerName: order.customer?.name || "N/A",
      phoneNumber: order.customer?.phoneNumber || "N/A",
      deliveryBoyName: order.deliveryBoy?.name || "N/A",
      deliveryDate: order.deliveryDate,
      bottlesReturned: order.bottlesReturned,
      orderStatus: order.status,
      products: order.products.map((p) => ({
        productName: p.productName,
        size: p.productSize,
      })),
    }));

    const totalPages = Math.ceil(totalOrders / limit);

    res.status(200).json({
      success: true,
      message: "All delivery orders fetched successfully",
      totalOrders,
      totalPages,
      currentPage: page,
      previous: page > 1,
      next: page < totalPages,
      orders: response,
    });
  } catch (error) {
    console.error("getAllProductsDelivery Error:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching orders",
      error: error.message,
    });
  }
};

//✅ Get ProductDelivery By Id
const getProductDeliveryById = async(req, res) =>{
  try {
    const { orderId } = req.params;
    const order = await CustomerOrder.findById(orderId)
    .populate("customer", "name phoneNumber address ")
    // .populate("product", "productName price size")
    .populate("deliveryBoy", "name phoneNumber area");
    if(!order){
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }
    // ✅ Format response
    const response = {
      customerDetails: {
        name: order.customer?.name || "-",
        phone: order.customer?.phoneNumber || "-",
        address: order.customer?.address || "-",
      },
      deliveryBoyDetails: {
        name: order.deliveryBoy?.name || "-",
        phoneNumber: order.deliveryBoy?.phoneNumber || "-",
        area: order.deliveryBoy?.area || "-",
      },
      deliveryDetails: {
        products: order.products.map((p) => ({
          productName: p.productName,
          size: p.productSize,
          quantity: p.quantity,
          price: p.price,
        })),
        totalAmount: order.totalAmount,
      },
      orderStatus: order.status,
    };

    res.status(200).json({
      success: true,
      message: "Get ProductDelivery By Id successfully",
      getProductDeliveryById: response,
    });
    
  } catch (error) {
    console.log("getProductDeliveryById Error:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching order",
      error: error.message,
    });
  }
}

//✅ Delete Order 
const deleteOrder = async(req, res) =>{
  try {
    const { orderId } = req.params;
    const order = await CustomerOrder.findByIdAndDelete(orderId);
    if(!order){
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
    console.log("deleteOrder Error:", error);
    res.status(500).json({
      success: false,
      message: "Error deleting order",
      error: error.message,
    });
  }
}

module.exports = {
  getAllProductsDelivery,
  getProductDeliveryById,
  deleteOrder
};