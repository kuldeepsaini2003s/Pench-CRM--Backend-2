const Product = require("../models/productModel");
const {
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  subDays,
  subWeeks,
  subMonths,
} = require("date-fns");
const CustomerOrder = require("../models/customerOrderModel")
const moment = require("moment");




// ✅ Create Product
const createProduct = async (req, res) => {
  try {
    const { productName, description, size, price, stock } = req.body;
    const productImage = req?.file;

    if (!productName || !description || !size || !price) {
      return res.status(400).json({
        success: false,
        message:
          "All fields (productName, description, size, price) are required",
      });
    }

    if (!productImage) {
      return res.status(400).json({
        success: false,
        message: "Product Image is required",
      });
    }

    // ✅ Normalize size into array & remove duplicates
    let normalizeSize = Array.isArray(size) ? size : [size];
    normalizeSize = [...new Set(normalizeSize.map(s => s.trim()))]; // unique values only

    // ✅ Check for duplicate product (same productName + same size)
    const duplicateProduct = await Product.findOne({
      productName,
      size: { $in: normalizeSize },
      isDeleted: false
    });

    if (duplicateProduct) {
      return res.status(400).json({
        success: false,
        message: `Product with same name and size already exists`,
      });
    }

    // ✅ Generate Sequential Product Code (PC00001, PC00002, ...)
    const lastProduct = await Product.findOne().sort({ createdAt: -1 });

    let productNumber = 1;
    if (lastProduct && lastProduct.productCode) {
      const lastCode = lastProduct.productCode.replace("PC", "");
      if (!isNaN(lastCode)) {
        productNumber = parseInt(lastCode) + 1;
      }
    }

    const productCode = `PC${String(productNumber).padStart(5, "0")}`;

    // ✅ Save product
    const product = await Product.create({
      productName,
      description,
      size: normalizeSize,
      price: Number(price),
      stock: stock || 0,
      productCode,
      productImage: productImage?.path,
    });

    return res.status(201).json({
      success: true,
      message: "Product Added successfully",
      product,
    });

  } catch (error) {
    console.error(error);
    return res.status(500).json({
      success: false,
      message: "Failed To Add Product",
      error: error.message,
    });
  }
};


// ✅ Get All Products
const getAllProducts = async (req, res) => {
  try {
    let {
      page = 1,
      limit = 10,
      sortOrder = "",
      search = "",
    } = req.query;

    page = parseInt(page);
    limit = parseInt(limit);

    // ---- Search Filter ----
    const filter={isDeleted:false}
    if (search) {
      filter.$or = [
        { productName: { $regex: search, $options: "i" } },
        { description: { $regex: search, $options: "i" } },
        { size: { $regex: search, $options: "i" } },
      ];
    }

    // ---- Sorting ----
    let sort = {};
    if (sortOrder) {
      sort[sortOrder] = sortOrder === "asc" ? 1 : -1;
    } else {
      sort = { createdAt: -1 };
    }

    // ---- Count + Paginate ----
    const [totalProducts, products] = await Promise.all([
      Product.countDocuments(filter),
      Product.find(filter)
        .sort(sort)
        .skip((page - 1) * limit)
        .limit(limit),
    ]);

    // ---- Format Response ----
    const formattedProducts = products.map((p) => ({
      id: p._id,
      productName: p.productName,
      productImage:p.productImage,
      // description: p.description,
      // productType: p.productType,
      size: p.size,
      price: p.price,
      stockAvailable: p.stock,
      productCode: p.productCode,
      isDeleted:p.isDeleted
    }));

    const totalPages = Math.ceil(totalProducts / limit);
    const hasPrevious = page > 1;
    const hasNext = page < totalPages;

    return res.status(200).json({
      success: true,
      message: "All Products Fetched Successfully",
      totalProducts,
      totalPages,
      currentPage: page,
      previous: hasPrevious,
      next: hasNext,
      products: formattedProducts,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      success: false,
      message: "Failed To Fetch Products",
      error: error.message,
    });
  }
}

// ✅ Get Product By Id
const getProductById = async (req, res) => {
  try {
    const { id } = req.params;

    const products = await Product.findById(id);
    if (!products) {
      return res.status(400).json({
        success: false,
        message: "Product Not Found",
      });
    }
    return res.status(200).json({
      success: true,
      message: "Product Found Successfully",
      products,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      success: false,
      message: "Failed To Fetch Product",
      error: error.message,
    });
  }
};

