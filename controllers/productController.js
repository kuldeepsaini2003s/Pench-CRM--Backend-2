const Product = require("../models/productModel");
const ErrorHandler = require("../utils/errorhendler");
const DeliveryHistory = require("../models/delhiveryHistory");
const {
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  subDays,
  subWeeks,
  subMonths,
} = require("date-fns");

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

    // 🔹 Generate productCode
    const prefix = productName.toUpperCase().replace(/\s+/g, "-");

    // us productName se related last product find karo
    const lastProduct = await Product.findOne({ productName }).sort({
      createdAt: -1,
    });

    let productNumber = 1;
    if (lastProduct && lastProduct.productCode) {
      const lastCode = lastProduct.productCode.split("-").pop(); // last number nikal lo
      if (!isNaN(lastCode)) {
        productNumber = parseInt(lastCode) + 1;
      }
    }

    const productCode = `${prefix}-${String(productNumber).padStart(3, "0")}`;

    // 🔹 Save product
    const product = await Product.create({
      productName,
      description,
      size,
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
      productName = "",
      size,
      minPrice,
      maxPrice,
      sortBy,
      sortOrder = "desc",
      page = 1,
      limit = 10,
    } = req.query;

    page = parseInt(page);
    limit = parseInt(limit);

    // ---- Search Filter ----
    const filter = {};
    if (productName) {
      filter.productName = { $regex: productName, $options: "i" };
    }
    if (size) {
      filter.size = size;
    }
    if (minPrice || maxPrice) {
      filter.price = {};
      if (minPrice) filter.price.$gte = Number(minPrice);
      if (maxPrice) filter.price.$lte = Number(maxPrice);
    }

    // ---- Sorting ----
    let sort = {};
    if (sortBy) {
      sort[sortBy] = sortOrder === "asc" ? 1 : -1;
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
      // description: p.description,
      // productType: p.productType,
      size: p.size,
      // price: p.price,
      stockAvailable: p.stock,
      productCode: p.productCode,
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
};

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
    const product = await Product.findByIdAndDelete(id);
    if (!product) return next(new ErrorHandler("Product not found", 404));

    res.status(200).json({
      success: true,
      message: "Product deleted successfully",
      deletedProduct: product,
    });
  } catch (error) {
    console.log(error);
    return res.status(500).json({
      success: false,
      message: "Failed To Delete Product",
    });
  }
};

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
      .json({ success: false, msg: "Internal server error" });
  }
};

module.exports = {
  createProduct,
  getAllProducts,
  getProductById,
  updateProduct,
  deleteProduct,
  totalProductsSold,
};
