const express = require("express");
const app = express();

const http = require("http");
const db = require("./config/db");
const mongoose = require("mongoose");
const env = require("dotenv");
env.config();
const port = process.env.PORT || 4000;
const cookieParser = require("cookie-parser");
const cors = require("cors");
app.use(express.json());

app.use(cookieParser());

app.use(cors({
  origin: "*",
  optionsSuccessStatus: 200
}));

app.use(express.json());

const adminRoutes = require("./routes/adminRoutes");
const coustomerRoutes = require("./routes/coustomerRoutes");
const DelhiveryBoyRoutes = require("./routes/delhiveryBoyRoutes");
const bottleRoutes = require("./routes/bottleTransactionRoutes");
const delhiverHistoryRoutes = require("./routes/delhiveryHistoryRoutes");
const productRoutes = require("./routes/productRoutes");

const CreateInvoiceRoutes = require("./routes/customInvoiceRoute");
const customerInvoce = require("./routes/customerInvoce");

const customOrderRoutes = require("./routes/customCoustomerRoutes");
const dashboardRoutes = require("./routes/dashboardRoutes")


app.use("/api/admin", adminRoutes);
app.use("/api/customer", coustomerRoutes);
app.use("/api/deliveryBoy", DelhiveryBoyRoutes);
app.use("/api/bottle", bottleRoutes);
app.use("/api/deliveryHistory", delhiverHistoryRoutes);
app.use("/api/product", productRoutes);

// app.use("/invoice", CreateInvoiceRoutes);
app.use("/api/customers", customerInvoce);

app.use("/api/customOrder", customOrderRoutes);
app.use("/api/dashboard", dashboardRoutes);


app.get("/", (req, res) => {
  res.send("we are Pench Milk");
});

db();

// const htttpServer = http.createServer(app);
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