// ✅ Update Product
const updateProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const { productName, description, size, price, stock } = req.body;
    const productImage = req?.file;

    // Build update object dynamically
    const updateData = {
      ...(productName && { productName }),
      ...(description && { description }),
      ...(size && { size }),
      ...(price && { price: Number(price) }),
      ...(stock !== undefined && { stock }),
      ...(productImage && { productImage: productImage.path }),
    };

    // ⚡ Single DB call, no validation re-run
    const updatedProduct = await Product.findByIdAndUpdate(id, updateData, {
      new: true, // return updated doc
      lean: true, // ⚡ return plain JS object (faster)
    }).exec(); // ⚡ ensure query executes immediately

    if (!updatedProduct) {
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Product updated successfully",
      product: updatedProduct,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed To Update Product",
      error: error.message,
    });
  }
};

// ✅ Delete Product
const deleteProduct = async (req, res, next) => {
 
 try {
  const { id } = req.params;
  const product = await Product.findByIdAndUpdate(id, { isDeleted: true });
  if (!product){
    return res.status(404).json({
      success: false,
      message: "Product not found",
    });
  }

  res.status(200).json({
    success: true,
    message: "Product deleted successfully",
  });
 } catch (error) {
    console.log(error)
    return res.status(500).json({
      success:false,
      message:"Failed To Delete Product"
    })
 }
}

// ✅ Total Products Sold
const totalProductsSold = async (req, res) => {
  try {
    const { period } = req.query;

    // Validate period parameter
    if (!["daily", "weekly", "monthly"].includes(period)) {
      return res
        .status(400)
        .json("Invalid period. Use: daily, weekly, or monthly");
    }

    let startDate, endDate;
    const now = new Date();

    // Calculate date ranges for current period
    switch (period) {
      case "daily":
        startDate = new Date();
        startDate.setHours(0, 0, 0, 0);
        endDate = new Date();
        endDate.setHours(23, 59, 59, 999);
        break;

      case "weekly":
        startDate = startOfWeek(subWeeks(new Date(), 1), { weekStartsOn: 1 });
        endDate = endOfWeek(subWeeks(new Date(), 1), { weekStartsOn: 1 });
        break;

      case "monthly":
        startDate = startOfMonth(subMonths(new Date(), 1));
        endDate = endOfMonth(subMonths(new Date(), 1));
        break;
    }

    // Aggregate pipeline to get total units sold
    const pipeline = [
      {
        $match: {
          status: "Delivered",
          date: {
            $gte: startDate,
            $lte: endDate,
          },
        },
      },
      {
        $unwind: "$products",
      },
      {
        $match: {
          "products.status": "delivered",
        },
      },
      {
        $group: {
          _id: null,
          totalUnits: { $sum: "$products.quantity" },
        },
      },
    ];

    const result = await DeliveryHistory.aggregate(pipeline);
    const totalUnits = result.length > 0 ? result[0].totalUnits : 0;

    // Return only the number
    return res.status(200).json({
      success: true,
      msg: "Total products sold",
      totalProductsSold: totalUnits,
    });
  } catch (error) {
    console.error("Error in totalProductsSold:", error);
    return res
      .status(500)
      .json({ success: false, msg: "" });
  }
};

