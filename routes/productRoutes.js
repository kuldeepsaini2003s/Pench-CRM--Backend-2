const express = require("express");
const {
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
  getTopSellingProductAndTotalProductSold,
  getTotalProductDeliverTommorow
} = require("../controllers/productController");

const { upload } = require("../config/cloudinary");

const router = express.Router();

router.post("/add-products", upload.single("productImage"), createProduct);

router.get("/getAllProducts", getAllProducts);

router.get("/getProductById/:id", getProductById);

router.put("/updateProduct/:id", upload.single("productImage"), updateProduct);

router.put("/deleteProduct/:id", deleteProduct);


router.get("/totalProductsSold", totalProductsSold);

router.get("/getLowStockProductsCount", getLowStockProductsCount);

router.get("/getLowStockProductsList", getLowStockProductsList);

router.put("/incrementQuantity/:productId", addStock);

router.put("/decrementQuantity/:productId", removeStock);

router.get("/getTopSellingProduct", getTopSellingProductAndTotalProductSold);

router.get("/getProductDeliverTommorow", getTotalProductDeliverTommorow);

module.exports = router;
