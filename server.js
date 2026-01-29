require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cookieParser = require("cookie-parser");
const cors = require("cors");
const path = require("path");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const multer = require("multer");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const webPush = require("web-push");
const { Server } = require("socket.io");
const http = require("http");
const cron = require("node-cron");

// ==========================================
// 1. Models Definitions (تعريف الجداول محلياً)
// ==========================================

// --- User Model ---
const userSchema = new mongoose.Schema({
  productLimit: { type: Number, default: 75 },
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true, lowercase: true },
  password: { type: String, required: true },
  phone: { type: String, required: true },
  whatsapp: { type: String, default: "" },
  role: { type: String, enum: ["user", "owner", "admin", "cashier", "kitchen", "sales"], default: "user" }, // Added 'sales'
  owner: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  restaurant: { type: mongoose.Schema.Types.ObjectId, ref: "Restaurant" },
  shiftStart: { type: String, default: "00:00" },
  shiftEnd: { type: String, default: "23:59" },
  restDays: { type: [Number], default: [] },
  subscriptionExpires: { type: Date },
  active: { type: Boolean, default: true },
  hasStock: { type: Boolean, default: false },
  
  // Sales & Trial Fields
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" }, // السيلز الذي أنشأ الحساب
  isTrial: { type: Boolean, default: false }, // هل الحساب تجريبي؟
  trialExpires: { type: Date }, // تاريخ انتهاء التجربة
  
  createdAt: { type: Date, default: Date.now },
});
userSchema.methods.correctPassword = async function (candidatePassword, userPassword) {
  return await bcrypt.compare(candidatePassword, userPassword);
};
const User = mongoose.model("User", userSchema);

// --- Restaurant Model ---
const restaurantSchema = new mongoose.Schema({
  owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  restaurantName: { type: String, required: true },
  businessType: { type: String, enum: ["restaurant", "cafe", "both"], default: "restaurant" },
  slug: { type: String, required: true, unique: true },
  useTableNumbers: { type: Boolean, default: false },
  orderMode: { type: String, enum: ["whatsapp", "system", "view_only"], default: "whatsapp" },
  taxRate: { type: Number, default: 0 },
  serviceRate: { type: Number, default: 0 },
  isActive: { type: Boolean, default: true },
  enableCoupons: { type: Boolean, default: false },
  hasStock: { type: Boolean, default: false },
  qrImage: { type: String, default: "" },
  qrName: { type: String, default: "" },
  customUI: {
    // الخلفية والخطوط
    bgType: { type: String, default: "color" },
    bgValue: { type: String, default: "#F9F9F9" },
    bgPosition: { type: String, default: "center" },
    bgSize: { type: String, default: "cover" }, // حجم الخلفية (cover/contain)
    bgRepeat: { type: String, default: "no-repeat" }, // التكرار
    bgAttachment: { type: String, default: "fixed" }, // التثبيت عند السكرول
    bgOverlay: { type: Number, default: 90 }, // نسبة تعتيم الخلفية
    fontFamily: { type: String, default: "Tajawal" },
    
    // الألوان العامة
    primaryColor: { type: String, default: "#B78728" },
    secTitleColor: { type: String, default: "#2d2d2d" }, // جديد: لون عناوين الأقسام
    prodTitleColor: { type: String, default: "#2d2d2d" }, // لون اسم المنتج
    prodPriceColor: { type: String, default: "#B78728" }, // لون السعر
    cardColor: { type: String, default: "#ffffff" }, // جديد: لون الكارت

    // محاذاة نصوص الهيدر
    headerTextAlignment: { type: String, default: "center" },
    resNamePosition: { type: String, default: "inside" }, // ✅ تم إضافة هذا السطر لحفظ مكان الاسم

    // الهيدر (صورة الغلاف)
    heroImage: { type: String, default: "" },
    showHero: { type: Boolean, default: true },
    heroOverlay: { type: Number, default: 30 },
    heroHeight: { type: Number, default: 200 },
    heroPosition: { type: String, default: "center" }, // جديد: كروب الصورة

    // بيانات المطعم (الاسم والوصف)
    showResName: { type: Boolean, default: true }, // جديد
    customResName: { type: String, default: "" }, // جديد (لو عايز يغير الاسم الظاهر)
    resNameColor: { type: String, default: "#B78728" },
    
    showResDesc: { type: Boolean, default: true }, // جديد
    customResDesc: { type: String, default: "" }, // جديد
    resDescColor: { type: String, default: "#eeeeee" }, // جديد
    
    // البحث
    showSearch: { type: Boolean, default: true }, // جديد
    searchPlaceholder: { type: String, default: "" }, // جديد

    // تخطيط الكروت والصور
    layoutType: { type: String, default: "modern" },
    cardStyle: { type: String, default: "solid" },
    cardRadius: { type: Number, default: 16 },
    prodImgObjectFit: { type: String, default: "cover" }, // جديد: شكل الصورة داخل الإطار
  },
  contactInfo: { whatsapp: String, phone: String, address: String },
  coverImage: String,
  logo: String,
  createdAt: { type: Date, default: Date.now },
});
const Restaurant = mongoose.model("Restaurant", restaurantSchema);

// --- Category Model ---
const categorySchema = new mongoose.Schema({
  sortOrder: { type: Number, default: 0 }, // جديد: للترتيب
  name: { type: String, required: [true, "يجب إدخال اسم القسم"] },
  image: { type: String, default: "" },
  restaurant: { type: mongoose.Schema.ObjectId, ref: "Restaurant", required: [true, "القسم يجب أن يتبع مطعم"] },
  createdAt: { type: Date, default: Date.now },
});
const Category = mongoose.model("Category", categorySchema);

// --- StockItem Model ---
const stockItemSchema = new mongoose.Schema({
  restaurant: { type: mongoose.Schema.Types.ObjectId, ref: "Restaurant", required: true },
  name: { type: String, required: true },
  quantity: { type: Number, default: 0 },
  unit: { type: String, required: true },
  costPerUnit: { type: Number, default: 0 },
  alertLevel: { type: Number, default: 5 },
  lastUpdated: { type: Date, default: Date.now },
});
const StockItem = mongoose.model("StockItem", stockItemSchema);

// --- Product Model ---
const productSchema = new mongoose.Schema({
  restaurant: { type: mongoose.Schema.Types.ObjectId, ref: "Restaurant", required: true },
  sortOrder: { type: Number, default: 0 }, // جديد: للترتيب
  name: { en: { type: String, required: true }, ar: { type: String } },
  description: { en: String, ar: String },
  price: { type: Number, default: 0 },
  oldPrice: { type: Number, default: 0 },
  sizes: [{ name: { type: String, required: true }, price: { type: Number, required: true }, oldPrice: { type: Number, default: 0 } }],
  ingredients: [{ stockItem: { type: mongoose.Schema.Types.ObjectId, ref: "StockItem" }, quantity: Number }],
  category: { type: String, required: true },
  image: { type: String, default: "" },
  isAvailable: { type: Boolean, default: true },
});
const Product = mongoose.model("Product", productSchema);

