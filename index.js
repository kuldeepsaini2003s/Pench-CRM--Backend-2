const express = require("express");
const app = express();
const db = require("./config/db");
const env = require("dotenv");
env.config();
const port = process.env.PORT || 4000;
const cookieParser = require("cookie-parser");
const cors = require("cors");
const swaggerUi = require("swagger-ui-express");
const swaggerJsdoc = require("swagger-jsdoc");

app.use(express.json());

app.use(cookieParser());

app.use(
  cors({
    origin: "*",
    optionsSuccessStatus: 200,
  })
);



const options = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "Pench",
      version: "1.0.0",
      description: "API documentation for Pench Backend",
    },
    servers: [
      { url: "http://localhost:8000" },
      { url: "https://pench-crm-backend.onrender.com" },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
        },
      },
    },
  },
  apis: ["./routes/*.js"], // path to your route files
};

const swaggerSpec = swaggerJsdoc(options);

app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));

const adminRoutes = require("./routes/adminRoutes");
const coustomerRoutes = require("./routes/coustomerRoutes");
const deliveryBoyRoutes = require("./routes/deliveryBoyRoutes");
const bottleRoutes = require("./routes/bottleTransactionRoutes");
const deliveryHistoryRoutes = require("./routes/deliveryHistoryRoutes");
const productRoutes = require("./routes/productRoutes");

const CreateInvoiceRoutes = require("./routes/customInvoiceRoute");
const customerInvoce = require("./routes/customerInvoce");

const customOrderRoutes = require("./routes/customerOrderRoutes");
const dashboardRoutes = require("./routes/dashboardRoutes");

app.use("/api/admin", adminRoutes);
app.use("/api/customer", coustomerRoutes);
app.use("/api/deliveryBoy", deliveryBoyRoutes);
app.use("/api/bottle", bottleRoutes);
app.use("/api/deliveryHistory", deliveryHistoryRoutes);
app.use("/api/product", productRoutes);

// app.use("/invoice", CreateInvoiceRoutes);
app.use("/api/customers", customerInvoce);
app.use("/api/invoices", CreateInvoiceRoutes);
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
