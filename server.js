require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cookieParser = require("cookie-parser");
const cors = require("cors");
const path = require("path");

const restaurantRoutes = require("./routes/restaurantRoutes");
const productRoutes = require("./routes/productRoutes");
const authRoutes = require("./routes/authRoutes");
const categoryRoutes = require("./routes/categoryRoutes");
const orderRoutes = require("./routes/orderRoutes");
const couponRoutes = require("./routes/couponRoutes");

const app = express();
const server = require("http").createServer(app);
const { Server } = require("socket.io");
const io = new Server(server, { cors: { origin: "*" } });

io.on("connection", (socket) => {
  socket.on("join-restaurant", (restaurantId) => {
    socket.join(restaurantId);
  });
  socket.on("join-order", (orderId) => {
    socket.join(orderId);
  });
});

app.use((req, res, next) => {
  req.io = io;
  next();
});

app.use(express.json());
app.use(cookieParser());
app.use(cors());

app.use(express.static("public"));

app.get("/menu/:slug", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "menu.html"));
});

app.get("/owner", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "admin.html"));
});

app.get("/super-admin", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "super.html"));
});

app.get("/promo", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "promo.html"));
});

app.use("/api/v1/users", authRoutes);
app.use("/api/v1/restaurants", restaurantRoutes);
app.use("/api/v1/products", productRoutes);
app.use("/api/v1/categories", categoryRoutes);
app.use("/api/v1/orders", orderRoutes);
app.use("/api/v1/coupons", couponRoutes);

app.get(/.*/, (req, res) => {
  const backUrl = req.header("Referer") || "/";

  if (backUrl.includes(req.originalUrl)) {
    return res.redirect("/");
  }

  res.redirect(backUrl);
});

mongoose
  .connect(process.env.DATABASE_URL)
  .then(() => console.log("✅ Connected to MongoDB Successfully!"))
  .catch((err) => console.log("❌ Database Connection Error:", err));

app.get("/", (req, res) => {
  res.send("<h1>Smart Menu System is Running 🚀</h1>");
});

app.use((err, req, res, next) => {
  console.error("🔥 Error Log:", err);
  res.status(500).json({
    status: "error",
    message: err.message || "حدث خطأ غير متوقع في السيرفر",
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`✅ Server is running on port ${PORT}`);
});
