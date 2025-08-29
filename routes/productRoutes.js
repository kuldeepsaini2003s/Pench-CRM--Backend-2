const express = require("express");
const {
  createProduct,
  getAllProducts,
  getProductById,
  updateProduct,
  deleteProduct,
} = require("../controllers/productController");

const {upload} = require("../config/cloudinary");

const router = express.Router();

router.post("/add-products", upload.single("productImage"), createProduct);
router.get("/getAllProducts", getAllProducts);
router.get("/getProductById/:id", getProductById);
router.put("/updateProduct/:id",upload.single("productImage"), updateProduct);
router.delete("/deleteProduct/:id", deleteProduct);

module.exports = router;