// --- Order Model ---
const orderSchema = new mongoose.Schema(
  {
    restaurant: { type: mongoose.Schema.Types.ObjectId, ref: "Restaurant", required: true },
    tableNumber: { type: String, default: "تيك أواي" },
    orderNum: { type: Number },
    couponCode: String,
    discountAmount: { type: Number, default: 0 },
    items: [{ productId: { type: mongoose.Schema.Types.ObjectId, ref: "Product" }, name: String, price: Number, qty: Number }],
    subTotal: { type: Number, required: true },
    taxAmount: { type: Number, default: 0 },
    serviceAmount: { type: Number, default: 0 },
    totalPrice: { type: Number, required: true },
    status: { type: String, enum: ["pending", "preparing", "completed", "canceled"], default: "pending" },
    createdAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);
const Order = mongoose.model("Order", orderSchema);

// --- Coupon Model ---
const couponSchema = new mongoose.Schema({
  code: { type: String, required: true, uppercase: true, trim: true },
  restaurant: { type: mongoose.Schema.Types.ObjectId, ref: "Restaurant", required: true },
  discountType: { type: String, enum: ["percent", "fixed"], default: "percent" },
  value: { type: Number, required: true },
  maxDiscount: { type: Number },
  minOrderVal: { type: Number, default: 0 },
  usageLimit: { type: Number, default: 1000 },
  usedCount: { type: Number, default: 0 },
  expiresAt: { type: Date },
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
});
couponSchema.index({ code: 1, restaurant: 1 }, { unique: true });
const Coupon = mongoose.model("Coupon", couponSchema);

// --- StockLog Model ---
const stockLogSchema = new mongoose.Schema({
  restaurant: { type: mongoose.Schema.Types.ObjectId, ref: "Restaurant", required: true },
  stockItem: { type: mongoose.Schema.Types.ObjectId, ref: "StockItem", required: true },
  itemName: String,
  changeAmount: { type: Number, required: true },
  type: { type: String, enum: ["consumption", "restock", "adjustment", "waste"], required: true },
  orderId: { type: mongoose.Schema.Types.ObjectId, ref: "Order" },
  date: { type: Date, default: Date.now },
});
const StockLog = mongoose.model("StockLog", stockLogSchema);

// --- SalesRequest Model ---
const salesRequestSchema = new mongoose.Schema({
  name: { type: String, required: true },
  phone: { type: String, required: true },
  walletNumber: { type: String, required: true },
  image: { type: String, required: true },
  status: { type: String, enum: ["pending", "approved", "rejected"], default: "pending" },
  createdAt: { type: Date, default: Date.now },
});
const SalesRequest = mongoose.model("SalesRequest", salesRequestSchema);

// Model for Menu Request (Defined Inline in original server.js)
const requestSchema = new mongoose.Schema({
  name: { type: String, required: true },
  storeName: { type: String, required: true },
  phone: { type: String, required: true },
  address: { type: String, required: true },
  status: { type: String, enum: ["new", "contacted"], default: "new" },
  createdAt: { type: Date, default: Date.now },
});
const MenuRequest = mongoose.models.MenuRequest || mongoose.model("MenuRequest", requestSchema);

const subSchema = new mongoose.Schema({
  endpoint: String,
  keys: mongoose.Schema.Types.Mixed,
  createAt: { type: Date, default: Date.now },
});
const PushSubscription = mongoose.models.PushSubscription || mongoose.model("PushSubscription", subSchema);

// ==========================================
// CRON JOB: Auto-Delete Expired Trials
// ==========================================
// تشغيل كل ساعة (الدقيقة 0)
cron.schedule("0 * * * *", async () => {
  console.log("⏳ Checking for expired trial accounts...");
  try {
    const expiredUsers = await User.find({
      isTrial: true,
      trialExpires: { $lt: new Date() },
    });

    for (const user of expiredUsers) {
      console.log(`🗑️ Deleting expired trial user: ${user.email}`);
      
      // حذف بيانات المطعم المرتبط
      if (user.role === 'owner') {
        const restaurant = await Restaurant.findOne({ owner: user._id });
        if (restaurant) {
          await Product.deleteMany({ restaurant: restaurant._id });
          await Category.deleteMany({ restaurant: restaurant._id });
          await Order.deleteMany({ restaurant: restaurant._id });
          await Coupon.deleteMany({ restaurant: restaurant._id });
          await StockItem.deleteMany({ restaurant: restaurant._id });
          await StockLog.deleteMany({ restaurant: restaurant._id });
          await User.deleteMany({ restaurant: restaurant._id }); // حذف الموظفين
          await Restaurant.findByIdAndDelete(restaurant._id);
        }
      }
      // حذف المستخدم نفسه
      await User.findByIdAndDelete(user._id);
    }
    if(expiredUsers.length > 0) console.log(`✅ Cleaned up ${expiredUsers.length} expired accounts.`);
  } catch (err) {
    console.error("❌ Error in Cron Job:", err);
  }
});

// ==========================================
// 2. App Configuration
// ==========================================
const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

// Web Push Config
const publicVapidKey = process.env.WEB_PUSH_PUBLIC;
const privateVapidKey = process.env.WEB_PUSH_PRIVATE;
if (publicVapidKey && privateVapidKey) {
  webPush.setVapidDetails("mailto:admin@imenueg.com", publicVapidKey, privateVapidKey);
} else {
  console.warn("⚠️ WEB_PUSH keys are missing in .env. Notifications will not work.");
}

// ==========================================
// Cloudinary & Multer Config
// ==========================================
const cloudinary = require("cloudinary").v2;
const { CloudinaryStorage } = require("multer-storage-cloudinary");

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// إعداد التخزين على كلاوديناري
const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: "smart-menu-uploads", // مجلد موحد لكل الملفات المرفوعة عبر السيرفر
    allowed_formats: ["jpg", "png", "jpeg", "webp"],
  },
});

const upload = multer({ storage: storage }); // الآن الرفع يتم مباشرة لكلاوديناري ويعيد رابط URL
const memoryUpload = multer({ storage: multer.memoryStorage() }); // يظل كما هو (للذكاء الاصطناعي)

// Google AI Config
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Middleware
app.use((req, res, next) => {
  req.io = io;
  next();
});
// ==========================================
// Middleware Configuration (تم التعديل لزيادة حجم الرفع)
// ==========================================
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(cookieParser());
app.use(cors());
app.use(express.static("public"));
app.use('/uploads', express.static('public/uploads')); // لخدمة الصور المرفوعة

// Socket.io Logic
io.on("connection", (socket) => {
  socket.on("join-restaurant", (restaurantId) => {
    socket.join(restaurantId);
  });
  socket.on("join-order", (orderId) => {
    socket.join(orderId);
  });
});

// ==========================================
// 3. Helper Functions & Auth Middleware
// ==========================================
const SUPER_ADMIN_ID = "000000000000000000000000";

const signToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: "90d" });
};

const createSendToken = (user, statusCode, res) => {
  const token = signToken(user._id);
  const cookieOptions = {
    expires: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
    httpOnly: true,
  };
  res.cookie("jwt", token, cookieOptions);
  if (user.password) user.password = undefined;
  res.status(statusCode).json({ status: "success", token, data: { user } });
};

// Middleware: Protect (Login Check)
const protect = async (req, res, next) => {
  let token;
  if (req.headers.authorization && req.headers.authorization.startsWith("Bearer")) {
    token = req.headers.authorization.split(" ")[1];
  }
  if (!token) return res.status(401).json({ message: "أنت غير مسجل دخول!" });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (decoded.id === SUPER_ADMIN_ID) {
      req.user = { _id: SUPER_ADMIN_ID, name: "Super Admin", role: "admin" };
      return next();
    }
    const currentUser = await User.findById(decoded.id);
    if (!currentUser) return res.status(401).json({ message: "المستخدم لم يعد موجوداً." });

    // ✅ تصحيح نهائي ذكي: فحص التجربة مع معالجة التاريخ الناقص تلقائياً
    if (currentUser.role === "owner") {
      if (currentUser.isTrial) {
         // 1. تصحيح تلقائي: لو التاريخ مش موجود، نمنحه 24 ساعة من دلوقتي
         if (!currentUser.trialExpires) {
             console.log(`⚠️ تنبيه: المستخدم ${currentUser.email} حساب تجريبي بدون تاريخ، جاري التصحيح...`);
             currentUser.trialExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // إضافة 24 ساعة
             await currentUser.save({ validateBeforeSave: false });
             console.log(`✅ تم تحديد مهلة جديدة تنتهي في: ${currentUser.trialExpires}`);
         }

         // 2. الفحص العادي للتاريخ
         if (new Date() > new Date(currentUser.trialExpires)) {
             console.log("❌ النتيجة: انتهت الفترة -> تم منع الدخول");
             return res.status(403).json({ message: "انتهت الفترة التجريبية للحساب." });
         }
      }

      // فحص الاشتراك العادي
      if (currentUser.subscriptionExpires && new Date() > currentUser.subscriptionExpires) {
        currentUser.active = false;
        await currentUser.save({ validateBeforeSave: false });
        return res.status(403).json({ message: "انتهت مدة اشتراكك." });
      }

      if (currentUser.active === false) return res.status(401).json({ message: "الحساب معطل." });
    }
    req.user = currentUser;
    next();
  } catch (err) {
    return res.status(401).json({ message: "التوكن غير صالح." });
  }
};

// Middleware: RestrictTo (Role Check)
const restrictTo = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ status: "fail", message: "ليس لديك صلاحية." });
    }
    next();
  };
};

// ==========================================
// 4. API ROUTES & LOGIC (Merged Controllers)
// ==========================================

// ---------------- AUTH ROUTES ----------------
app.post("/api/v1/users/signup", async (req, res) => {
  try {
    const {
      name, email, password, passwordConfirm, phone, role, subscriptionExpires, hasStock, productLimit
    } = req.body;

    if (password !== passwordConfirm) {
      return res.status(400).json({ status: "fail", message: "كلمات المرور غير متطابقة!" });
    }
    if (role === "admin") {
      return res.status(403).json({ status: "fail", message: "غير مسموح بإنشاء حساب مسؤول (Admin) بهذه الطريقة." });
    }

    let expiryDate = null;
    if (subscriptionExpires) {
      expiryDate = new Date(subscriptionExpires);
      if (!isNaN(expiryDate.getTime())) {
        expiryDate.setHours(23, 59, 59, 999);
      }
    }

    const hashedPassword = await bcrypt.hash(password, 12);
    const newUser = await User.create({
      name,
      email,
      password: hashedPassword,
      passwordConfirm,
      phone,
      role,
      subscriptionExpires: expiryDate,
      hasStock: hasStock === true || hasStock === "true",
      productLimit: productLimit || 75,
    });
    createSendToken(newUser, 201, res);
  } catch (err) {
    res.status(400).json({ status: "fail", message: err.code === 11000 ? "البريد مسجل بالفعل" : err.message });
  }
});

