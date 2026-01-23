require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cookieParser = require("cookie-parser");
const cors = require("cors");
const path = require("path");

const multer = require("multer");
const upload = multer({ storage: multer.memoryStorage() });

const restaurantRoutes = require("./routes/restaurantRoutes");
const productRoutes = require("./routes/productRoutes");
const authRoutes = require("./routes/authRoutes");
const categoryRoutes = require("./routes/categoryRoutes");
const orderRoutes = require("./routes/orderRoutes");
const couponRoutes = require("./routes/couponRoutes");
const authController = require("./controllers/authController");
const aiController = require("./controllers/aiController");
const webPush = require("web-push");
const WEB_PUSH_PUBLIC = process.env.WEB_PUSH_PUBLIC;
const WEB_PUSH_PRIVATE = process.env.WEB_PUSH_PRIVATE;

const publicVapidKey = process.env.WEB_PUSH_PUBLIC;
const privateVapidKey = process.env.WEB_PUSH_PRIVATE;

webPush.setVapidDetails(
  "mailto:admin@imenueg.com",
  publicVapidKey,
  privateVapidKey,
);

const requestSchema = new mongoose.Schema({
  name: { type: String, required: true },
  storeName: { type: String, required: true },
  phone: { type: String, required: true },
  address: { type: String, required: true },
  status: { type: String, enum: ["new", "contacted"], default: "new" },
  createdAt: { type: Date, default: Date.now },
});
const MenuRequest = mongoose.model("MenuRequest", requestSchema);

const subSchema = new mongoose.Schema({
  endpoint: String,
  keys: mongoose.Schema.Types.Mixed,
  createAt: { type: Date, default: Date.now },
});
const PushSubscription = mongoose.model("PushSubscription", subSchema);

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

app.post(
  "/api/v1/ai/process-menu",
  authController.protect,
  authController.restrictTo("admin"),
  upload.array("menuImages", 10),
  aiController.processMenuWithAI,
);

app.get("/menu/:slug", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "menu.html"));
});

app.get("/owner", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "admin.html"));
});

app.get("/super-admin", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "super.html"));
});

app.get("/login", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "login.html"));
});

app.get("/promo", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "promo.html"));
});

// في ملف server.js
app.get("/admin-mobile", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "mobile.html"));
});

app.use("/api/v1/users", authRoutes);
app.use("/api/v1/restaurants", restaurantRoutes);
app.use("/api/v1/products", productRoutes);
app.use("/api/v1/categories", categoryRoutes);
app.use("/api/v1/orders", orderRoutes);
app.use("/api/v1/coupons", couponRoutes);

app.post("/api/v1/subscribe", async (req, res) => {
  const subscription = req.body;
  await PushSubscription.findOneAndUpdate(
    { endpoint: subscription.endpoint },
    subscription,
    { upsert: true },
  );
  res.status(201).json({ status: "success" });
});

app.get("/api/v1/vapid-key", (req, res) => {
  res.json({ publicKey: publicVapidKey });
});

app.post("/api/v1/requests", async (req, res) => {
  try {
    const newRequest = await MenuRequest.create(req.body);

    req.io.emit("new-menu-request", newRequest);

    const payload = JSON.stringify({
      title: "طلب انضمام جديد! 🚀",
      body: `العميل: ${newRequest.name} - المطعم: ${newRequest.storeName}`,
      url: "/super-admin",
    });

    const subscriptions = await PushSubscription.find();
    subscriptions.forEach((sub) => {
      webPush
        .sendNotification(sub, payload)
        .catch((err) => console.error("Push Error", err));
    });

    res.status(201).json({ status: "success", data: newRequest });
  } catch (err) {
    res.status(400).json({ status: "error", message: err.message });
  }
});

app.get("/api/v1/requests", async (req, res) => {
  try {
    const requests = await MenuRequest.find().sort({ createdAt: -1 });
    res.json({ status: "success", data: requests });
  } catch (err) {
    res.status(500).json({ status: "error", message: err.message });
  }
});

app.delete("/api/v1/requests", async (req, res) => {
  try {
    const { ids } = req.body;
    await MenuRequest.deleteMany({ _id: { $in: ids } });
    res.json({ status: "success", message: "Deleted successfully" });
  } catch (err) {
    res.status(500).json({ status: "error", message: err.message });
  }
});

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
  res.sendFile(path.join(__dirname, "public", "index.html"));
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