// ✅ Total Low Stock Product Count
const getLowStockProductsCount = async (req, res) => {
  try {
    const lowStockCount = await Product.countDocuments({
      stock: { $lte: 20 },
      isDeleted: false,
    });
 
    return res.status(200).json({
      success: true,
      message: "Low stock count retrieved successfully",
      lowStockCount: lowStockCount,
    });
  } catch (error) {
    console.error("Error in getLowStockCount:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

// ✅ Get Low Stock Products List
const getLowStockProductsList = async (req, res) => {
  try {
    let { page = 1, limit = 10 } = req.query;

    page = parseInt(page);
    limit = parseInt(limit);

    const filter = {
      stock: { $lte: 20 }, // Low stock condition
      isDeleted: false,
    };

    // ---- Count + Paginate ----
    const [totalProducts, lowStockProducts] = await Promise.all([
      Product.countDocuments(filter),
      Product.find(filter)
        .select("productName productImage size stock")
        .sort({ stock: 1 }) // lowest stock first
        .skip((page - 1) * limit)
        .limit(limit),
    ]);

    // ---- Format Response ----
    const formattedProducts = lowStockProducts.map((p) => ({
      id: p._id,
      productName: p.productName,
      productImage: p.productImage,
      size: p.size,
      stockAvailable: p.stock,
    }));

    const totalPages = Math.ceil(totalProducts / limit);
    const hasPrevious = page > 1;
    const hasNext = page < totalPages;

    return res.status(200).json({
      success: true,
      message: "Low stock products retrieved successfully",
      totalProducts,
      totalPages,
      currentPage: page,
      previous: hasPrevious,
      next: hasNext,
      products: formattedProducts,
    });
  } catch (error) {
    console.error("Error in getLowStockProducts:", error);
    return res.status(500).json({
      success: false,
      message: "Failed To Get Low Stock Products",
      error: error.message,
    });
  }
};

// ✅ Add Stock
const addStock = async (req, res) => {
  try {
    const { productId } = req.params;
    const { quantity } = req.body;
 
    if (!productId || !quantity) {
      return res.status(400).json({
        success: false,
        message: "Product ID and quantity are required",
      });
    }
 
    if (quantity <= 0) {
      return res.status(400).json({
        success: false,
        message: "Quantity must be greater than 0",
      });
    }
 
    const product = await Product.findById(productId);
 
    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }
 
    if (product.isDeleted) {
      return res.status(400).json({
        success: false,
        message: "Cannot add stock to deleted product",
      });
    }
 
    const updatedProduct = await Product.findByIdAndUpdate(
      productId,
      { $inc: { stock: parseInt(quantity) } },
      { new: true }
    );
 
    return res.status(200).json({
      success: true,
      message: "Stock added successfully",
      data: {
        productId: updatedProduct._id,
        productName: updatedProduct.productName,
        stock: updatedProduct.stock,
      },
    });
  } catch (error) {
    console.error("Error in addStock:", error);
    return res.status(500).json({
      success: false,
      message: "Failed To Add Stock",
      error: error.message,
    });
  }
};

// ✅ Remove Stock
const removeStock = async (req, res) => {
  try {
    const { productId } = req.params;

    if (!productId) {
      return res.status(400).json({
        success: false,
        message: "Product ID is required",
      });
    }

    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }

    if (product.isDeleted) {
      return res.status(400).json({
        success: false,
        message: "Cannot remove stock from deleted product",
      });
    }

    if (product.stock <= 0) {
      return res.status(400).json({
        success: false,
        message: "Insufficient stock. No stock available to remove",
        data: {
          availableStock: product.stock,
        },
      });
    }

    // Decrease stock by 1
    const updatedProduct = await Product.findByIdAndUpdate(
      productId,
      { $inc: { stock: -1 } },
      { new: true }
    );

    return res.status(200).json({
      success: true,
      message: "Stock Decreased successfully",
      data: {
        productId: updatedProduct._id,
        productName: updatedProduct.productName,
        stock: updatedProduct.stock,
      },
    });
  } catch (error) {
    console.error("Error in removeStock:", error);
    return res.status(500).json({
      success: false,
      message: "Failed To Remove Stock",
      error: error.message,
    });
  }
};

// ✅ Get Top Selling Product And Total Product Sold
const getTopSellingProductSold = async (req, res) => {
  try {
    const { period } = req.query;

    if (!["daily", "weekly", "monthly"].includes(period)) {
      return res.status(400).json({
        success: false,
        message: "Invalid period. Use: daily, weekly, or monthly",
      });
    }

    let startDate, endDate;

    switch (period) {
      case "daily":
        startDate = new Date();
        startDate.setHours(0, 0, 0, 0);
        endDate = new Date();
        endDate.setHours(23, 59, 59, 999);
        break;

      case "weekly":
        startDate = startOfWeek(subWeeks(new Date(), 1), { weekStartsOn: 1 });
        endDate = endOfWeek(subWeeks(new Date(), 1), { weekStartsOn: 1 });
        break;

      case "monthly":
        startDate = startOfMonth(subMonths(new Date(), 1));
        endDate = endOfMonth(subMonths(new Date(), 1));
        break;
    }

    // ✅ Fetch all delivered orders in given period
    const deliveredOrders = await CustomerOrder.find({
      status: "Delivered",
      date: { $gte: startDate, $lte: endDate },
    }).populate("products.product");

    if (!deliveredOrders.length) {
      return res.status(200).json({
        success: true,
        message: `No delivered orders found for ${period}`,
        data: {
          totalProductsSold: 0,
          topSellingProduct: "Milk",
          period,
        },
      });
    }

    let totalProductsSold = 0;
    const productCount = {};

    // ✅ Loop through orders and count product quantities
    deliveredOrders.forEach((order) => {
      order.products.forEach((p) => {
        if (p.status === "delivered") {
          totalProductsSold += p.quantity;

          const productName = p.product?.productName || "Unknown Product";

          if (!productCount[productName]) {
            productCount[productName] = 0;
          }
          productCount[productName] += p.quantity;
        }
      });
    });

    // ✅ Find top-selling product
    let topSellingProduct = null;
    let maxQuantity = 0;

    for (const [name, qty] of Object.entries(productCount)) {
      if (qty > maxQuantity) {
        maxQuantity = qty;
        topSellingProduct = name;
      }
    }

    return res.status(200).json({
      success: true,
      message: `Sales summary for ${period} period`,
      data: {
        totalProductsSold,
        topSellingProduct,
        period,
      },
    });
  } catch (error) {
    console.error("Error in getSalesSummary:", error);
    return res.status(500).json({
      success: false,
      message: "Failed To Get Top Selling Product And Total Product Sold",
      error: error.message,
    });
  }
};


//✅ Get Total Product Deliver Tommorow
const getTotalProductDeliverTommorow = async (req, res) => {
  try {
    let { page = 1, limit = 10, sortOrder = "desc" } = req.query;
    page = parseInt(page);
    limit = parseInt(limit);

    const tomorrow = moment().add(1, "day").format("DD/MM/YYYY");

    const pipeline = [
      { $match: { deliveryDate: tomorrow } },
      {
        $lookup: {
          from: "customers",
          localField: "customer",
          foreignField: "_id",
          as: "customer",
        },
      },
      { $unwind: "$customer" },
      { $unwind: "$products" },
      {
        $group: {
          _id: "$_id",
          customerName: { $first: "$customer.name" },
          deliveryDate: { $first: "$deliveryDate" },
          products: { $push: "$products" },
        },
      },
      {
        $project: {
          _id: 1,
          customerName: 1,
          deliveryDate: 1,
          productType: {
            $reduce: {
              input: "$products.productName",
              initialValue: "",
              in: {
                $concat: [
                  { $cond: [{ $eq: ["$$value", ""] }, "", { $concat: ["$$value", ", "] }] },
                  "$$this",
                ],
              },
            },
          },
          productSize:{
            $reduce: {
              input: "$products.productSize",
              initialValue: "",
              in: {
                $concat: [
                  { $cond: [{ $eq: ["$$value", ""] }, "", { $concat: ["$$value", ", "] } ] },
                  "$$this",
                ],
              },
            },
          },
          quantity:{
            $reduce: {
              input: "$products.quantity",
              initialValue: 0,
              in: {
                $sum: ["$$value", "$$this"],
              },
            },
          },
        },
      },
      { $sort: { deliveryDate: sortOrder === "asc" ? 1 : -1 } },
      { $skip: (page - 1) * limit },
      { $limit: limit },
    ];

    const result = await CustomerOrder.aggregate(pipeline);
    const totalRecords = result.length;
    const totalPages = Math.ceil(totalRecords / limit);
    const hasPrevious = page > 1;
    const hasNext = page < totalPages;

    return res.status(200).json({
      success: true,
      message: "Total products to deliver tomorrow fetched successfully",
      totalRecords,
      totalPages,
      currentPage: page,
      previous: hasPrevious,
      next: hasNext,
      tommorrowDeliveryProducts: result,
    });
  } catch (error) {
    console.error("❌ Error in getTotalProductDeliverTommorow:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to get total products to deliver tomorrow",
      error: error.message,
    });
  }
};


 
module.exports = {
  createProduct,
  getAllProducts,
  getProductById,
  updateProduct,
  deleteProduct,
  totalProductsSold,
  getLowStockProductsCount,
  getLowStockProductsList,
  addStock,
  removeStock,
  getTopSellingProductSold,
  getTotalProductDeliverTommorow,
};