app.post("/api/v1/users/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ message: "أدخل البريد وكلمة المرور" });

    const user = await User.findOne({ email }).select("+password");
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ status: "fail", message: "بيانات الدخول خاطئة" });
    }
    
    // ✅ تحديث: منع الدخول إذا انتهى الوقت أو تبقى أقل من دقيقة
    if (user.isTrial && user.trialExpires) {
      const nowBuffer = new Date(Date.now() + 60000); // إضافة دقيقة هامش أمان
      if (nowBuffer > user.trialExpires) {
        return res.status(403).json({ message: "انتهت الفترة التجريبية للحساب." });
      }
    }

    // التحقق من حالة الحساب والشيفتات (منطق الكاشير/المطبخ)
    if (!user.active) {
       if (user.role === "owner" && user.subscriptionExpires && new Date() > user.subscriptionExpires) {
         return res.status(401).json({ message: "انتهى الاشتراك" });
       }
       return res.status(401).json({ message: "الحساب معطل" });
    }

    if (user.role === "cashier" || user.role === "kitchen") {
      const cairoDateStr = new Date().toLocaleString("en-US", { timeZone: "Africa/Cairo" });
      const now = new Date(cairoDateStr);
      const today = now.getDay();
      if (user.restDays && user.restDays.includes(today)) return res.status(403).json({ message: "اليوم إجازتك" });

      if (user.shiftStart && user.shiftEnd) {
        const currentMins = now.getHours() * 60 + now.getMinutes();
        const [sh, sm] = user.shiftStart.split(":").map(Number);
        const [eh, em] = user.shiftEnd.split(":").map(Number);
        const startMins = sh * 60 + sm;
        const endMins = eh * 60 + em;
        let isWorking = false;
        if (endMins < startMins) {
           if (currentMins >= startMins || currentMins < endMins) isWorking = true;
        } else {
           if (currentMins >= startMins && currentMins < endMins) isWorking = true;
        }
        if (!isWorking) return res.status(403).json({ message: "أنت خارج وقت الشيفت" });
      }
    }
    createSendToken(user, 200, res);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

app.patch("/api/v1/users/update-password", protect, async (req, res) => {
  try {
    const { password } = req.body;
    if (!password || password.length < 6) return res.status(400).json({ message: "كلمة المرور قصيرة" });
    const hashedPassword = await bcrypt.hash(password, 12);
    await User.findByIdAndUpdate(req.user.id, { password: hashedPassword });
    res.status(200).json({ status: "success", message: "تم تغيير كلمة المرور" });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});



app.post("/api/v1/users/staff", protect, restrictTo("owner"), async (req, res) => {
  try {
    const {
      name, email, password, role, restaurantId, phone, shiftStart, shiftEnd, restDays
    } = req.body;

    if (!["cashier", "kitchen"].includes(role)) {
      return res.status(400).json({ message: "الدور غير صحيح (يجب أن يكون cashier أو kitchen)" });
    }

    const hashedPassword = await bcrypt.hash(password, 12);
    const newStaff = await User.create({
      name,
      email,
      password: hashedPassword,
      role,
      phone: phone || "0000000000",
      restaurant: restaurantId,
      owner: req.user._id,
      shiftStart: shiftStart || "00:00",
      shiftEnd: shiftEnd || "23:59",
      restDays: restDays || [],
    });
    newStaff.password = undefined;
    res.status(201).json({ status: "success", data: { user: newStaff } });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

app.get("/api/v1/users/my-staff", protect, async (req, res) => {
  try {
    // الموظفين المرتبطين بهذا الأونر مباشرة أو عن طريق معرف المطعم
    const staff = await User.find({ owner: req.user._id, role: { $in: ["cashier", "kitchen"] } }).select("-password");
    res.status(200).json({ status: "success", data: { staff } });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

app.patch("/api/v1/users/staff/:id", protect, restrictTo("owner"), async (req, res) => {
  try {
    const myRestaurant = await Restaurant.findOne({ owner: req.user._id });
    if (!myRestaurant) return res.status(404).json({ message: "لا يوجد مطعم مرتبط بحسابك" });

    const staffMember = await User.findOne({ _id: req.params.id, restaurant: myRestaurant._id });
    if (!staffMember) return res.status(404).json({ message: "الموظف غير موجود أو لا يتبع لمطعمك" });

    const updates = { ...req.body };
    delete updates.restaurant; 
    delete updates.owner;

    if (updates.password && updates.password.trim() !== "") {
      updates.password = await bcrypt.hash(updates.password, 12);
    } else {
      delete updates.password;
    }

    const updatedUser = await User.findByIdAndUpdate(req.params.id, updates, {
      new: true,
      runValidators: true,
    });
    res.status(200).json({ status: "success", data: { user: updatedUser } });
  } catch (err) {
    res.status(400).json({ status: "fail", message: err.message });
  }
});

app.delete("/api/v1/users/staff/:id", protect, restrictTo("owner"), async (req, res) => {
  try {
    const myRestaurant = await Restaurant.findOne({ owner: req.user._id });
    const staffMember = await User.findOne({ _id: req.params.id, restaurant: myRestaurant._id });
    if (!staffMember) return res.status(404).json({ message: "الموظف غير موجود" });
    await User.findByIdAndDelete(req.params.id);
    res.status(200).json({ status: "success", message: "تم الحذف" });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// Admin User Management Routes

// 1. Get All Users (Missing Route) - جلب جميع المستخدمين مع فحص الاشتراكات
app.get("/api/v1/users", protect, restrictTo("admin"), async (req, res) => {
  try {
    let users = await User.find();

    const updatedUsers = await Promise.all(
      users.map(async (user) => {
        // إذا كان المالك نشطاً ولكن انتهى وقت اشتراكه، قم بتعطيله
        if (user.role === "owner" && user.active && user.subscriptionExpires) {
          if (new Date() > user.subscriptionExpires) {
            user.active = false;
            await user.save({ validateBeforeSave: false });
          }
        }
        return user;
      })
    );

    res.status(200).json({ status: "success", data: { users: updatedUsers } });
  } catch (err) {
    res.status(400).json({ status: "fail", message: err.message });
  }
});

app.patch("/api/v1/users/:id", protect, restrictTo("admin"), async (req, res) => {
  try {
    if (req.body.password) delete req.body.password;

    if (req.body.productLimit !== undefined) req.body.productLimit = Number(req.body.productLimit);
    if (req.body.hasStock !== undefined) req.body.hasStock = Boolean(req.body.hasStock);

    if (req.body.subscriptionExpires) {
      const newExpiry = new Date(req.body.subscriptionExpires);
      newExpiry.setHours(23, 59, 59, 999);
      req.body.subscriptionExpires = newExpiry;
      if (newExpiry > new Date()) req.body.active = true;
    }

    const updatedUser = await User.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });
    res.status(200).json({ status: "success", data: { user: updatedUser } });
  } catch (err) {
    res.status(400).json({ status: "fail", message: err.message });
  }
});

app.post("/api/v1/users/impersonate/:userId", protect, restrictTo("admin"), async (req, res) => {
  try {
     const userToImpersonate = await User.findById(req.params.userId);
     if (!userToImpersonate) return res.status(404).json({ message: "المستخدم غير موجود" });
     createSendToken(userToImpersonate, 200, res);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

app.patch("/api/v1/users/:id/toggle-status", protect, restrictTo("admin"), async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ status: "fail", message: "المستخدم غير موجود" });

    const newStatus = user.active === false ? true : false;
    const updatedUser = await User.findByIdAndUpdate(
      req.params.id,
      { active: newStatus },
      { new: true, runValidators: false }
    );

    res.status(200).json({
      status: "success",
      message: `تم ${updatedUser.active ? "تفعيل" : "تعطيل"} الحساب بنجاح`,
      active: updatedUser.active,
    });
  } catch (err) {
    res.status(400).json({ status: "error", message: err.message });
  }
});

// Route: Delete User (Admin Only) - Missing in original server.js
app.delete("/api/v1/users/:id", protect, restrictTo("admin"), async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ status: "fail", message: "المستخدم غير موجود" });

    // إذا كان المالك، نحذف كل ما يتعلق به
    if (user.role === 'owner') {
      const restaurant = await Restaurant.findOne({ owner: user._id });
      if (restaurant) {
        await Product.deleteMany({ restaurant: restaurant._id });
        await Category.deleteMany({ restaurant: restaurant._id });
        await Order.deleteMany({ restaurant: restaurant._id });
        await Coupon.deleteMany({ restaurant: restaurant._id });
        await StockItem.deleteMany({ restaurant: restaurant._id });
        await StockLog.deleteMany({ restaurant: restaurant._id });
        await User.deleteMany({ restaurant: restaurant._id }); // حذف الموظفين
        await Restaurant.findByIdAndDelete(restaurant._id);
      }
    }

    await User.findByIdAndDelete(req.params.id);
    res.status(200).json({ status: "success", message: "تم حذف المستخدم وجميع بياناته المرتبطة بنجاح" });
  } catch (err) {
    res.status(400).json({ status: "error", message: err.message });
  }
});

// Route: Change User Password by Admin
app.patch("/api/v1/users/:id/change-password-admin", protect, restrictTo("admin"), async (req, res) => {
  try {
    const { password } = req.body;
    if (!password || password.length < 6) {
      return res.status(400).json({ status: "fail", message: "يجب أن تكون كلمة المرور 6 أحرف على الأقل" });
    }
    const hashedPassword = await bcrypt.hash(password, 12);
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { password: hashedPassword },
      { new: true }
    );

    if (!user) {
      return res.status(404).json({ status: "fail", message: "المستخدم غير موجود" });
    }

    res.status(200).json({ status: "success", message: "تم تغيير كلمة المرور بنجاح" });
  } catch (err) {
    res.status(400).json({ status: "error", message: err.message });
  }
});

// ---------------- RESTAURANT ROUTES ----------------
app.post("/api/v1/restaurants", protect, restrictTo("admin"), upload.single('image'), async (req, res) => {
  try {
    const { restaurantName, businessType, slug, contactInfo, owner, hasStock } = req.body;
    const newRestaurant = await Restaurant.create({
      restaurantName, businessType, slug, contactInfo, owner, hasStock,
      image: req.file ? req.file.path : undefined,
    });
    res.status(201).json({ status: "success", data: { restaurant: newRestaurant } });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

app.get("/api/v1/restaurants/my-restaurant", protect, async (req, res) => {
  try {
    let query = {};
    if (req.user.role === "owner") query = { owner: req.user._id };
    else if ((req.user.role === "cashier" || req.user.role === "kitchen") && req.user.restaurant) {
      query = { _id: req.user.restaurant };
    } else {
      return res.status(404).json({ message: "لا تملك صلاحية الوصول لمطعم" });
    }
    const restaurant = await Restaurant.findOne(query).populate("owner", "hasStock subscriptionExpires active isTrial trialExpires");
    if (!restaurant) return res.status(404).json({ message: "لم يتم العثور على مطعم" });
    
    const stockPermission = restaurant.owner ? restaurant.owner.hasStock : req.user.hasStock;
    
    // منطق التحذير
    let warning = null;
    if (restaurant.owner && restaurant.owner.isTrial) {
      let hoursLeft = 0;
      // التأكد من وجود تاريخ انتهاء صالح
      if (restaurant.owner.trialExpires) {
        const diff = new Date(restaurant.owner.trialExpires) - new Date();
        hoursLeft = Math.ceil(diff / (1000 * 60 * 60));
      }
      
      // إذا انتهى الوقت أو كان غير صالح، نعرض 0
      if (isNaN(hoursLeft) || hoursLeft < 0) hoursLeft = 0;

      warning = {
        type: "trial_warning",
        message: `هذا حساب تجريبي سيتم حذفه خلال ${hoursLeft} ساعة. يرجى التواصل مع الإدارة لتفعيل الحساب نهائياً.`,
        isCritical: true
      };
    }

    res.status(200).json({
      status: "success",
      data: {
        restaurant,
        userRole: req.user.role,
        shiftStart: req.user.shiftStart,
        shiftEnd: req.user.shiftEnd,
        hasStock: stockPermission,
        warning: warning // إرسال كائن التحذير
      },
    });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

app.get("/api/v1/restaurants/:slug", async (req, res) => {
  try {
    const restaurant = await Restaurant.findOne({ slug: req.params.slug }).populate("owner");
    if (!restaurant) return res.status(404).json({ message: "المطعم غير موجود" });

    let warning = null;
    if (restaurant.owner) {
      const isExpired = restaurant.owner.subscriptionExpires && new Date() > restaurant.owner.subscriptionExpires;
      if (restaurant.owner.active === false || isExpired) {
        return res.status(403).json({ message: "المنيو غير متاح حالياً" });
      }

      // إضافة تحذير للمنيو العام إذا كان تجريبي
      if (restaurant.owner.isTrial) {
         warning = {
            message: "⚠️ تنبيه: هذا المطعم يستخدم النسخة التجريبية من نظام iMenu - سيتم حذف البيانات خلال 24 ساعة.",
            contact: "01145435095"
         };
      }
    }
    // تم إضافة .sort("sortOrder") لضمان ظهور الترتيب للزبائن
    const products = await Product.find({ restaurant: restaurant._id }).sort({ sortOrder: 1, createdAt: -1 });
    
    // ✅ إصلاح: إرسال الأقسام مرتبة حسب sortOrder
    const categories = await Category.find({ restaurant: restaurant._id }).sort("sortOrder");

    res.status(200).json({ status: "success", data: { restaurant, menu: products, categories, warning } });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

app.get("/api/v1/restaurants", protect, async (req, res) => {
   try {
     const restaurants = await Restaurant.find().populate("owner", "name email");
     res.status(200).json({ status: "success", data: { restaurants } });
   } catch(err) { res.status(400).json({ message: err.message }); }
});

app.patch("/api/v1/restaurants/:id", protect, upload.fields([{ name: 'bgImage', maxCount: 1 }, { name: 'heroImage', maxCount: 1 }]), async (req, res) => {
  try {
    let updateData = { ...req.body };
    if (updateData.customUI && typeof updateData.customUI === "string") {
      try { updateData.customUI = JSON.parse(updateData.customUI); } catch (e) { updateData.customUI = {}; }
    }
    if (req.files) {
      if (!updateData.customUI) updateData.customUI = {};
      if (req.files["bgImage"]) {
        updateData.customUI.bgValue = req.files["bgImage"][0].path;
        updateData.customUI.bgType = "image";
      }
      if (req.files["heroImage"]) {
        updateData.customUI.heroImage = req.files["heroImage"][0].path;
      }
    }
    const updatedRestaurant = await Restaurant.findByIdAndUpdate(req.params.id, updateData, { new: true });
    if (req.io) req.io.to(req.params.id).emit("menu_updated");
    res.status(200).json({ status: "success", data: { restaurant: updatedRestaurant } });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

app.delete("/api/v1/restaurants/:id", protect, restrictTo("admin"), async (req, res) => {
    try {
        await Restaurant.findByIdAndDelete(req.params.id);
        res.status(204).json({ status: "success" });
    } catch(err) { res.status(400).json({ message: err.message }); }
});

app.patch("/api/v1/restaurants/update-qr/:slug", protect, async (req, res) => {
  try {
    const { qrImage, qrName } = req.body;
    const restaurant = await Restaurant.findOneAndUpdate({ slug: req.params.slug }, { qrImage, qrName }, { new: true });
    res.status(200).json({ status: "success", data: { restaurant } });
  } catch (err) { res.status(400).json({ message: err.message }); }
});

// ---------------- PRODUCT ROUTES ----------------
app.post("/api/v1/products", protect, upload.single('image'), async (req, res) => {
  try {
    const currentUser = req.user;
    if (currentUser.productLimit !== -1) {
      const currentCount = await Product.countDocuments({ restaurant: req.body.restaurantId });
      if (currentCount >= currentUser.productLimit) return res.status(403).json({ message: "استهلكت باقة المنتجات" });
    }
    
    const { name, description, price, oldPrice, sizes, category, ingredients, restaurantId } = req.body;
    
    // Helper helper safe parsing
    const safeParse = (val) => {
      try { return typeof val === 'string' ? JSON.parse(val) : val; } catch (e) { return val; }
    };

    const newProduct = await Product.create({
      name: safeParse(name),
      description: safeParse(description),
      price: Number(price),
      oldPrice: oldPrice ? Number(oldPrice) : 0,
      sizes: safeParse(sizes) || [],
      category,
      ingredients: ingredients ? safeParse(ingredients) : [],
      restaurant: restaurantId,
      image: req.file ? req.file.path : ""
    });

    if (req.io) req.io.to(restaurantId).emit("menu_updated");
    res.status(201).json({ status: "success", data: { product: newProduct } });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

app.get("/api/v1/products/restaurant/:restaurantId", protect, restrictTo("owner", "admin"), async (req, res) => {
  try {
    // الترتيب حسب sortOrder تصاعدي، ثم الأحدث
    const products = await Product.find({ restaurant: req.params.restaurantId }).populate("ingredients.stockItem").sort("sortOrder -createdAt");
    res.status(200).json({ status: "success", data: { products } });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// مسار جديد: إعادة ترتيب المنتجات
app.patch("/api/v1/products/reorder", protect, restrictTo("owner", "admin"), async (req, res) => {
  try {
    const { order } = req.body; // Expects [{id: "...", sortOrder: 1}, ...]
    if (!order || !Array.isArray(order)) return res.status(400).json({ message: "Invalid data" });

    const operations = order.map((item) => ({
      updateOne: {
        filter: { _id: item.id },
        update: { sortOrder: item.sortOrder },
      },
    }));

    await Product.bulkWrite(operations);
    res.status(200).json({ status: "success" });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

app.delete("/api/v1/products/:id", protect, async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ message: "المنتج غير موجود" });
    // Verify Ownership
    const restaurant = await Restaurant.findOne({ _id: product.restaurant, owner: req.user._id });
    if (!restaurant && req.user.role !== "admin") return res.status(403).json({ message: "غير مصرح" });

    await Product.findByIdAndDelete(req.params.id);
    if (req.io) req.io.to(product.restaurant.toString()).emit("menu_updated");
    res.status(204).json({ status: "success" });
  } catch (err) { res.status(400).json({ message: err.message }); }
});

app.patch("/api/v1/products/:id", protect, upload.single('image'), async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ message: "المنتج غير موجود" });
    const restaurant = await Restaurant.findOne({ _id: product.restaurant, owner: req.user._id });
    if (!restaurant && req.user.role !== "admin") return res.status(403).json({ message: "غير مصرح" });

    const { name, description, price, oldPrice, sizes, category, ingredients } = req.body;
    
    const safeParse = (val) => {
      try { return typeof val === 'string' ? JSON.parse(val) : val; } catch (e) { return val; }
    };

    let updateData = {};
    if (name) updateData.name = safeParse(name);
    if (description) updateData.description = safeParse(description);
    if (price !== undefined) updateData.price = Number(price);
    if (oldPrice !== undefined) updateData.oldPrice = Number(oldPrice);
    if (category) updateData.category = category;
    
    if (req.user.hasStock || (req.user.role === "owner" && req.user.hasStock)) {
      if (ingredients) updateData.ingredients = safeParse(ingredients) || [];
    }
    if (sizes) updateData.sizes = safeParse(sizes) || [];
    if (req.file) updateData.image = req.file.path;
    
    // ✅ إصلاح: السماح بتحديث حالة التوفر عبر هذا المسار
    if (req.body.isAvailable !== undefined) updateData.isAvailable = req.body.isAvailable;

    const updatedProduct = await Product.findByIdAndUpdate(req.params.id, updateData, { new: true });
    if (updatedProduct && req.io) {
      req.io.to(updatedProduct.restaurant.toString()).emit("menu_updated");
    }
    res.status(200).json({ status: "success", data: { product: updatedProduct } });
  } catch (err) { res.status(400).json({ message: err.message }); }
});

app.patch("/api/v1/products/toggle/:id", protect, async (req, res) => {
    try {
        const product = await Product.findById(req.params.id);
        if(!product) return res.status(404).json({message: "Not found"});
        product.isAvailable = !product.isAvailable;
        await product.save();
        if (req.io) req.io.to(product.restaurant.toString()).emit("menu_updated");
        res.status(200).json({ status: "success", data: { product } });
    } catch(err) { res.status(400).json({ message: err.message }); }
});

// ---------------- CATEGORY ROUTES ----------------
app.post("/api/v1/categories", protect, restrictTo("owner", "admin"), upload.single('image'), async (req, res) => {
  try {
    const { name, restaurantId } = req.body;
    const count = await Category.countDocuments({ restaurant: restaurantId });
    const newCategory = await Category.create({ name, sortOrder: count + 1, image: req.file ? req.file.path : "", restaurant: restaurantId });
    if (req.io) req.io.to(restaurantId).emit("menu_updated");
    res.status(201).json({ status: "success", data: { category: newCategory } });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// مسار جديد: إضافة أقسام بالجملة
app.post("/api/v1/categories/bulk", protect, restrictTo("owner", "admin"), async (req, res) => {
  try {
    const { names, restaurantId } = req.body;
    if (!names || !Array.isArray(names)) return res.status(400).json({ message: "Invalid data" });
    
    const startCount = await Category.countDocuments({ restaurant: restaurantId });
    const docs = names.map((name, index) => ({ 
      name, 
      restaurant: restaurantId,
      sortOrder: startCount + index + 1
    }));
    
    await Category.insertMany(docs);
    if (req.io) req.io.to(restaurantId).emit("menu_updated");
    res.status(201).json({ status: "success", count: docs.length });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// مسار جديد: إعادة ترتيب الأقسام
app.patch("/api/v1/categories/reorder", protect, restrictTo("owner", "admin"), async (req, res) => {
  try {
    const { order } = req.body; 
    const operations = order.map((item) => ({
      updateOne: {
        filter: { _id: item.id },
        update: { sortOrder: item.sortOrder },
      },
    }));
    await Category.bulkWrite(operations);
    res.status(200).json({ status: "success" });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

app.get("/api/v1/categories/:restaurantId", async (req, res) => {
  try {
    // الترتيب حسب sortOrder
    const categories = await Category.find({ restaurant: req.params.restaurantId }).sort("sortOrder createdAt");
    const categoriesWithCounts = await Promise.all(categories.map(async (cat) => {
      const count = await Product.countDocuments({ category: cat.name, restaurant: req.params.restaurantId });
      return { ...cat.toObject(), productCount: count };
    }));
    const totalProducts = await Product.countDocuments({ restaurant: req.params.restaurantId });
    res.status(200).json({ status: "success", data: { categories: categoriesWithCounts, stats: { totalCats: categories.length, totalProds: totalProducts } } });
  } catch (err) { res.status(400).json({ message: err.message }); }
});

app.delete("/api/v1/categories/:id", protect, restrictTo("owner", "admin"), async (req, res) => {
  try {
    const category = await Category.findByIdAndDelete(req.params.id);
    if (!category) return res.status(404).json({ message: "القسم غير موجود" });
    await Product.deleteMany({ category: category.name, restaurant: category.restaurant });
    if (req.io) req.io.to(category.restaurant.toString()).emit("menu_updated");
    res.status(204).json({ status: "success" });
  } catch (err) { res.status(400).json({ message: err.message }); }
});

app.patch("/api/v1/categories/:id", protect, restrictTo("owner", "admin"), upload.single('image'), async (req, res) => {
  try {
    const updateData = { name: req.body.name };
    if (req.file) updateData.image = req.file.path;
    const updatedCategory = await Category.findByIdAndUpdate(req.params.id, updateData, { new: true });
    if (req.io) req.io.to(updatedCategory.restaurant.toString()).emit("menu_updated");
    res.status(200).json({ status: "success", data: { category: updatedCategory } });
  } catch (err) { res.status(400).json({ message: err.message }); }
});

// ---------------- ORDER ROUTES ----------------
const checkOrderPermission = async (user, restaurantId) => {
  if (user.role === "admin") return true;
  if (user.role === "owner") {
    const isOwner = await Restaurant.exists({ _id: restaurantId, owner: user._id });
    return !!isOwner;
  }
  return user.restaurant && user.restaurant.toString() === restaurantId.toString();
};

// --- مسار إلغاء الطلب (جديد) ---
app.patch("/api/v1/orders/:id/cancel", async (req, res) => {
  try {
    const order = await Order.findOne({ _id: req.params.id, status: "pending" });
    if (!order) return res.status(400).json({ message: "عذراً، الطلب دخل مرحلة التحضير ولا يمكن إلغاؤه الآن" });

    order.status = "canceled";
    await order.save();

    // تنبيه المطعم (الأدمن والمطبخ)
    if (req.io) {
      req.io.to(order.restaurant.toString()).emit("order-updated", order);
      req.io.to(order.restaurant.toString()).emit("order_cancelled_alert", order); // حدث خاص للتنبيه
    }
    
    res.status(200).json({ status: "success", message: "تم إلغاء الطلب بنجاح" });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

app.post("/api/v1/orders", async (req, res) => {
  try {
    const { restaurantId, tableNumber, items, subTotal, taxAmount, serviceAmount, couponCode, discountAmount, totalPrice } = req.body;
    if (couponCode) {
      await Coupon.findOneAndUpdate({ code: couponCode, restaurant: restaurantId }, { $inc: { usedCount: 1 } });
    }
    const lastOrder = await Order.findOne({ restaurant: restaurantId }).sort({ orderNum: -1 });
    const nextOrderNum = lastOrder && lastOrder.orderNum ? lastOrder.orderNum + 1 : 1;

    const newOrder = await Order.create({
      restaurant: restaurantId, tableNumber, orderNum: nextOrderNum, items,
      subTotal, taxAmount, serviceAmount, couponCode, discountAmount, totalPrice, status: 'pending'
    });

    if (req.io) req.io.to(restaurantId).emit("new-order", newOrder);
    res.status(201).json({ status: "success", data: { order: newOrder } });
  } catch (err) { res.status(400).json({ message: err.message }); }
});

app.get("/api/v1/orders/active/:restaurantId", protect, async (req, res) => {
  try {
    const hasAccess = await checkOrderPermission(req.user, req.params.restaurantId);
    if (!hasAccess) return res.status(403).json({ message: "ليس لديك صلاحية لرؤية طلبات هذا المطعم" });

    const orders = await Order.find({
      restaurant: req.params.restaurantId,
      status: { $in: ["pending", "preparing"] },
    }).sort({ createdAt: 1 }); // ترتيب تصاعدي حسب الوقت (الأقدم أولاً للمطبخ)

    res.status(200).json({ status: "success", data: { orders } });
  } catch (err) {
    res.status(400).json({ status: "fail", message: err.message });
  }
});

app.patch("/api/v1/orders/status/:id", protect, restrictTo("owner", "cashier", "kitchen", "admin"), async (req, res) => {
  try {
    const { status } = req.body;
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ message: "الطلب غير موجود" });

    const hasAccess = await checkOrderPermission(req.user, order.restaurant);
    if (!hasAccess) return res.status(403).json({ message: "ليس لديك صلاحية لتحديث هذا الطلب" });

    // Stock deduction Logic (Improved)
    if (status === 'completed' && order.status !== 'completed') {
      for (const item of order.items) {
        let product;
        // المحاولة الأولى: البحث عن طريق ID إذا كان موجوداً
        if (item.productId) {
          product = await Product.findById(item.productId).populate('ingredients.stockItem');
        }
        // المحاولة الثانية: البحث بالاسم كخطة بديلة
        if (!product) {
          product = await Product.findOne({
            $or: [{ 'name.ar': item.name }, { 'name.en': item.name }],
            restaurant: order.restaurant
          }).populate('ingredients.stockItem');
        }

        if (product && product.ingredients) {
          for (const ing of product.ingredients) {
            if(ing.stockItem && ing.stockItem._id) {
              const deductionAmount = ing.quantity * item.qty;
              await StockItem.findByIdAndUpdate(ing.stockItem._id, { $inc: { quantity: -deductionAmount } });
              await StockLog.create({
                restaurant: order.restaurant, stockItem: ing.stockItem._id, itemName: ing.stockItem.name,
                changeAmount: -deductionAmount, type: 'consumption', orderId: order._id
              });
            }
          }
        } else {
          console.warn(`Warning: Product not found for stock deduction: ${item.name}`);
        }
      }
    }
    order.status = status;
    await order.save();
    if (req.io) {
      req.io.to(order.restaurant.toString()).emit("order-updated", order);
      req.io.to(order._id.toString()).emit("status-changed", status);
    }
    res.status(200).json({ status: "success", data: { order } });
  } catch (err) { res.status(400).json({ message: err.message }); }
});

app.get("/api/v1/orders/history/:restaurantId", protect, async (req, res) => {
  try {
    const hasAccess = await checkOrderPermission(req.user, req.params.restaurantId);
    if (!hasAccess) return res.status(403).json({ message: "ليس لديك صلاحية" });

    let query = {
      restaurant: req.params.restaurantId,
      status: { $in: ["completed", "canceled"] },
    };

    // منطق الكاشير: يرى طلبات اليوم فقط
    if (req.user.role === "cashier") {
      const startOfToday = new Date();
      startOfToday.setHours(0, 0, 0, 0);
      query.createdAt = { $gte: startOfToday };
    } 
    // منطق الأونر والأدمن: فلترة بالتاريخ والبحث
    else if (req.user.role === "owner" || req.user.role === "admin") {
      if (req.query.startDate && req.query.endDate) {
        query.createdAt = {
          $gte: new Date(req.query.startDate),
          $lte: new Date(new Date(req.query.endDate).setHours(23, 59, 59, 999)), // إصلاح نهاية اليوم
        };
      }

      if (req.query.search) {
        const searchVal = req.query.search;
        if (!isNaN(searchVal)) {
          query.$or = [
            { orderNum: Number(searchVal) },
            { tableNumber: { $regex: searchVal, $options: "i" } },
          ];
        } else {
          query.tableNumber = { $regex: searchVal, $options: "i" };
        }
      }
    }

    const orders = await Order.find(query).sort({ createdAt: -1 });

    // حساب إجمالي المبيعات باستخدام Aggregation لأداء أفضل
    const stats = await Order.aggregate([
      {
        $match: {
          ...query,
          restaurant: new mongoose.Types.ObjectId(req.params.restaurantId),
          status: "completed",
        },
      },
      {
        $group: {
          _id: null,
          totalSales: { $sum: "$totalPrice" },
        },
      },
    ]);

    const totalSales = stats.length > 0 ? stats[0].totalSales : 0;

    res.status(200).json({ status: "success", data: { orders, totalSales } });
  } catch (err) {
    res.status(400).json({ status: "fail", message: err.message });
  }
});

app.get("/api/v1/orders/recent-completed/:restaurantId", protect, async (req, res) => {
    try {
      const hasAccess = await checkOrderPermission(req.user, req.params.restaurantId);
      if (!hasAccess) return res.status(403).json({ message: "ليس لديك صلاحية" });

      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
      const orders = await Order.find({
        restaurant: req.params.restaurantId,
        status: "completed",
        updatedAt: { $gte: twoHoursAgo },
      }).sort({ updatedAt: -1 });

      res.status(200).json({ status: "success", data: { orders } });
    } catch (err) {
      res.status(400).json({ status: "fail", message: err.message });
    }
});

// ---------------- COUPON ROUTES ----------------
app.post("/api/v1/coupons/:restaurantId", protect, async (req, res) => {
  try {
    const existing = await Coupon.findOne({ code: req.body.code.toUpperCase(), restaurant: req.params.restaurantId });
    if (existing) return res.status(400).json({ message: "الكود موجود" });
    const newCoupon = await Coupon.create({ ...req.body, restaurant: req.params.restaurantId });
    res.status(201).json({ status: "success", data: { coupon: newCoupon } });
  } catch (err) { res.status(400).json({ message: err.message }); }
});

app.get("/api/v1/coupons/:restaurantId", protect, async (req, res) => {
  try {
    const coupons = await Coupon.find({ restaurant: req.params.restaurantId }).sort("-createdAt");
    res.status(200).json({ status: "success", data: { coupons } });
  } catch (err) { res.status(400).json({ message: err.message }); }
});

app.delete("/api/v1/coupons/:id", protect, async (req, res) => {
    try { await Coupon.findByIdAndDelete(req.params.id); res.status(200).json({ status: "success" }); }
    catch(err) { res.status(400).json({ message: err.message }); }
});

app.post("/api/v1/coupons/validate/:restaurantId", async (req, res) => {
  try {
    const { code, orderTotal } = req.body;
    const coupon = await Coupon.findOne({ code: code.toUpperCase(), restaurant: req.params.restaurantId, isActive: true });
    if (!coupon) return res.status(404).json({ message: "كود غير صحيح" });
    if (coupon.expiresAt && new Date() > coupon.expiresAt) return res.status(400).json({ message: "الكوبون منتهي" });
    if (coupon.usedCount >= coupon.usageLimit) return res.status(400).json({ message: "انتهى عدد مرات الاستخدام" });
    if (orderTotal < coupon.minOrderVal) return res.status(400).json({ message: `الحد الأدنى ${coupon.minOrderVal}` });

    let discount = coupon.discountType === "percent" ? (orderTotal * coupon.value) / 100 : coupon.value;
    if (coupon.discountType === "percent" && coupon.maxDiscount && discount > coupon.maxDiscount) discount = coupon.maxDiscount;

    res.status(200).json({ status: "success", data: { discount, code: coupon.code, couponId: coupon._id } });
  } catch (err) { res.status(400).json({ message: err.message }); }
});
// ---------------- STOCK ROUTES ----------------
const restrictToStockFeature = (req, res, next) => {
  if (req.user.role === "owner" && !req.user.hasStock) {
    return res.status(403).json({
      status: "fail",
      message: "هذه الميزة غير مفعلة في باقتك، يرجى التواصل مع الإدارة.",
    });
  }
  next();
};

// 1. مسار اللوجز (يجب أن يكون الأول لأنه محدد)
app.get("/api/v1/stock/logs", protect, restrictToStockFeature, async (req, res) => {
  try {
    const { restaurantId, startDate, endDate } = req.query;
    let query = { restaurant: restaurantId };
    if (startDate && endDate) {
      const end = new Date(endDate); end.setHours(23, 59, 59, 999);
      query.date = { $gte: new Date(startDate), $lte: end };
    }
    const logs = await StockLog.find(query).sort("-date");
    res.status(200).json({ status: "success", data: { logs } });
  } catch (err) { res.status(400).json({ message: err.message }); }
});

// 2. مسارات الإضافة والتعديل والحذف
app.post("/api/v1/stock", protect, restrictToStockFeature, async (req, res) => {
  try {
    const item = await StockItem.create({ ...req.body, restaurant: req.body.restaurantId });
    res.status(201).json({ status: "success", data: item });
  } catch (err) { res.status(400).json({ message: err.message }); }
});

app.post("/api/v1/stock/:id/adjust", protect, restrictToStockFeature, async (req, res) => {
  try {
    const { amount, type } = req.body;
    const item = await StockItem.findById(req.params.id);
    item.quantity += amount;
    await item.save();
    await StockLog.create({ restaurant: item.restaurant, stockItem: item._id, itemName: item.name, changeAmount: amount, type });
    res.status(200).json({ status: "success", data: item });
  } catch (err) { res.status(400).json({ message: err.message }); }
});

app.delete("/api/v1/stock/:id", protect, restrictToStockFeature, async (req, res) => {
    try { await StockItem.findByIdAndDelete(req.params.id); res.status(204).json({ status: "success" }); }
    catch(err) { res.status(400).json({ message: err.message }); }
});

// 3. مسار جلب العناصر بالـ ID (يجب أن يكون الأخير لأنه يحتوي على متغير :restaurantId)
app.get("/api/v1/stock/:restaurantId", protect, restrictToStockFeature, async (req, res) => {
  try {
    const items = await StockItem.find({ restaurant: req.params.restaurantId });
    res.status(200).json({ status: "success", data: { items } });
  } catch (err) { res.status(400).json({ message: err.message }); }
});

// ---------------- SALES ROUTES ----------------
app.post("/api/v1/sales/join", upload.single('image'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: "يرجى رفع صورة" });
    const newRequest = await SalesRequest.create({ name: req.body.name, phone: req.body.phone, walletNumber: req.body.walletNumber, image: req.file.path });
    if (req.io) req.io.emit("new-sales-request", newRequest);
    res.status(201).json({ status: "success", data: newRequest });
  } catch (err) { res.status(400).json({ message: err.message }); }
});

app.get("/api/v1/sales/requests", protect, restrictTo("admin"), async (req, res) => {
  try { const requests = await SalesRequest.find().sort({ createdAt: -1 }); res.status(200).json({ status: "success", data: requests }); }
  catch(err) { res.status(400).json({ message: err.message }); }
});

// --- Sales Management Routes (New System) ---

// 1. إنشاء حساب سيلز جديد (بواسطة الأدمن)
app.post("/api/v1/users/create-sales-agent", protect, restrictTo("admin"), async (req, res) => {
  try {
    const { name, email, password, phone } = req.body;
    
    // التأكد من أن الايميل ينتهي بـ @sales.com (اختياري، للترتيب فقط)
    // if (!email.includes("@sales.com")) return res.status(400).json({ message: "يفضل أن يكون إيميل السيلز @sales.com" });

    const hashedPassword = await bcrypt.hash(password, 12);
    const newSales = await User.create({
      name,
      email,
      password: hashedPassword,
      phone,
      role: "sales",
      active: true
    });

    res.status(201).json({ status: "success", data: { user: newSales } });
  } catch (err) {
    res.status(400).json({ message: err.code === 11000 ? "هذا البريد مستخدم بالفعل" : err.message });
  }
});

// 2. إحصائيات السيلز (Leaderboard) - تم التعديل لإرجاع كل البيانات
app.get("/api/v1/admin/sales-stats", protect, restrictTo("admin"), async (req, res) => {
  try {
    // نجلب كل مستخدمين السيلز أولاً
    const salesAgents = await User.find({ role: "sales" });
    
    const stats = await Promise.all(salesAgents.map(async (agent) => {
      // البحث عن العملاء الذين أنشأهم هذا السيلز
      const clients = await User.find({ createdBy: agent._id });
      
      const totalClients = clients.length;
      const activeClients = clients.filter(c => c.active && !c.isTrial).length; // مفعل وحقيقي
      const trialClients = clients.filter(c => c.isTrial).length;
      
      return {
        _id: agent._id,
        salesName: agent.name,
        salesEmail: agent.email,
        salesPhone: agent.phone,
        totalClients,
        activeClients,
        trialClients,
        clientsList: clients.map(c => ({
            name: c.name,
            email: c.email,
            phone: c.phone,
            isTrial: c.isTrial,
            active: c.active,
            createdAt: c.createdAt
        }))
      };
    }));

    // ترتيب التنازلي حسب عدد العملاء النشطين
    stats.sort((a, b) => b.activeClients - a.activeClients);

    res.status(200).json({ status: "success", data: { stats } });
  } catch (err) { res.status(400).json({ message: err.message }); }
});

// 3. السيلز ينشئ عميل جديد (كما هو، لا تغيير في المنطق لكن تأكد من وجوده)
app.post("/api/v1/sales/create-client", protect, restrictTo("sales", "admin"), async (req, res) => {
  try {
    const { name, email, password, phone, restaurantName, slug } = req.body;
    
    const trialEnds = new Date();
    trialEnds.setHours(trialEnds.getHours() + 24);

    const hashedPassword = await bcrypt.hash(password, 12);
    
    const newUser = await User.create({
      name,
      email,
      password: hashedPassword,
      phone,
      role: "owner",
      isTrial: true,
      trialExpires: trialEnds,
      createdBy: req.user._id,
      productLimit: 75,
      hasStock: false
    });

    const newRestaurant = await Restaurant.create({
      restaurantName,
      slug,
      owner: newUser._id,
      contactInfo: { phone, whatsapp: phone, address: "العنوان الافتراضي" }
    });

    res.status(201).json({ status: "success", data: { user: newUser, restaurant: newRestaurant } });
  } catch (err) {
    res.status(400).json({ message: err.code === 11000 ? "البيانات (الايميل أو الرابط) مكررة" : err.message });
  }
});

// ✅ تم إضافة سطر الراوت الناقص هنا
app.patch("/api/v1/sales/requests/:id", protect, restrictTo("admin"), async (req, res) => {
  try {
    const { status, email, password } = req.body;
    const request = await SalesRequest.findByIdAndUpdate(req.params.id, { status }, { new: true });
    
    // إذا تمت الموافقة، ننشئ له حساب sales
    if (status === "approved" && email && password) {
      const hashedPassword = await bcrypt.hash(password, 12);
      await User.create({
        name: request.name,
        email: email,
        password: hashedPassword,
        phone: request.phone,
        role: "sales",
        active: true
      });
    }

    res.status(200).json({ status: "success", data: request });
  } catch(err) { res.status(400).json({ message: err.message }); }
});

// حذف طلب انضمام سيلز
app.delete("/api/v1/sales/requests/:id", protect, restrictTo("admin"), async (req, res) => {
    try { 
        await SalesRequest.findByIdAndDelete(req.params.id); 
        res.status(200).json({ status: "success", message: "تم حذف الطلب" }); 
    }
    catch(err) { res.status(400).json({ message: err.message }); }
});

// حذف وكيل مبيعات نهائياً (تم التصحيح)
app.delete("/api/v1/sales/:id", protect, restrictTo("admin"), async (req, res) => {
    try {
        // 1. نبدأ بحذف الطلب أولاً لأن الـ ID القادم من الفرونت هو ID الطلب
        const request = await SalesRequest.findByIdAndDelete(req.params.id);
        
        let userDeleted = null;

        if (request) {
            // 2. إذا وجدنا الطلب، نبحث عن حساب السيلز المرتبط به (عن طريق رقم الهاتف) ونحذفه
            // شرط role: 'sales' مهم لعدم حذف عملاء عاديين بالخطأ
            userDeleted = await User.findOneAndDelete({ phone: request.phone, role: 'sales' });
        } else {
            // 3. احتياطياً: إذا لم نجد طلب، نحاول حذف المستخدم مباشرة بافتراض أن الـ ID للمستخدم
            userDeleted = await User.findOneAndDelete({ _id: req.params.id, role: 'sales' });
        }

        // إذا لم يتم حذف أي شيء (لا طلب ولا مستخدم)
        if (!request && !userDeleted) {
            return res.status(404).json({ status: "fail", message: "الوكيل أو الطلب غير موجود" });
        }

        res.status(200).json({ status: "success", message: "تم حذف الوكيل والبيانات المرتبطة بنجاح" });
    } catch (err) {
        res.status(400).json({ status: "error", message: err.message });
    }
});

// --- Sales Dashboard Routes (For Sales Role) ---

// 1. السيلز ينشئ عميل جديد (حساب تجريبي 24 ساعة)
app.post("/api/v1/sales/create-client", protect, restrictTo("sales", "admin"), async (req, res) => {
  try {
    const { name, email, password, phone, restaurantName, slug } = req.body;
    
    // إعداد انتهاء التجربة بعد 24 ساعة
    const trialEnds = new Date();
    trialEnds.setHours(trialEnds.getHours() + 24);

    const hashedPassword = await bcrypt.hash(password, 12);
    
    // 1. إنشاء المستخدم (Owner)
    const newUser = await User.create({
      name,
      email,
      password: hashedPassword,
      phone,
      role: "owner",
      isTrial: true,
      trialExpires: trialEnds,
      createdBy: req.user._id, // ربط العميل بالسيلز
      productLimit: 75,
      hasStock: false
    });

    // 2. إنشاء المطعم للمستخدم
    const newRestaurant = await Restaurant.create({
      restaurantName,
      slug,
      owner: newUser._id,
      contactInfo: { phone, whatsapp: phone, address: "العنوان الافتراضي" }
    });

    res.status(201).json({ status: "success", data: { user: newUser, restaurant: newRestaurant } });
  } catch (err) {
    res.status(400).json({ message: err.code === 11000 ? "البيانات (الايميل أو الرابط) مكررة" : err.message });
  }
});

// 2. إحصائيات السيلز (للأدمن)
app.get("/api/v1/admin/sales-stats", protect, restrictTo("admin"), async (req, res) => {
  try {
    const stats = await User.aggregate([
      { $match: { role: "owner", createdBy: { $exists: true } } }, // فقط العملاء الذين تم إنشاؤهم بواسطة سيلز
      {
        $group: {
          _id: "$createdBy",
          totalClients: { $sum: 1 },
          activeClients: { $sum: { $cond: [{ $eq: ["$active", true] }, 1, 0] } },
          trialClients: { $sum: { $cond: [{ $eq: ["$isTrial", true] }, 1, 0] } }
        }
      },
      {
        $lookup: {
          from: "users",
          localField: "_id",
          foreignField: "_id",
          as: "salesInfo"
        }
      },
      {
        $project: {
          salesName: { $arrayElemAt: ["$salesInfo.name", 0] },
          salesEmail: { $arrayElemAt: ["$salesInfo.email", 0] },
          totalClients: 1,
          activeClients: 1,
          trialClients: 1
        }
      },
      { $sort: { totalClients: -1 } }
    ]);
    res.status(200).json({ status: "success", data: { stats } });
  } catch (err) { res.status(400).json({ message: err.message }); }
});

// ---------------- AI ROUTES ----------------
app.post("/api/v1/ai/process-menu", protect, restrictTo("admin"), memoryUpload.array("menuImages", 10), async (req, res) => {
  try {
    const { ownerId } = req.body;
    if (!req.files || req.files.length === 0) throw new Error("يرجى رفع صور المنيو");
    const restaurant = await Restaurant.findOne({ owner: ownerId });
    if (!restaurant) throw new Error("لا يوجد مطعم لهذا المالك");
    const restaurantId = restaurant._id;

    const model = genAI.getGenerativeModel({ model: "gemma-3-27b-it" });
    const imageParts = req.files.map((file) => ({
      inlineData: { data: file.buffer.toString("base64"), mimeType: file.mimetype },
    }));

    const prompt = `
      حلل صور المنيو هذه واستخرج كل الأكلات والمشروبات بدقة. 
      أريد النتيجة كـ JSON Array فقط بهذا التنسيق:
      [
        {
          "category": "اسم القسم بالعربي",
          "products": [
            {
              "name": "اسم المنتج", 
              "price": 100, 
              "description": "وصف بسيط للمكونات",
              "imageSearchTerm": "وصف بالانجليزية للمنتج لاستخدامه في البحث عن صورة مناسبة له"
            }
          ]
        }
      ]
      ملاحظة: 
      1. استخرج الأسعار كأرقام فقط. 
      2. حقل imageSearchTerm يجب أن يكون وصفاً دقيقاً بالإنجليزية (مثل: "Grilled chicken burger with cheese and lettuce").
    `;

    const result = await model.generateContent([prompt, ...imageParts]);
    const response = await result.response;
    const rawText = response.text();
    const jsonMatch = rawText.match(/\[[\s\S]*\]/);
    const jsonText = jsonMatch ? jsonMatch[0] : rawText.replace(/```json|```/g, "");
    
    const menuData = JSON.parse(jsonText);
    for (const item of menuData) {
      let category = await Category.findOne({ name: item.category, restaurant: restaurantId });
      if (!category) category = await Category.create({ name: item.category, restaurant: restaurantId });

      const productPromises = item.products.map((p) => {
        return Product.create({
          name: { ar: p.name, en: p.name }, description: { ar: p.description, en: "" },
          price: p.price, category: category.name, restaurant: restaurantId, image: ""
        });
      });
      await Promise.all(productPromises);
    }
    if (req.io) req.io.to(restaurantId).emit("menu_updated");
    res.status(200).json({ status: "success", message: "تم رفع المنيو بالكامل بنجاح" });
  } catch (err) {
    let errorMessage = err.message;
    if (err.message.includes("503") || err.message.includes("overloaded")) {
      errorMessage = "سيرفر Gemma مشغول حالياً، يرجى المحاولة مرة أخرى بعد 10 ثوانٍ ⏳";
    }
    res.status(400).json({ status: "fail", message: errorMessage });
  }
});

// ==========================================
// 5. General & Static Routes
// ==========================================

// Static HTML Pages
app.get("/menu/:slug", (req, res) => res.sendFile(path.join(__dirname, "public", "menu.html")));
app.get("/owner", (req, res) => res.sendFile(path.join(__dirname, "public", "admin.html")));
app.get("/super-admin", (req, res) => res.sendFile(path.join(__dirname, "public", "super.html")));
app.get("/sales-dashboard", (req, res) => res.sendFile(path.join(__dirname, "public", "sales.html")));
app.get("/login", (req, res) => res.sendFile(path.join(__dirname, "public", "login.html")));
app.get("/join-sales", (req, res) => res.sendFile(path.join(__dirname, "public", "sales-register.html")));
app.get("/promo", (req, res) => res.sendFile(path.join(__dirname, "public", "promo.html")));
app.get("/", (req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));

// Menu Request Handling (Landing Page)
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
    subscriptions.forEach((sub) => webPush.sendNotification(sub, payload).catch(e => console.error(e)));

    res.status(201).json({ status: "success", data: newRequest });
  } catch (err) { res.status(400).json({ status: "error", message: err.message }); }
});

app.get("/api/v1/requests", async (req, res) => {
    try { const requests = await MenuRequest.find().sort({ createdAt: -1 }); res.json({ status: "success", data: requests }); }
    catch(err) { res.status(500).json({ status: "error", message: err.message }); }
});

app.delete("/api/v1/requests", async (req, res) => {
    try { await MenuRequest.deleteMany({ _id: { $in: req.body.ids } }); res.json({ status: "success", message: "Deleted" }); }
    catch(err) { res.status(500).json({ status: "error", message: err.message }); }
});

// Subscriptions
app.post("/api/v1/subscribe", async (req, res) => {
  await PushSubscription.findOneAndUpdate({ endpoint: req.body.endpoint }, req.body, { upsert: true });
  res.status(201).json({ status: "success" });
});

// أضف هذا المسار في server.js تحت مسارات الـ Sales
app.get("/api/v1/sales/my-clients", protect, restrictTo("sales"), async (req, res) => {
  try {
    const clients = await User.find({ createdBy: req.user._id }).sort("-createdAt");
    res.status(200).json({ status: "success", data: { clients } });
  } catch (err) { res.status(400).json({ message: err.message }); }
});


app.get("/api/v1/vapid-key", (req, res) => res.json({ publicKey: publicVapidKey }));

// Back handling
app.get(/.*/, (req, res) => {
  const backUrl = req.header("Referer") || "/";
  if (backUrl.includes(req.originalUrl)) return res.redirect("/");
  res.redirect(backUrl);
});

// Error Handling
app.use((err, req, res, next) => {
  console.error("🔥 Error Log:", err);
  res.status(500).json({ status: "error", message: err.message || "حدث خطأ غير متوقع في السيرفر" });
});

// ==========================================
// 6. DB Connection & Server Start
// ==========================================
mongoose
  .connect(process.env.DATABASE_URL)
  .then(() => console.log("✅ Connected to MongoDB Successfully!"))
  .catch((err) => console.log("❌ Database Connection Error:", err));

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`✅ Server is running on port ${PORT}`);
});