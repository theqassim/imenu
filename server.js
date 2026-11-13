require("dotenv").config();
const express = require("express");
const { createClient } = require('@supabase/supabase-js');
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);
const cookieParser = require("cookie-parser");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const multer = require("multer");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const webPush = require("web-push");
const { Server } = require("socket.io");
const http = require("http");
const cron = require("node-cron");


cron.schedule("0 * * * *", async () => {
  console.log("⏳ Checking for expired trial accounts...");
  try {
    const { data: expiredUsers, error: fetchError } = await supabase
      .from('users')
      .select('*')
      .eq('isTrial', true)
      .lt('trialExpires', new Date().toISOString());

    if (fetchError) throw fetchError;

    for (const user of expiredUsers || []) {
      console.log(`🗑️ Deleting expired trial user: ${user.email}`);
      
      if (user.role === 'owner') {
        const { data: restaurant } = await supabase.from('restaurants').select('_id').eq('owner', user._id).single();
        if (restaurant) {
          await supabase.from('products').delete().eq('restaurant', restaurant._id);
          await supabase.from('categories').delete().eq('restaurant', restaurant._id);
          await supabase.from('orders').delete().eq('restaurant', restaurant._id);
          await supabase.from('coupons').delete().eq('restaurant', restaurant._id);
          await supabase.from('stock_items').delete().eq('restaurant', restaurant._id);
          await supabase.from('stock_logs').delete().eq('restaurant', restaurant._id);
          await supabase.from('users').delete().eq('restaurant', restaurant._id);
          await supabase.from('restaurants').delete().eq('_id', restaurant._id);
        }
      }
      await supabase.from('users').delete().eq('_id', user._id);
    }
    if(expiredUsers && expiredUsers.length > 0) console.log(`✅ Cleaned up ${expiredUsers.length} expired accounts.`);
  } catch (err) {
    console.error("❌ Error in Cron Job:", err);
  }
});

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

const publicVapidKey = process.env.WEB_PUSH_PUBLIC;
const privateVapidKey = process.env.WEB_PUSH_PRIVATE;
if (publicVapidKey && privateVapidKey) {
  webPush.setVapidDetails("mailto:admin@imenueg.com", publicVapidKey, privateVapidKey);
} else {
  console.warn("⚠️ WEB_PUSH keys are missing in .env. Notifications will not work.");
}

const cloudinary = require("cloudinary").v2;
const { CloudinaryStorage } = require("multer-storage-cloudinary");

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: "smart-menu-uploads",
    allowed_formats: ["jpg", "png", "jpeg", "webp"],
  },
});

const upload = multer({ storage: storage });
const memoryUpload = multer({ storage: multer.memoryStorage() });

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

app.use((req, res, next) => {
  req.io = io;
  next();
});
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(cookieParser());
app.use(cors());
app.use(express.static("public"));
app.use('/uploads', express.static('public/uploads'));

io.on("connection", (socket) => {
  socket.on("join-restaurant", (restaurantId) => {
    socket.join(restaurantId);
  });
  socket.on("join-order", (orderId) => {
    socket.join(orderId);
  });
});

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
    const { data: currentUser, error } = await supabase
      .from('users')
      .select('*')
      .eq('_id', decoded.id)
      .single();
      
    if (error || !currentUser) return res.status(401).json({ message: "المستخدم لم يعد موجوداً." });
    if (!currentUser) return res.status(401).json({ message: "المستخدم لم يعد موجوداً." });

    if (currentUser.role === "owner") {
      if (currentUser.isTrial) {
         if (!currentUser.trialExpires) {
             console.log(`⚠️ تنبيه: المستخدم ${currentUser.email} حساب تجريبي بدون تاريخ، جاري التصحيح...`);
             currentUser.trialExpires = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
             await supabase.from('users').update({ trialExpires: currentUser.trialExpires }).eq('_id', currentUser._id);
             console.log(`✅ تم تحديد مهلة جديدة تنتهي في: ${currentUser.trialExpires}`);
         }

         if (new Date() > new Date(currentUser.trialExpires)) {
             console.log("❌ النتيجة: انتهت الفترة -> تم منع الدخول");
             return res.status(403).json({ message: "انتهت الفترة التجريبية للحساب." });
         }
      }

      if (currentUser.subscriptionExpires && new Date() > new Date(currentUser.subscriptionExpires)) {
        currentUser.active = false;
        await supabase.from('users').update({ active: false }).eq('_id', currentUser._id);
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

const protectOptional = async (req, res, next) => {
  let token;
  if (req.headers.authorization && req.headers.authorization.startsWith("Bearer")) {
    token = req.headers.authorization.split(" ")[1];
  }

  if (!token) return next();

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const { data: currentUser, error } = await supabase
      .from('users')
      .select('*')
      .eq('_id', decoded.id)
      .single();
      
    if (error || !currentUser) return res.status(401).json({ message: "المستخدم لم يعد موجوداً." });
    if (currentUser) req.user = currentUser;
    next();
  } catch (err) {
    next();
  }
};

const restrictTo = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ status: "fail", message: "ليس لديك صلاحية." });
    }
    next();
  };
};


app.post("/api/v1/users/signup", async (req, res) => {
  try {
    const {
      name, email, password, passwordConfirm, phone, role, subscriptionExpires, hasStock, hasAccounting, productLimit, allowedSections
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
    
    const { data: newUser, error } = await supabase
      .from('users')
      .insert([{
        name,
        email,
        password: hashedPassword,
        phone,
        role,
        subscriptionExpires: expiryDate,
        hasStock: hasStock === true || hasStock === "true",
        hasAccounting: hasAccounting === true || hasAccounting === "true",
        productLimit: productLimit || 75,
        allowedSections: Array.isArray(allowedSections) && allowedSections.length > 0 ? allowedSections : null,
        active: true
      }])
      .select()
      .single();

    if (error) {
       if (error.code === '23505') throw new Error("البريد مسجل بالفعل");
       throw error;
    }

    createSendToken(newUser, 201, res);
  } catch (err) {
    res.status(400).json({ status: "fail", message: err.message });
  }
});

app.post("/api/v1/users/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ message: "أدخل البريد وكلمة المرور" });

    if (email === process.env.ADMIN_EMAIL && password === process.env.ADMIN_PASSWORD) {
      const superAdminUser = {
        _id: "000000000000000000000000",
        name: "Super Admin",
        email: email,
        role: "admin",
        active: true
      };
      return createSendToken(superAdminUser, 200, res);
    }

    const { data: user, error } = await supabase
      .from('users')
      .select('*')
      .eq('email', email)
      .single();

    if (error || !user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ status: "fail", message: "بيانات الدخول خاطئة" });
    }
    
    if (user.isTrial && user.trialExpires) {
      const nowBuffer = new Date(Date.now() + 60000);
      if (nowBuffer > user.trialExpires) {
        return res.status(403).json({ message: "انتهت الفترة التجريبية للحساب." });
      }
    }

    if (!user.active) {
       if (user.role === "owner" && user.subscriptionExpires && new Date() > user.subscriptionExpires) {
         return res.status(401).json({ message: "انتهى الاشتراك" });
       }
       return res.status(401).json({ message: "الحساب معطل" });
    }

    if (user.role === "cashier" || user.role === "kitchen" || user.role === "waiter") {
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
    
    const { error } = await supabase
      .from('users')
      .update({ password: hashedPassword })
      .eq('_id', req.user._id);

    if (error) throw error;

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

    if (!["cashier", "kitchen", "waiter"].includes(role)) {
      return res.status(400).json({ message: "الدور غير صحيح (يجب أن يكون cashier أو kitchen)" });
    }

    const hashedPassword = await bcrypt.hash(password, 12);
    const { data: newStaff, error } = await supabase.from('users').insert([{
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
    }]).select().single();

    if (error) throw error;
    if (newStaff) delete newStaff.password;

    res.status(201).json({ status: "success", data: { user: newStaff } });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

app.get("/api/v1/users/my-staff", protect, async (req, res) => {
  try {
    const { data: staff, error } = await supabase
      .from('users')
      .select('*') 
      .eq('owner', req.user._id)
      .in('role', ["cashier", "kitchen", "waiter"]);

    if (error) throw error;
    
    const safeStaff = staff.map(user => {
      const { password, ...rest } = user;
      return rest;
    });

    res.status(200).json({ status: "success", data: { staff: safeStaff } });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

app.patch("/api/v1/users/staff/:id", protect, restrictTo("owner"), async (req, res) => {
  try {
    const { data: myRestaurant } = await supabase.from('restaurants').select('_id').eq('owner', req.user._id).single();
    if (!myRestaurant) return res.status(404).json({ message: "لا يوجد مطعم مرتبط بحسابك" });

    const { data: staffMember } = await supabase.from('users').select('_id').eq('_id', req.params.id).eq('restaurant', myRestaurant._id).single();
    if (!staffMember) return res.status(404).json({ message: "الموظف غير موجود أو لا يتبع لمطعمك" });

    const updates = { ...req.body };
    delete updates.restaurant; 
    delete updates.owner;

    if (updates.password && updates.password.trim() !== "") {
      updates.password = await bcrypt.hash(updates.password, 12);
    } else {
      delete updates.password;
    }

    const { data: updatedUser, error } = await supabase
      .from('users')
      .update(updates)
      .eq('_id', req.params.id)
      .select()
      .single();

    if (error) throw error;
    res.status(200).json({ status: "success", data: { user: updatedUser } });
  } catch (err) {
    res.status(400).json({ status: "fail", message: err.message });
  }
});

app.delete("/api/v1/users/staff/:id", protect, restrictTo("owner"), async (req, res) => {
  try {
    const { data: myRestaurant } = await supabase.from('restaurants').select('_id').eq('owner', req.user._id).single();
    if (!myRestaurant) return res.status(404).json({ message: "لا يوجد مطعم مرتبط بحسابك" });

    const { data: staffMember } = await supabase.from('users').select('_id').eq('_id', req.params.id).eq('restaurant', myRestaurant._id).single();
    if (!staffMember) return res.status(404).json({ message: "الموظف غير موجود" });

    const { error } = await supabase.from('users').delete().eq('_id', req.params.id);
    if (error) throw error;

    res.status(200).json({ status: "success", message: "تم الحذف" });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});


app.get("/api/v1/users", protect, restrictTo("admin"), async (req, res) => {
  try {
    const { data: users, error } = await supabase.from('users').select('*');
    if (error) throw error;

    const updatedUsers = await Promise.all(
      users.map(async (user) => {
        if (user.role === "owner" && user.active && user.subscriptionExpires) {
          if (new Date() > new Date(user.subscriptionExpires)) {
            user.active = false;
            await supabase.from('users').update({ active: false }).eq('_id', user._id);
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
    const updates = { ...req.body };
    if (updates.password) delete updates.password;

    if (updates.productLimit !== undefined) updates.productLimit = Number(updates.productLimit);
    if (updates.hasStock !== undefined) updates.hasStock = Boolean(updates.hasStock);
    if (updates.hasAccounting !== undefined) updates.hasAccounting = Boolean(updates.hasAccounting);
    if (updates.allowedSections !== undefined) {
      updates.allowedSections = Array.isArray(updates.allowedSections) && updates.allowedSections.length > 0
        ? updates.allowedSections
        : null;
    }

    if (updates.subscriptionExpires !== undefined) {
      if (updates.subscriptionExpires) {
        const newExpiry = new Date(updates.subscriptionExpires);
        if (!isNaN(newExpiry.getTime())) {
          newExpiry.setHours(23, 59, 59, 999);
          updates.subscriptionExpires = newExpiry.toISOString();
          if (newExpiry > new Date()) updates.active = true;
        } else {
          updates.subscriptionExpires = null;
        }
      } else {
        updates.subscriptionExpires = null;
      }
    }

    const { data: updatedUser, error } = await supabase
      .from('users')
      .update(updates)
      .eq('_id', req.params.id)
      .select()
      .single();
      
    if (error) throw error;
    res.status(200).json({ status: "success", data: { user: updatedUser } });
  } catch (err) {
    res.status(400).json({ status: "fail", message: err.message });
  }
});

app.post("/api/v1/users/impersonate/:userId", protect, restrictTo("admin"), async (req, res) => {
  try {
     const { data: userToImpersonate, error } = await supabase.from('users').select('*').eq('_id', req.params.userId).single();
     if (error || !userToImpersonate) return res.status(404).json({ message: "المستخدم غير موجود" });
     createSendToken(userToImpersonate, 200, res);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

app.patch("/api/v1/users/:id/toggle-status", protect, restrictTo("admin"), async (req, res) => {
  try {
    const { data: user, error: fetchError } = await supabase.from('users').select('active').eq('_id', req.params.id).single();
    if (fetchError || !user) return res.status(404).json({ status: "fail", message: "المستخدم غير موجود" });

    const newStatus = user.active === false ? true : false;
    const { data: updatedUser, error: updateError } = await supabase
      .from('users')
      .update({ active: newStatus })
      .eq('_id', req.params.id)
      .select()
      .single();

    if (updateError) throw updateError;

    res.status(200).json({
      status: "success",
      message: `تم ${updatedUser.active ? "تفعيل" : "تعطيل"} الحساب بنجاح`,
      active: updatedUser.active,
    });
  } catch (err) {
    res.status(400).json({ status: "error", message: err.message });
  }
});

app.delete("/api/v1/users/:id", protect, restrictTo("admin"), async (req, res) => {
  try {
    const { data: user, error: fetchError } = await supabase.from('users').select('*').eq('_id', req.params.id).single();
    if (fetchError || !user) return res.status(404).json({ status: "fail", message: "المستخدم غير موجود" });

    if (user.role === 'owner') {
      const { data: restaurant } = await supabase.from('restaurants').select('_id').eq('owner', user._id).single();
      if (restaurant) {
        await supabase.from('products').delete().eq('restaurant', restaurant._id);
        await supabase.from('categories').delete().eq('restaurant', restaurant._id);
        await supabase.from('orders').delete().eq('restaurant', restaurant._id);
        await supabase.from('coupons').delete().eq('restaurant', restaurant._id);
        await supabase.from('stock_items').delete().eq('restaurant', restaurant._id);
        await supabase.from('stock_logs').delete().eq('restaurant', restaurant._id);
        await supabase.from('users').delete().eq('restaurant', restaurant._id); 
        await supabase.from('restaurants').delete().eq('_id', restaurant._id);
      }
    }

    await supabase.from('users').delete().eq('_id', req.params.id);
    res.status(200).json({ status: "success", message: "تم حذف المستخدم وجميع بياناته المرتبطة بنجاح" });
  } catch (err) {
    res.status(400).json({ status: "error", message: err.message });
  }
});

app.patch("/api/v1/users/:id/change-password-admin", protect, restrictTo("admin"), async (req, res) => {
  try {
    const { password } = req.body;
    if (!password || password.length < 6) {
      return res.status(400).json({ status: "fail", message: "يجب أن تكون كلمة المرور 6 أحرف على الأقل" });
    }
    const hashedPassword = await bcrypt.hash(password, 12);
    
    const { data: user, error } = await supabase
      .from('users')
      .update({ password: hashedPassword })
      .eq('_id', req.params.id)
      .select()
      .single();

    if (error || !user) {
      return res.status(404).json({ status: "fail", message: "المستخدم غير موجود" });
    }

    res.status(200).json({ status: "success", message: "تم تغيير كلمة المرور بنجاح" });
  } catch (err) {
    res.status(400).json({ status: "error", message: err.message });
  }
});

app.post("/api/v1/restaurants", protect, restrictTo("admin"), upload.single('image'), async (req, res) => {
  try {
    const { restaurantName, businessType, slug, contactInfo, owner, hasStock } = req.body;
    const { data: newRestaurant, error } = await supabase.from('restaurants').insert([{
      restaurantName, businessType, slug, contactInfo, owner, hasStock,
      image: req.file ? req.file.path : undefined,
    }]).select().single();
    
    if (error) throw error;
    res.status(201).json({ status: "success", data: { restaurant: newRestaurant } });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

app.get("/api/v1/restaurants/my-restaurant", protect, async (req, res) => {
  try {
    let queryKey = 'owner';
    let queryVal = req.user._id;

    if (req.user.role !== "owner") {
      if (!req.user.restaurant) return res.status(404).json({ message: "لا تملك صلاحية الوصول لمطعم" });
      queryKey = '_id';
      queryVal = req.user.restaurant;
    }

    const { data: restaurant, error } = await supabase
      .from('restaurants')
      .select('*, owner:users(hasStock, hasAccounting, subscriptionExpires, active, isTrial, trialExpires, allowedSections)')
      .eq(queryKey, queryVal)
      .single();

    if (error || !restaurant) return res.status(404).json({ message: "لم يتم العثور على مطعم" });
    
    const ownerData = Array.isArray(restaurant.owner) ? restaurant.owner[0] : restaurant.owner;
    
    const stockPermission = ownerData ? ownerData.hasStock : req.user.hasStock;
    const accountingPermission = ownerData ? ownerData.hasAccounting : req.user.hasAccounting;
    const allowedSectionsPermission = ownerData ? ownerData.allowedSections : req.user.allowedSections;
    
    let warning = null;
    if (ownerData && ownerData.isTrial) {
      let hoursLeft = 0;
      if (ownerData.trialExpires) {
        const diff = new Date(ownerData.trialExpires) - new Date();
        hoursLeft = Math.ceil(diff / (1000 * 60 * 60));
      }
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
        hasAccounting: accountingPermission,
        allowedSections: allowedSectionsPermission,
        warning: warning
      },
    });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

app.get("/api/v1/restaurants/:slug", async (req, res) => {
  try {
    const { data: restaurant, error: resError } = await supabase
        .from('restaurants')
        .select('*, owner:users(*)')
        .eq('slug', req.params.slug)
        .single();

    if (resError || !restaurant) return res.status(404).json({ message: "المطعم غير موجود" });

    const ownerData = Array.isArray(restaurant.owner) ? restaurant.owner[0] : restaurant.owner;
    let warning = null;

    if (ownerData) {
      const isExpired = ownerData.subscriptionExpires && new Date() > new Date(ownerData.subscriptionExpires);
      if (ownerData.active === false || isExpired) {
        return res.status(403).json({ message: "المنيو غير متاح حالياً" });
      }
      if (ownerData.isTrial) {
         warning = {
            message: "⚠️ تنبيه: هذا المطعم يستخدم النسخة التجريبية من نظام iMenu - سيتم حذف البيانات خلال 24 ساعة.",
            contact: "01145435095"
         };
      }
    }

    const { data: products } = await supabase.from('products').select('*').eq('restaurant', restaurant._id).order('sortOrder', { ascending: true }).order('createdAt', { ascending: false });
    const { data: categories } = await supabase.from('categories').select('*').eq('restaurant', restaurant._id).order('sort_order', { ascending: true });

    res.status(200).json({ status: "success", data: { restaurant, menu: products || [], categories: categories || [], warning } });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

app.get("/api/v1/restaurants", protect, async (req, res) => {
   try {
     const { data: restaurants, error } = await supabase
       .from('restaurants')
       .select('*, owner:users(name, email)'); 

     if (error) throw error;
     res.status(200).json({ status: "success", data: { restaurants } });
   } catch(err) { 
     res.status(400).json({ message: err.message }); 
   }
});

let _offersColumnReady = false;
let _offersMigrationPromise = null;
function ensureOffersColumn() {
  if (_offersColumnReady) return Promise.resolve(true);
  if (_offersMigrationPromise) return _offersMigrationPromise;

  _offersMigrationPromise = (async () => {
    const dbUrl = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL;
    if (!dbUrl) {
      console.warn("⚠️ DATABASE_URL غير موجود في .env — مش هقدر أضيف عمود offers تلقائياً. ضيف رابط اتصال Postgres من Supabase (Project Settings → Database → Connection string).");
      return false;
    }
    let client;
    try {
      const { Client } = require("pg");
      client = new Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
      client.on("error", (e) => console.error("⚠️ pg client error (offers):", e.message));
      await client.connect();
      await client.query("ALTER TABLE public.restaurants ADD COLUMN IF NOT EXISTS offers jsonb NOT NULL DEFAULT '[]'::jsonb");
      await client.query("NOTIFY pgrst, 'reload schema'");
      _offersColumnReady = true;
      console.log("✅ عمود offers جاهز في جدول restaurants");
      await new Promise((r) => setTimeout(r, 1500));
      return true;
    } catch (e) {
      console.error("❌ فشل إضافة عمود offers تلقائياً:", e.message);
      return false;
    } finally {
      if (client) { try { await client.end(); } catch (_) {} }
      _offersMigrationPromise = null;
    }
  })();
  return _offersMigrationPromise;
}

const isMissingOffersColumn = (err) =>
  !!err && /offers/i.test(err.message || "") && /(schema cache|column|does not exist)/i.test(err.message || "");

const _clampNum = (v, min, max, def) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : def;
};
const OFFER_FONTS = [
  "Tajawal", "Cairo", "Almarai", "Amiri", "Zain", "Changa", "El Messiri", "Reem Kufi",
  "Readex Pro", "IBM Plex Sans Arabic", "Noto Kufi Arabic", "Markazi Text", "Mada", "Harmattan",
  "Lemonada", "Rubik", "Baloo Bhaijaan 2", "Aref Ruqaa", "Lalezar", "Katibeh",
];
const OFFER_TEXT_KEYS = ["badge", "title", "message", "chips", "timerLabel", "timer", "button"];
const OFFER_BG_LAYOUTS = ["auto", "stack", "columns", "rows", "grid", "mosaic"];

function sanitizeOfferBgImages(o) {
  if (!o || typeof o !== "object") return o;
  const imgs = (Array.isArray(o.bgImages) ? o.bgImages : [])
    .filter((i) => i && typeof i.url === "string" && /^https?:\/\//i.test(i.url.trim()))
    .slice(0, 6)
    .map((i) => ({
      url: i.url.trim(),
      opacity: _clampNum(i.opacity, 0, 100, 40),
      blur: _clampNum(i.blur, 0, 30, 0),
    }));

  const textStyle = {};
  const ts = o.textStyle && typeof o.textStyle === "object" ? o.textStyle : {};
  OFFER_TEXT_KEYS.forEach((k) => {
    const t = ts[k];
    if (!t || typeof t !== "object") return;
    const item = {};
    if (typeof t.color === "string" && /^#[0-9a-fA-F]{6}$/.test(t.color.trim())) item.color = t.color.trim();
    if (typeof t.font === "string" && OFFER_FONTS.includes(t.font)) item.font = t.font;
    if (typeof t.weight === "string" && ["400", "700", "900"].includes(t.weight.trim())) item.weight = t.weight.trim();
    if (item.color || item.font || item.weight) textStyle[k] = item;
  });

  const _hex = (v) => (typeof v === "string" && /^#[0-9a-fA-F]{6}$/.test(v.trim()) ? v.trim() : "");
  const colorA = _hex(o.colorA), colorB = _hex(o.colorB);

  return {
    ...o,
    colorA: colorA && colorB ? colorA : "",
    colorB: colorA && colorB ? colorB : "",
    bgImages: imgs,
    bgLayout: OFFER_BG_LAYOUTS.includes(o.bgLayout) ? o.bgLayout : "auto",
    bgGap: _clampNum(o.bgGap, 0, 24, 6),
    textStyle,
  };
}

app.post("/api/v1/offers/upload-bg", protect, upload.single("image"), async (req, res) => {
  try {
    if (!req.file || !req.file.path) return res.status(400).json({ message: "مفيش صورة اتبعتت" });
    ensureOffersColumn().catch(() => {});
    res.status(200).json({ status: "success", url: req.file.path });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

app.patch("/api/v1/restaurants/:id", protect, upload.fields([{ name: 'bgImage', maxCount: 1 }, { name: 'heroImage', maxCount: 1 }, { name: 'storeLogo', maxCount: 1 }]), async (req, res) => {
  try {
    let updateData = { ...req.body };
    if (typeof updateData.offers === "string") {
      try { updateData.offers = JSON.parse(updateData.offers); } catch (e) { delete updateData.offers; }
    }
    if (Array.isArray(updateData.offers)) updateData.offers = updateData.offers.map(sanitizeOfferBgImages);
    if (updateData.customUI && typeof updateData.customUI === "string") {
      try { updateData.customUI = JSON.parse(updateData.customUI); } catch (e) { updateData.customUI = {}; }
    }
    if (updateData.storePage && typeof updateData.storePage === "string") {
      try { updateData.storePage = JSON.parse(updateData.storePage); } catch (e) { updateData.storePage = {}; }
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
      if (req.files["storeLogo"]) {
        if (!updateData.storePage) updateData.storePage = {};
        updateData.storePage.logo = req.files["storeLogo"][0].path;
      }
    }
    
    const runUpdate = () => supabase
      .from('restaurants')
      .update(updateData)
      .eq('_id', req.params.id)
      .select()
      .single();

    let { data: updatedRestaurant, error } = await runUpdate();

    if (error && isMissingOffersColumn(error)) {
      const created = await ensureOffersColumn();
      if (created) ({ data: updatedRestaurant, error } = await runUpdate());
    }

    if (error) throw error;
    if (req.io) req.io.to(req.params.id).emit("menu_updated");
    res.status(200).json({ status: "success", data: { restaurant: updatedRestaurant } });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

app.delete("/api/v1/restaurants/:id", protect, restrictTo("admin"), async (req, res) => {
    try {
        const { error } = await supabase.from('restaurants').delete().eq('_id', req.params.id);
        if (error) throw error;
        res.status(204).json({ status: "success" });
    } catch(err) { res.status(400).json({ message: err.message }); }
});

app.patch("/api/v1/restaurants/update-qr/:slug", protect, async (req, res) => {
  try {
    const { qrImage, qrName } = req.body;
    const { data: restaurant, error } = await supabase
      .from('restaurants')
      .update({ qrImage, qrName })
      .eq('slug', req.params.slug)
      .select()
      .single();
      
    if (error) throw error;
    res.status(200).json({ status: "success", data: { restaurant } });
  } catch (err) { res.status(400).json({ message: err.message }); }
});


cron.schedule("0 4 * * *", async () => {
  try {
    await Restaurant.updateMany(
      { "reservationSettings.isEnabled": true },
      { $set: { "reservationSettings.bookedSeats": 0 } }
    );
    console.log("✅ Reservation counters reset successfully.");
  } catch (err) {
    console.error("❌ Reservation Reset Error:", err);
  }
});

app.patch("/api/v1/reservations/settings", protect, restrictTo("owner", "admin"), async (req, res) => {
    try {
        const { restaurantId, isEnabled, totalSeats, resetCounter } = req.body;
        const restaurant = await Restaurant.findById(restaurantId);
        if(!restaurant) return res.status(404).json({message: "المطعم غير موجود"});

        if(resetCounter) {
            restaurant.reservationSettings.bookedSeats = 0;
            await Reservation.deleteMany({ restaurant: restaurantId });
        } else {
            if(isEnabled !== undefined) restaurant.reservationSettings.isEnabled = isEnabled;
            if(totalSeats !== undefined) restaurant.reservationSettings.totalSeats = Number(totalSeats);
        }

        await restaurant.save();
        
        if(req.io) {
            req.io.emit("seats_updated", { 
                slug: restaurant.slug,
                total: restaurant.reservationSettings.totalSeats, 
                booked: restaurant.reservationSettings.bookedSeats 
            });
        }

        res.status(200).json({ status: "success", data: { reservationSettings: restaurant.reservationSettings } });
    } catch(err) {
        res.status(500).json({ message: err.message });
    }
});

app.post("/api/v1/reservations/book/:slug", async (req, res) => {
  try {
    const { name, phone, seats } = req.body;
    const restaurant = await Restaurant.findOne({ slug: req.params.slug });
    if (!restaurant) return res.status(404).json({ message: "المطعم غير موجود" });

    const settings = restaurant.reservationSettings || { isEnabled: false, totalSeats: 0, bookedSeats: 0 };
    if (!settings.isEnabled) return res.status(400).json({ message: "نظام الحجز غير مفعل حالياً" });

    const available = settings.totalSeats - settings.bookedSeats;
    if (Number(seats) > available) return res.status(400).json({ message: `عذراً، المتاح فقط ${available} مقاعد` });

    await Reservation.create({
      restaurant: restaurant._id,
      name, phone, seats: Number(seats), status: "pending"
    });

    restaurant.reservationSettings.bookedSeats += Number(seats);
    await restaurant.save();

    if (req.io) {
        req.io.to(restaurant._id.toString()).emit("new_reservation_request", { name, seats });
        
        req.io.emit("seats_updated", { 
            slug: restaurant.slug,
            total: settings.totalSeats, 
            booked: restaurant.reservationSettings.bookedSeats 
        });
    }

    res.status(201).json({ 
        status: "success", 
        message: "تم إرسال طلبك بنجاح وسيتواصل معك المطعم قريباً",
        data: { available: settings.totalSeats - restaurant.reservationSettings.bookedSeats }
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

app.get("/api/v1/reservations/list", protect, restrictTo("owner", "admin"), async (req, res) => {
    try {
        const restaurant = await Restaurant.findOne({ owner: req.user._id });
        if(!restaurant) return res.status(404).json({message: "لا يوجد مطعم"});

        const reservations = await Reservation.find({ restaurant: restaurant._id }).sort("-createdAt");
        res.status(200).json({ status: "success", data: { reservations } });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

app.patch("/api/v1/reservations/action/:id", protect, restrictTo("owner", "admin"), async (req, res) => {
    try {
        const { status } = req.body;
        const reservation = await Reservation.findById(req.params.id);
        if(!reservation) return res.status(404).json({message: "الطلب غير موجود"});

        const restaurant = await Restaurant.findById(reservation.restaurant);
        
        if (status === 'rejected' && reservation.status !== 'rejected') {
            restaurant.reservationSettings.bookedSeats -= reservation.seats;
            if(restaurant.reservationSettings.bookedSeats < 0) restaurant.reservationSettings.bookedSeats = 0;
            await restaurant.save();

            if (req.io) {
                req.io.emit("seats_updated", { 
                    slug: restaurant.slug,
                    total: restaurant.reservationSettings.totalSeats, 
                    booked: restaurant.reservationSettings.bookedSeats 
                });
            }
        }
        
        reservation.status = status;
        await reservation.save();

        res.status(200).json({ status: "success", message: "تم تحديث حالة الحجز" });
    } catch(err) {
        res.status(500).json({ message: err.message });
    }
});

app.post("/api/v1/products", protect, upload.single('image'), async (req, res) => {
  try {
    const currentUser = req.user;
    if (currentUser.productLimit !== -1) {
      const { count: currentCount, error: countError } = await supabase.from('products').select('*', { count: 'exact', head: true }).eq('restaurant', req.body.restaurantId);
      if (countError) throw countError;
      if (currentCount >= currentUser.productLimit) return res.status(403).json({ message: "استهلكت باقة المنتجات" });
    }
    
    const { name, description, price, oldPrice, sizes, category, ingredients, restaurantId } = req.body;
    
    const safeParse = (val) => {
      try { return typeof val === 'string' ? JSON.parse(val) : val; } catch (e) { return val; }
    };

    const { data: newProduct, error } = await supabase.from('products').insert([{
      name: safeParse(name),
      description: safeParse(description),
      price: Number(price),
      oldPrice: oldPrice ? Number(oldPrice) : 0,
      sizes: safeParse(sizes) || [],
      category,
      ingredients: ingredients ? safeParse(ingredients) : [],
      restaurant: restaurantId,
      image: req.file ? req.file.path : "",
      isAvailable: true
    }]).select().single();

    if (error) throw error;

    if (req.io) req.io.to(restaurantId).emit("menu_updated");
    res.status(201).json({ status: "success", data: { product: newProduct } });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

app.get("/api/v1/products/restaurant/:restaurantId", protect, restrictTo("owner", "admin", "cashier", "kitchen", "sales", "waiter"), async (req, res) => {
  try {
    const { data: products, error } = await supabase
      .from('products')
      .select('*')
      .eq('restaurant', req.params.restaurantId)
      .order('sortOrder', { ascending: true })
      .order('createdAt', { ascending: false });
      
    if (error) throw error;
    res.status(200).json({ status: "success", data: { products } });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

app.patch("/api/v1/products/reorder", protect, restrictTo("owner", "admin"), async (req, res) => {
  try {
    const { order } = req.body; 
    if (!order || !Array.isArray(order)) return res.status(400).json({ message: "Invalid data" });

    const operations = order.map((item) => ({
      _id: item.id,
      sortOrder: item.sortOrder
    }));

    const { error } = await supabase.from('products').upsert(operations);
    if (error) throw error;

    res.status(200).json({ status: "success" });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

app.delete("/api/v1/products/:id", protect, async (req, res) => {
  try {
    const { data: product, error: prodError } = await supabase.from('products').select('*').eq('_id', req.params.id).single();
    if (prodError || !product) return res.status(404).json({ message: "المنتج غير موجود" });
    
    if (req.user.role !== "admin") {
      const { data: restaurant } = await supabase.from('restaurants').select('_id').eq('_id', product.restaurant).eq('owner', req.user._id).single();
      if (!restaurant) return res.status(403).json({ message: "غير مصرح" });
    }

    const { error } = await supabase.from('products').delete().eq('_id', req.params.id);
    if (error) throw error;
    
    if (req.io) req.io.to(product.restaurant.toString()).emit("menu_updated");
    res.status(204).json({ status: "success" });
  } catch (err) { res.status(400).json({ message: err.message }); }
});

app.patch("/api/v1/products/:id", protect, upload.single('image'), async (req, res) => {
  try {
    const { data: product, error: prodError } = await supabase.from('products').select('*').eq('_id', req.params.id).single();
    if (prodError || !product) return res.status(404).json({ message: "المنتج غير موجود" });
    
    if (req.user.role !== "admin") {
      const { data: restaurant } = await supabase.from('restaurants').select('_id').eq('_id', product.restaurant).eq('owner', req.user._id).single();
      if (!restaurant) return res.status(403).json({ message: "غير مصرح" });
    }

    const { name, description, price, oldPrice, sizes, category, ingredients, isAvailable } = req.body;
    const safeParse = (val) => { try { return typeof val === 'string' ? JSON.parse(val) : val; } catch (e) { return val; } };

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
    if (isAvailable !== undefined) updateData.isAvailable = isAvailable;

    const { data: updatedProduct, error } = await supabase
      .from('products')
      .update(updateData)
      .eq('_id', req.params.id)
      .select()
      .single();

    if (error) throw error;
    if (updatedProduct && req.io) {
      req.io.to(updatedProduct.restaurant.toString()).emit("menu_updated");
    }
    res.status(200).json({ status: "success", data: { product: updatedProduct } });
  } catch (err) { res.status(400).json({ message: err.message }); }
});

app.patch("/api/v1/products/toggle/:id", protect, async (req, res) => {
    try {
        const { data: product, error: fetchError } = await supabase.from('products').select('*').eq('_id', req.params.id).single();
        if (fetchError || !product) return res.status(404).json({message: "Not found"});
        
        const newStatus = !product.isAvailable;
        const { data: updatedProduct, error: updateError } = await supabase
          .from('products')
          .update({ isAvailable: newStatus })
          .eq('_id', req.params.id)
          .select()
          .single();
          
        if (updateError) throw updateError;
        
        if (req.io) req.io.to(updatedProduct.restaurant.toString()).emit("menu_updated");
        res.status(200).json({ status: "success", data: { product: updatedProduct } });
    } catch(err) { res.status(400).json({ message: err.message }); }
});

app.post("/api/v1/categories", protect, restrictTo("owner", "admin"), upload.single('image'), async (req, res) => {
  try {
    const { name, restaurantId } = req.body;
    
    const { count, error: countError } = await supabase
      .from('categories')
      .select('*', { count: 'exact', head: true })
      .eq('restaurant_id', restaurantId);
      
    if (countError) throw countError;

    const { data: newCategory, error: insertError } = await supabase
      .from('categories')
      .insert([
        { 
          name, 
          sort_order: (count || 0) + 1, 
          image: req.file ? req.file.path : "", 
          restaurant_id: restaurantId 
        }
      ])
      .select()
      .single();

    if (insertError) throw insertError;

    if (req.io) req.io.to(restaurantId).emit("menu_updated");
    res.status(201).json({ status: "success", data: { category: newCategory } });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

app.post("/api/v1/categories/bulk", protect, restrictTo("owner", "admin"), async (req, res) => {
  try {
    const { names, restaurantId } = req.body;
    if (!names || !Array.isArray(names)) return res.status(400).json({ message: "Invalid data" });
    
    const { count: startCount, error: countError } = await supabase.from('categories').select('*', { count: 'exact', head: true }).eq('restaurant_id', restaurantId);
    if (countError) throw countError;

    const docs = names.map((name, index) => ({ 
      name, 
      restaurant_id: restaurantId,
      sort_order: (startCount || 0) + index + 1
    }));
    
    const { error } = await supabase.from('categories').insert(docs);
    if (error) throw error;

    if (req.io) req.io.to(restaurantId).emit("menu_updated");
    res.status(201).json({ status: "success", count: docs.length });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

app.patch("/api/v1/categories/reorder", protect, restrictTo("owner", "admin"), async (req, res) => {
  try {
    const { order } = req.body; 
    const operations = order.map((item) => ({
      _id: item.id,
      sort_order: item.sortOrder
    }));
    
    const { error } = await supabase.from('categories').upsert(operations);
    if (error) throw error;

    res.status(200).json({ status: "success" });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

app.get("/api/v1/categories/:restaurantId", async (req, res) => {
  try {
    const { data: categories, error: catError } = await supabase.from('categories').select('*').eq('restaurant_id', req.params.restaurantId).order('sort_order', { ascending: true }).order('createdAt', { ascending: true });
    if (catError) throw catError;

    const { count: totalProducts } = await supabase.from('products').select('*', { count: 'exact', head: true }).eq('restaurant', req.params.restaurantId);

    const categoriesWithCounts = await Promise.all((categories || []).map(async (cat) => {
      const { count } = await supabase.from('products').select('*', { count: 'exact', head: true }).eq('category', cat.name).eq('restaurant', req.params.restaurantId);
      return { ...cat, productCount: count || 0 };
    }));
    
    res.status(200).json({ status: "success", data: { categories: categoriesWithCounts, stats: { totalCats: categories ? categories.length : 0, totalProds: totalProducts || 0 } } });
  } catch (err) { res.status(400).json({ message: err.message }); }
});

app.delete("/api/v1/categories/:id", protect, restrictTo("owner", "admin"), async (req, res) => {
  try {
    const { data: category, error: fetchError } = await supabase.from('categories').select('*').eq('_id', req.params.id).single();
    if (fetchError || !category) return res.status(404).json({ message: "القسم غير موجود" });

    await supabase.from('categories').delete().eq('_id', req.params.id);
    await supabase.from('products').delete().eq('category', category.name).eq('restaurant', category.restaurant_id);
    
    if (req.io) req.io.to(category.restaurant_id.toString()).emit("menu_updated");
    res.status(204).json({ status: "success" });
  } catch (err) { res.status(400).json({ message: err.message }); }
});

app.patch("/api/v1/categories/:id", protect, restrictTo("owner", "admin"), upload.single('image'), async (req, res) => {
  try {
    const updateData = { name: req.body.name };
    if (req.file) updateData.image = req.file.path;
    
    const { data: updatedCategory, error } = await supabase
      .from('categories')
      .update(updateData)
      .eq('_id', req.params.id)
      .select()
      .single();
      
    if (error) throw error;
    if (req.io) req.io.to(updatedCategory.restaurant_id.toString()).emit("menu_updated");
    res.status(200).json({ status: "success", data: { category: updatedCategory } });
  } catch (err) { res.status(400).json({ message: err.message }); }
});

app.get("/api/v1/restaurants/:id/export-menu", protect, restrictTo("owner", "admin"), async (req, res) => {
  try {
    const rId = req.params.id;

    if (req.user.role !== "admin") {
      const { data: ownCheck } = await supabase.from('restaurants').select('_id').eq('_id', rId).eq('owner', req.user._id).single();
      if (!ownCheck) return res.status(403).json({ message: "غير مصرح بهذه العملية" });
    }

    const { data: restaurant } = await supabase.from('restaurants').select('restaurantName').eq('_id', rId).single();
    const { data: categories, error: catError } = await supabase.from('categories').select('name').eq('restaurant_id', rId);
    if (catError) throw catError;
    const { data: products, error: prodError } = await supabase.from('products').select('*').eq('restaurant', rId);
    if (prodError) throw prodError;

    const exportData = {
      version: "1.0",
      exportedAt: new Date().toISOString(),
      restaurantName: restaurant ? restaurant.restaurantName : "",
      categories: (categories || []).map(c => ({ name: c.name })),
      products: (products || []).map(p => ({
        name: p.name,
        description: p.description,
        price: p.price,
        oldPrice: p.oldPrice || 0,
        category: p.category,
        sizes: p.sizes || [],
        isAvailable: p.isAvailable !== false,
      })),
    };

    res.status(200).json({ status: "success", data: exportData });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

app.post("/api/v1/restaurants/:id/import-menu", protect, restrictTo("owner", "admin"), async (req, res) => {
  try {
    const rId = req.params.id;
    const { data, mode } = req.body;

    if (!data || !data.categories || !data.products)
      return res.status(400).json({ message: "ملف الاستيراد غير صالح أو ناقص" });

    if (req.user.role !== "admin") {
      const { data: ownCheck } = await supabase.from('restaurants').select('_id').eq('_id', rId).eq('owner', req.user._id).single();
      if (!ownCheck) return res.status(403).json({ message: "غير مصرح بهذه العملية" });
    }

    if (mode === "replace") {
      await supabase.from('products').delete().eq('restaurant', rId);
      await supabase.from('categories').delete().eq('restaurant_id', rId);
    }

    const { count: existingCount } = await supabase.from('categories').select('*', { count: 'exact', head: true }).eq('restaurant_id', rId);
    let nextSortOrder = (existingCount || 0) + 1;

    let addedCats = 0, addedProds = 0, skippedProds = 0;

    for (const cat of data.categories) {
      const { data: existing } = await supabase.from('categories').select('_id').eq('restaurant_id', rId).eq('name', cat.name).maybeSingle();
      if (!existing) {
        await supabase.from('categories').insert([{ name: cat.name, restaurant_id: rId, sort_order: nextSortOrder++ }]);
        addedCats++;
      }
    }

    for (const prod of data.products) {
      const nameObj = typeof prod.name === "object" ? prod.name : { ar: prod.name, en: "" };
      const descObj = typeof prod.description === "object" ? prod.description : { ar: prod.description || "", en: "" };

      if (mode !== "replace") {
        const { data: existing } = await supabase.from('products').select('_id').eq('restaurant', rId).eq('category', prod.category || "").ilike('name->>ar', nameObj.ar || "").maybeSingle();
        if (existing) { skippedProds++; continue; }
      }

      const { error: insertErr } = await supabase.from('products').insert([{
        name: nameObj,
        description: descObj,
        price: prod.price || 0,
        oldPrice: prod.oldPrice || 0,
        sizes: prod.sizes || [],
        category: prod.category || "",
        ingredients: [],
        restaurant: rId,
        image: "",
        isAvailable: prod.isAvailable !== false,
      }]);
      if (insertErr) { skippedProds++; continue; }
      addedProds++;
    }

    if (req.io) req.io.to(rId.toString()).emit("menu_updated");

    res.status(200).json({
      status: "success",
      message: `تم الاستيراد: ${addedCats} قسم و ${addedProds} منتج. (${skippedProds} منتج تجاهل لتكراره)`,
      data: { addedCats, addedProds, skippedProds },
    });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});


app.patch("/api/v1/restaurants/accounting-settings/:id", protect, restrictTo("owner"), async (req, res) => {
  try {
    const { overtimeRate, absencePenalty, latePenalty } = req.body;
    const restaurant = await Restaurant.findByIdAndUpdate(
      req.params.id,
      { "accountingSettings": { overtimeRate, absencePenalty, latePenalty } },
      { new: true }
    );
    res.status(200).json({ status: "success", data: { restaurant } });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

app.post("/api/v1/accounting/generate-payroll", protect, restrictTo("owner"), async (req, res) => {
  try {
    const { month, restaurantId } = req.body;
    const restaurant = await Restaurant.findById(restaurantId);
    if (!restaurant) return res.status(404).json({ message: "المطعم غير موجود" });

    const settings = restaurant.accountingSettings || { overtimeRate: 0, absencePenalty: 1, latePenalty: 0 };
    const employees = await Employee.find({ restaurant: restaurantId });
    
    let payrolls = [];

    for (const emp of employees) {
      const attendanceList = await Attendance.find({
        employee: emp._id,
        date: { $regex: new RegExp(`^${month}`) }
      });

      let totalOvertimeHours = 0;
      let totalLateHours = 0;
      let absentDays = 0;
      let presentDays = 0;

      attendanceList.forEach(att => {
        if (att.status === 'present' || att.status === 'late') {
            presentDays++;
            totalOvertimeHours += (att.overtimeHours || 0);
            totalLateHours += (att.deductionHours || 0);
        } else if (att.status === 'absent') {
            absentDays++;
        }
      });

const financialRecords = await Expense.find({ 
    restaurant: restaurantId, 
    employee: emp._id, 
    category: { $in: ['salary_advance', 'bonus', 'deduction'] },
    date: { $gte: new Date(`${month}-01`), $lt: new Date(new Date(`${month}-01`).setMonth(new Date(`${month}-01`).getMonth() + 1)) } 
});

const totalAdvances = financialRecords.filter(e => e.category === 'salary_advance').reduce((sum, e) => sum + e.amount, 0);
const totalBonuses = financialRecords.filter(e => e.category === 'bonus').reduce((sum, e) => sum + e.amount, 0);
const totalManualDeductions = financialRecords.filter(e => e.category === 'deduction').reduce((sum, e) => sum + e.amount, 0);
      
      let dayValue = 0;
      let baseSalary = emp.baseSalary || 0;

      if (emp.salaryType === 'monthly') {
        dayValue = baseSalary / 30;
      } else {
        dayValue = baseSalary;
        baseSalary = dayValue * presentDays;
      }

      const overtimePay = totalOvertimeHours * settings.overtimeRate;
      const lateDeduction = totalLateHours * settings.latePenalty;
      const absenceDeduction = absentDays * settings.absencePenalty * dayValue;
      
      const totalSalary = baseSalary + overtimePay + (emp.bonuses || 0) + totalBonuses - lateDeduction - absenceDeduction - totalManualDeductions - totalAdvances;

      payrolls.push({
        employee: emp,
        restaurant: restaurantId,
        month,
        baseAmount: Math.round(baseSalary),
        overtimeAmount: Math.round(overtimePay),
        deductions: Math.round(lateDeduction + absenceDeduction + totalManualDeductions),
loansDeducted: Math.round(totalAdvances),
bonuses: Math.round(totalBonuses),
        totalSalary: Math.round(totalSalary) < 0 ? 0 : Math.round(totalSalary)
      });
    }

    await Payroll.deleteMany({ restaurant: restaurant._id, month });
    
    const dbPayload = payrolls.map(p => ({...p, employee: p.employee._id}));
    await Payroll.insertMany(dbPayload);

    const savedPayrolls = await Payroll.find({ restaurant: restaurant._id, month }).populate('employee');

    res.status(200).json({ status: "success", data: savedPayrolls });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

app.patch("/api/v1/accounting/payroll/:id", protect, restrictTo("owner"), async (req, res) => {
  try {
    const { bonuses, deductions, loansDeducted } = req.body;
    const payroll = await Payroll.findById(req.params.id);
    if (!payroll) return res.status(404).json({ message: "غير موجود" });
    
    if (payroll.status === 'Approved') {
        return res.status(400).json({ message: "لا يمكن تعديل راتب تم اعتماده وصرفه بالفعل" });
    }

    if (bonuses !== undefined) payroll.bonuses = bonuses;
    if (deductions !== undefined) payroll.deductions = deductions;
    if (loansDeducted !== undefined) payroll.loansDeducted = loansDeducted;

    const net = (payroll.baseAmount + payroll.overtimeAmount + payroll.bonuses) - (payroll.deductions + payroll.loansDeducted);
    payroll.totalSalary = net < 0 ? 0 : net;

    await payroll.save();
    res.status(200).json({ status: "success", data: payroll });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

app.get("/api/v1/accounting/payroll", protect, restrictTo("owner"), async (req, res) => {
    try {
        const { month, restaurantId, employeeId } = req.query;
        const query = { restaurant: restaurantId };
        if (month) query.month = month;
        if (employeeId) query.employee = employeeId;

        const payrolls = await Payroll.find(query).populate('employee');
        res.status(200).json({ status: "success", data: payrolls });
    } catch (err) {
        res.status(400).json({ message: err.message });
    }
});

app.post("/api/v1/accounting/approve-payroll", protect, restrictTo("owner"), async (req, res) => {
  try {
    const { month, restaurantId } = req.body;
    
    const payrolls = await Payroll.find({ restaurant: restaurantId, month, status: 'Pending' });
    
    if (payrolls.length === 0) {
        return res.status(400).json({ message: "لا توجد رواتب معلقة للاعتماد في هذا الشهر" });
    }

    let totalBaseSalaries = 0;
    let totalNetSalaries = 0;

    for (const p of payrolls) {
        p.status = 'Approved';
        p.isPaid = true;
        p.paidAt = new Date();
        await p.save();

        totalBaseSalaries += p.baseAmount;
        totalNetSalaries += p.totalSalary;

        if (p.loansDeducted > 0) {
            await Employee.findByIdAndUpdate(p.employee, { 
                $inc: { loanBalance: -p.loansDeducted } 
            });
        }
    }

    if (totalNetSalaries > 0) {
        await Expense.create({
            restaurant: restaurantId,
            title: `رواتب شهر ${month} (الصافي)`,
            amount: totalNetSalaries,
            category: 'salaries',
            date: new Date(),
            description: `تم اعتماد رواتب شهر ${month} آلياً بعد خصم السلف والجزاءات`
        });
    }

    res.status(200).json({ status: "success", message: "تم اعتماد الرواتب وتسجيل المصروفات وخصم السلف بنجاح" });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

app.get("/api/v1/accounting/payroll", protect, async (req, res) => {
  try {
    const { restaurantId, month, employee } = req.query;
    const query = { restaurant: restaurantId };
    if (month) query.month = month;
    if (employee) query.employee = employee;
    
    const payrolls = await Payroll.find(query).populate("employee", "name jobTitle").sort('-month');
    res.status(200).json({ status: "success", data: payrolls });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});


const checkOrderPermission = async (user, restaurantId) => {
  if (user.role === "admin") return true;
  if (user.role === "owner") {
    const { data } = await supabase.from('restaurants').select('_id').eq('_id', restaurantId).eq('owner', user._id).single();
    return !!data;
  }
  return user.restaurant && user.restaurant.toString() === restaurantId.toString();
};

app.patch("/api/v1/orders/:id/cancel", protect, async (req, res) => {
  try {
    const { data: order, error: orderError } = await supabase.from('orders').select('*').eq('_id', req.params.id).eq('status', 'pending').single();
    if (orderError || !order) return res.status(400).json({ message: "الطلب غير موجود أو دخل مرحلة التحضير" });
    
    if (req.user.role === 'waiter' && order.createdBy !== req.user._id) {
        return res.status(403).json({ message: "لا يمكنك إلغاء طلب لم تقم بإنشائه" });
    }

    const { data: updatedOrder, error: updateError } = await supabase.from('orders').update({ status: 'canceled' }).eq('_id', order._id).select().single();
    if (updateError) throw updateError;

    if (req.io) {
      req.io.to(updatedOrder.restaurant.toString()).emit("order-updated", updatedOrder);
      req.io.to(updatedOrder.restaurant.toString()).emit("order_cancelled_alert", updatedOrder);
    }
    
    res.status(200).json({ status: "success", message: "تم إلغاء الطلب بنجاح" });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

app.put("/api/v1/orders/:id", protect, async (req, res) => {
  try {
    const { items, subTotal, totalPrice, taxAmount, serviceAmount } = req.body;
    
    const { data: order, error: orderError } = await supabase.from('orders').select('*').eq('_id', req.params.id).eq('status', 'pending').single();
    if (orderError || !order) return res.status(400).json({ message: "لا يمكن تعديل الطلب (قد يكون قيد التحضير أو مكتمل)" });

    const updateData = {
      items,
      subTotal,
      totalPrice,
      taxAmount: taxAmount || 0,
      serviceAmount: serviceAmount || 0
    };

    const { data: updatedOrder, error: updateError } = await supabase.from('orders').update(updateData).eq('_id', order._id).select().single();
    if (updateError) throw updateError;

    if (req.io) {
      req.io.to(updatedOrder.restaurant.toString()).emit("order-updated", updatedOrder);
    }

    res.status(200).json({ status: "success", message: "تم تعديل الطلب بنجاح", data: { order: updatedOrder } });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

app.post("/api/v1/orders", protectOptional, async (req, res) => {
  try {
    const { 
      orderId, manualOrderNum, restaurant, restaurantId, table, tableNumber,
      items, type, customerName, phone, notes, couponCode, discountAmount, 
      subTotal, taxAmount, serviceAmount, totalPrice 
    } = req.body;

    const targetRestaurant = restaurant || restaurantId;
    const targetTable = table || tableNumber || "تيك أواي";

    if (!targetRestaurant || !items || items.length === 0) {
      return res.status(400).json({ message: "بيانات الطلب ناقصة" });
    }

    let existingOrder = null;

    if (manualOrderNum) {
      const { data } = await supabase.from('orders')
        .select('*').eq('restaurant', targetRestaurant).eq('orderNum', Number(manualOrderNum))
        .neq('status', 'completed').neq('status', 'canceled').single();
      existingOrder = data;
    }

    if (!existingOrder && orderId) {
      const { data } = await supabase.from('orders')
        .select('*').eq('_id', orderId)
        .neq('status', 'completed').neq('status', 'canceled').single();
      existingOrder = data;
    }

    if (!existingOrder) {
      let query = supabase.from('orders').select('*')
        .eq('restaurant', targetRestaurant)
        .neq('status', 'completed').neq('status', 'canceled')
        .order('createdAt', { ascending: false }).limit(1);

      if (targetTable && targetTable !== "تيك أواي") {
        const { data } = await query.eq('tableNumber', targetTable).single();
        existingOrder = data;
      } 
      else if (targetTable === "تيك أواي") {
        if (phone) {
           const { data } = await query.eq('tableNumber', "تيك أواي").eq('phone', phone).single();
           existingOrder = data;
        } else if (customerName) {
           const { data } = await query.eq('tableNumber', "تيك أواي").eq('customerName', customerName).single();
           existingOrder = data;
        }
      }
    }

    if (existingOrder) {
      const newItems = [...existingOrder.items, ...items];
      const additionalTotal = items.reduce((sum, item) => sum + (item.price * (item.qty || 1)), 0);
      const newTotal = existingOrder.totalPrice + additionalTotal;
      const newSubTotal = existingOrder.subTotal ? existingOrder.subTotal + additionalTotal : additionalTotal;
      const newNotes = notes ? (existingOrder.notes ? `${existingOrder.notes} | ${notes}` : notes) : existingOrder.notes;

      const { data: updatedOrder, error } = await supabase.from('orders').update({
        items: newItems, totalPrice: newTotal, subTotal: newSubTotal, notes: newNotes
      }).eq('_id', existingOrder._id).select().single();
      
      if (error) throw error;

      if (req.io) {
        req.io.to(targetRestaurant.toString()).emit("order-updated", updatedOrder); 
        req.io.to(targetRestaurant.toString()).emit("order-items-added", { orderId: updatedOrder._id, newItems: items }); 
      }
      return res.status(200).json({ status: "success", message: `تم الإضافة للفاتورة رقم #${updatedOrder.orderNum}`, data: { order: updatedOrder } });
    } else {
      if (couponCode) {
        const { data: coupon } = await supabase.from('coupons').select('usedCount').eq('code', couponCode).eq('restaurant', targetRestaurant).single();
        if (coupon) await supabase.from('coupons').update({ usedCount: coupon.usedCount + 1 }).eq('code', couponCode).eq('restaurant', targetRestaurant);
      }

      const { data: lastOrder } = await supabase.from('orders').select('orderNum').eq('restaurant', targetRestaurant).order('orderNum', { ascending: false }).limit(1).single();
      const nextOrderNum = lastOrder && lastOrder.orderNum ? lastOrder.orderNum + 1 : 1;
      const calcTotal = items.reduce((acc, item) => acc + (item.price * (item.qty || 1)), 0);

      const { data: newOrder, error } = await supabase.from('orders').insert([{
        restaurant: targetRestaurant, tableNumber: targetTable, orderNum: nextOrderNum,
        createdBy: req.user ? req.user._id : undefined, items,
        subTotal: subTotal || calcTotal, taxAmount: taxAmount || 0, serviceAmount: serviceAmount || 0,
        couponCode, discountAmount: discountAmount || 0, totalPrice: totalPrice || calcTotal,
        status: 'pending', type: type || (targetTable === "تيك أواي" ? 'takeaway' : 'dine_in'),
        customerName, phone, notes
      }]).select().single();

      if (error) throw error;
      if (req.io) req.io.to(targetRestaurant.toString()).emit("new-order", newOrder);
      
      return res.status(201).json({ status: "success", message: "تم فتح فاتورة جديدة", data: { order: newOrder } });
    }
  } catch (err) {
    console.error("Order Error:", err);
    res.status(500).json({ message: err.message });
  }
});

app.get("/api/v1/orders/my-orders", protect, async (req, res) => {
  try {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    
    const { data: orders, error } = await supabase.from('orders')
      .select('*')
      .eq('createdBy', req.user._id)
      .gte('createdAt', startOfToday.toISOString())
      .order('createdAt', { ascending: false });

    if (error) throw error;
    res.status(200).json({ status: "success", data: { orders } });
  } catch (err) {
    res.status(400).json({ status: "fail", message: err.message });
  }
});

app.get("/api/v1/orders/active/:restaurantId", protect, async (req, res) => {
  try {
    const hasAccess = await checkOrderPermission(req.user, req.params.restaurantId);
    if (!hasAccess) return res.status(403).json({ message: "ليس لديك صلاحية لرؤية طلبات هذا المطعم" });

    const { data: orders, error } = await supabase.from('orders')
      .select('*')
      .eq('restaurant', req.params.restaurantId)
      .in('status', ['pending', 'preparing'])
      .order('createdAt', { ascending: true });

    if (error) throw error;
    res.status(200).json({ status: "success", data: { orders } });
  } catch (err) {
    res.status(400).json({ status: "fail", message: err.message });
  }
});

app.patch("/api/v1/orders/status/:id", protect, restrictTo("owner", "cashier", "kitchen", "admin", "waiter"), async (req, res) => {
  try {
    const { status } = req.body;
    const { data: order, error: fetchError } = await supabase.from('orders').select('*').eq('_id', req.params.id).single();
    if (fetchError || !order) return res.status(404).json({ message: "الطلب غير موجود" });

    const hasAccess = await checkOrderPermission(req.user, order.restaurant);
    if (!hasAccess) return res.status(403).json({ message: "ليس لديك صلاحية لتحديث هذا الطلب" });

    if (status === 'preparing' && order.status !== 'preparing') {
      for (const item of order.items) {
        let product;
        if (item.productId) {
          const { data: pData } = await supabase.from('products').select('*').eq('_id', item.productId).single();
          product = pData;
        }
        if (!product) {
          const { data: pData } = await supabase.from('products')
            .select('*')
            .eq('restaurant', order.restaurant)
            .or(`name->>ar.eq."${item.name}",name->>en.eq."${item.name}"`)
            .limit(1)
            .single();
          product = pData;
        }

        if (product && product.ingredients) {
          for (const ing of product.ingredients) {
            if(ing.stockItem) {
              const deductionAmount = ing.quantity * item.qty;
              const { data: stockItem } = await supabase.from('stock_items').select('*').eq('_id', ing.stockItem).single();
              if (stockItem) {
                await supabase.from('stock_items').update({ quantity: stockItem.quantity - deductionAmount }).eq('_id', stockItem._id);
                await supabase.from('stock_logs').insert([{
                  restaurant: order.restaurant, stockItem: stockItem._id, itemName: stockItem.name,
                  changeAmount: -deductionAmount, type: 'consumption', orderId: order._id
                }]);
              }
            }
          }
        } else {
          console.warn(`Warning: Product not found for stock deduction: ${item.name}`);
        }
      }
    }
    
    const { data: updatedOrder, error: updateError } = await supabase.from('orders').update({ status }).eq('_id', order._id).select().single();
    if (updateError) throw updateError;
    
    if (req.io) {
      req.io.to(updatedOrder.restaurant.toString()).emit("order-updated", updatedOrder);
      req.io.to(updatedOrder._id.toString()).emit("status-changed", status);
    }
    res.status(200).json({ status: "success", data: { order: updatedOrder } });
  } catch (err) { res.status(400).json({ message: err.message }); }
});

app.get("/api/v1/orders/history/:restaurantId", protect, async (req, res) => {
  try {
    const hasAccess = await checkOrderPermission(req.user, req.params.restaurantId);
    if (!hasAccess) return res.status(403).json({ message: "ليس لديك صلاحية" });

    let query = supabase.from('orders')
      .select('*')
      .eq('restaurant', req.params.restaurantId)
      .in('status', ['completed', 'canceled'])
      .order('createdAt', { ascending: false });

    if (req.user.role === "cashier" || req.user.role === "waiter") {
      const startOfToday = new Date();
      startOfToday.setHours(0, 0, 0, 0);
      query = query.gte('createdAt', startOfToday.toISOString());
    } else if (req.user.role === "owner" || req.user.role === "admin") {
      if (req.query.startDate && req.query.endDate) {
        const endD = new Date(req.query.endDate);
        endD.setHours(23, 59, 59, 999);
        query = query.gte('createdAt', new Date(req.query.startDate).toISOString()).lte('createdAt', endD.toISOString());
      }
      if (req.query.search) {
        const searchVal = req.query.search;
        if (!isNaN(searchVal)) {
          query = query.or(`orderNum.eq.${Number(searchVal)},tableNumber.ilike.%${searchVal}%`);
        } else {
          query = query.ilike('tableNumber', `%${searchVal}%`);
        }
      }
    }

    const { data: orders, error } = await query;
    if (error) throw error;

    const totalSales = orders.filter(o => o.status === 'completed').reduce((sum, o) => sum + o.totalPrice, 0);

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
      const { data: orders, error } = await supabase.from('orders')
        .select('*')
        .eq('restaurant', req.params.restaurantId)
        .eq('status', 'completed')
        .gte('updatedAt', twoHoursAgo.toISOString())
        .order('updatedAt', { ascending: false });

      if (error) throw error;
      res.status(200).json({ status: "success", data: { orders } });
    } catch (err) {
      res.status(400).json({ status: "fail", message: err.message });
    }
});

app.post("/api/v1/coupons/:restaurantId", protect, async (req, res) => {
  try {
    const { data: existing } = await supabase.from('coupons').select('_id').eq('code', req.body.code.toUpperCase()).eq('restaurant', req.params.restaurantId).single();
    if (existing) return res.status(400).json({ message: "الكود موجود" });
    
    const { data: newCoupon, error } = await supabase.from('coupons').insert([{ ...req.body, restaurant: req.params.restaurantId }]).select().single();
    if (error) throw error;
    
    res.status(201).json({ status: "success", data: { coupon: newCoupon } });
  } catch (err) { res.status(400).json({ message: err.message }); }
});

app.get("/api/v1/coupons/:restaurantId", protect, async (req, res) => {
  try {
    const { data: coupons, error } = await supabase.from('coupons').select('*').eq('restaurant', req.params.restaurantId).order('createdAt', { ascending: false });
    if (error) throw error;
    res.status(200).json({ status: "success", data: { coupons } });
  } catch (err) { res.status(400).json({ message: err.message }); }
});

app.delete("/api/v1/coupons/:id", protect, async (req, res) => {
    try { 
      const { error } = await supabase.from('coupons').delete().eq('_id', req.params.id);
      if (error) throw error;
      res.status(200).json({ status: "success" }); 
    }
    catch(err) { res.status(400).json({ message: err.message }); }
});

app.post("/api/v1/coupons/validate/:restaurantId", async (req, res) => {
  try {
    const { code, orderTotal } = req.body;
    const { data: coupon, error } = await supabase.from('coupons').select('*').eq('code', code.toUpperCase()).eq('restaurant', req.params.restaurantId).eq('isActive', true).single();
    
    if (error || !coupon) return res.status(404).json({ message: "كود غير صحيح" });
    if (coupon.expiresAt && new Date() > new Date(coupon.expiresAt)) return res.status(400).json({ message: "الكوبون منتهي" });
    if (coupon.usedCount >= coupon.usageLimit) return res.status(400).json({ message: "انتهى عدد مرات الاستخدام" });
    if (orderTotal < coupon.minOrderVal) return res.status(400).json({ message: `الحد الأدنى ${coupon.minOrderVal}` });

    let discount = coupon.discountType === "percent" ? (orderTotal * coupon.value) / 100 : coupon.value;
    if (coupon.discountType === "percent" && coupon.maxDiscount && discount > coupon.maxDiscount) discount = coupon.maxDiscount;

    res.status(200).json({ status: "success", data: { discount, code: coupon.code, couponId: coupon._id } });
  } catch (err) { res.status(400).json({ message: err.message }); }
});

const restrictToStockFeature = (req, res, next) => {
  if (req.user.role === "owner" && !req.user.hasStock) {
    return res.status(403).json({
      status: "fail",
      message: "هذه الميزة غير مفعلة في باقتك، يرجى التواصل مع الإدارة.",
    });
  }
  next();
};

app.get("/api/v1/stock/logs", protect, restrictToStockFeature, async (req, res) => {
  try {
    const { restaurantId, startDate, endDate } = req.query;
    let query = supabase.from('stock_logs').select('*').eq('restaurant', restaurantId).order('date', { ascending: false });
    
    if (startDate && endDate) {
      const end = new Date(endDate); end.setHours(23, 59, 59, 999);
      query = query.gte('date', new Date(startDate).toISOString()).lte('date', end.toISOString());
    }
    
    const { data: logs, error } = await query;
    if (error) throw error;
    res.status(200).json({ status: "success", data: { logs } });
  } catch (err) { res.status(400).json({ message: err.message }); }
});

app.post("/api/v1/stock", protect, restrictToStockFeature, async (req, res) => {
  try {
    const { data: item, error } = await supabase.from('stock_items').insert([{ ...req.body, restaurant: req.body.restaurantId }]).select().single();
    if (error) throw error;
    res.status(201).json({ status: "success", data: item });
  } catch (err) { res.status(400).json({ message: err.message }); }
});

app.post("/api/v1/stock/:id/adjust", protect, restrictToStockFeature, async (req, res) => {
  try {
    const { amount, type } = req.body;
    const { data: item, error: fetchError } = await supabase.from('stock_items').select('*').eq('_id', req.params.id).single();
    if (fetchError || !item) throw new Error("العنصر غير موجود");

    const newQuantity = item.quantity + amount;
    
    const { data: updatedItem, error: updateError } = await supabase.from('stock_items').update({ quantity: newQuantity }).eq('_id', item._id).select().single();
    if (updateError) throw updateError;
    
    await supabase.from('stock_logs').insert([{ 
      restaurant: item.restaurant, stockItem: item._id, itemName: item.name, changeAmount: amount, type 
    }]);
    
    res.status(200).json({ status: "success", data: updatedItem });
  } catch (err) { res.status(400).json({ message: err.message }); }
});

app.delete("/api/v1/stock/:id", protect, restrictToStockFeature, async (req, res) => {
    try { 
      const { error } = await supabase.from('stock_items').delete().eq('_id', req.params.id);
      if (error) throw error;
      res.status(204).json({ status: "success" }); 
    }
    catch(err) { res.status(400).json({ message: err.message }); }
});

app.get("/api/v1/stock/:restaurantId", protect, restrictToStockFeature, async (req, res) => {
  try {
    const { data: items, error } = await supabase.from('stock_items').select('*').eq('restaurant', req.params.restaurantId);
    if (error) throw error;
    res.status(200).json({ status: "success", data: { items } });
  } catch (err) { res.status(400).json({ message: err.message }); }
});


app.get("/api/v1/reservations/status/:slug", async (req, res) => {
  try {
    const { data: restaurant, error } = await supabase.from('restaurants').select('restaurantName, reservationSettings, isActive').eq('slug', req.params.slug).single();
    if (error || !restaurant) return res.status(404).json({ message: "المطعم غير موجود" });

    const settings = restaurant.reservationSettings || { isEnabled: false, totalSeats: 0, bookedSeats: 0 };
    if (!settings.isEnabled) {
      return res.status(403).json({ message: "نظام الحجز غير مفعل حالياً" });
    }

    const available = settings.totalSeats - settings.bookedSeats;
    const isFull = available <= 0;

    res.status(200).json({ 
      status: "success", 
      data: { 
        restaurantName: restaurant.restaurantName,
        total: settings.totalSeats,
        booked: settings.bookedSeats,
        available: available > 0 ? available : 0,
        isFull
      } 
    });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

app.post("/api/v1/reservations/book/:slug", async (req, res) => {
  try {
    const { seats, name, phone } = req.body;
    const requestedSeats = Number(seats);
    
    if (!requestedSeats || requestedSeats <= 0) return res.status(400).json({ message: "عدد المقاعد غير صحيح" });
    if (!name || !phone) return res.status(400).json({ message: "الاسم ورقم الهاتف مطلوبين" });

    const { data: restaurant, error: resError } = await supabase.from('restaurants').select('_id, reservationSettings').eq('slug', req.params.slug).single();
    if (resError || !restaurant) return res.status(404).json({ message: "المطعم غير موجود" });

    const settings = restaurant.reservationSettings || { isEnabled: false, totalSeats: 0, bookedSeats: 0 };
    if (!settings.isEnabled) {
      return res.status(403).json({ message: "الحجز مغلق حالياً" });
    }

    const currentAvailable = settings.totalSeats - settings.bookedSeats;
    if (requestedSeats > currentAvailable) {
      return res.status(400).json({ 
        status: "fail", 
        message: currentAvailable === 0 ? "عذراً، العدد مكتمل!" : `متبقي فقط ${currentAvailable} مقاعد.` 
      });
    }

    const { data: newReservation, error: insertError } = await supabase.from('reservations').insert([{
      restaurant: restaurant._id,
      name,
      phone,
      seats: requestedSeats,
      status: "pending"
    }]).select().single();

    if (insertError) throw insertError;

    if (req.io) {
        req.io.to(restaurant._id.toString()).emit("new_reservation_request", newReservation);
    }

    res.status(200).json({ status: "success", message: "تم إرسال طلبك، بانتظار موافقة المطعم." });

  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

app.get("/api/v1/reservations/requests", protect, restrictTo("owner"), async (req, res) => {
    try {
        const { data: restaurant } = await supabase.from('restaurants').select('_id').eq('owner', req.user._id).single();
        if (!restaurant) return res.status(404).json({ message: "المطعم غير موجود" });

        const { data: reservations, error } = await supabase.from('reservations').select('*').eq('restaurant', restaurant._id).order('createdAt', { ascending: false });
        if (error) throw error;
        
        res.status(200).json({ status: "success", data: reservations });
    } catch (err) { res.status(400).json({ message: err.message }); }
});

app.patch("/api/v1/reservations/action/:id", protect, restrictTo("owner"), async (req, res) => {
  try {
    const { status } = req.body; 
    const { data: reservation, error: fetchError } = await supabase.from('reservations').select('*').eq('_id', req.params.id).single();
    if(fetchError || !reservation) return res.status(404).json({ message: "الطلب غير موجود" });

    if(reservation.status === status) return res.status(400).json({ message: "الطلب بالفعل على هذه الحالة" });

    const { data: restaurant } = await supabase.from('restaurants').select('_id, slug, reservationSettings').eq('_id', reservation.restaurant).single();
    const settings = restaurant.reservationSettings || { isEnabled: false, totalSeats: 0, bookedSeats: 0 };
    
    if (status === 'approved' && reservation.status !== 'approved') {
      const currentAvailable = settings.totalSeats - settings.bookedSeats;

      if (reservation.status === 'rejected' || reservation.status === 'pending') {
         if (reservation.seats > currentAvailable) {
            return res.status(400).json({ message: "لا توجد مقاعد كافية للموافقة الآن" });
         }
         settings.bookedSeats += reservation.seats;
         await supabase.from('restaurants').update({ reservationSettings: settings }).eq('_id', restaurant._id);
      }
      
      if (req.io) {
        req.io.emit("seats_updated", { slug: restaurant.slug, total: settings.totalSeats, booked: settings.bookedSeats, available: settings.totalSeats - settings.bookedSeats });
      }
    } else if (status === 'rejected' && reservation.status === 'approved') {
        settings.bookedSeats -= reservation.seats;
        if(settings.bookedSeats < 0) settings.bookedSeats = 0;
        await supabase.from('restaurants').update({ reservationSettings: settings }).eq('_id', restaurant._id);

        if (req.io) {
            req.io.emit("seats_updated", { slug: restaurant.slug, total: settings.totalSeats, booked: settings.bookedSeats, available: settings.totalSeats - settings.bookedSeats });
        }
    }

    const { data: updatedReservation, error: updateError } = await supabase.from('reservations').update({ status }).eq('_id', reservation._id).select().single();
    if (updateError) throw updateError;

    if(req.io) req.io.to(reservation.restaurant.toString()).emit("reservation_updated", updatedReservation);

    res.status(200).json({ status: "success", message: `تم ${status === 'approved' ? 'قبول' : 'رفض'} الطلب` });
  } catch (err) { res.status(400).json({ message: err.message }); }
});

app.delete("/api/v1/reservations/:id", protect, restrictTo("owner"), async (req, res) => {
    try {
        const { data: reservation, error: fetchError } = await supabase.from('reservations').select('*').eq('_id', req.params.id).single();
        if(fetchError || !reservation) return res.status(404).json({ message: "الطلب غير موجود" });

        const { error } = await supabase.from('reservations').delete().eq('_id', req.params.id);
        if (error) throw error;
        
        if(req.io) req.io.to(reservation.restaurant.toString()).emit("reservation_deleted", req.params.id);

        res.status(200).json({ status: "success", message: "تم حذف السجل" });
    } catch(err) {
        res.status(400).json({ message: err.message });
    }
});

app.patch("/api/v1/reservations/settings", protect, restrictTo("owner"), async (req, res) => {
  try {
    const { isEnabled, totalSeats, resetCounter } = req.body;
    const rId = req.body.restaurantId;

    const { data: restaurant, error: fetchError } = await supabase.from('restaurants').select('_id, slug, reservationSettings').eq('_id', rId).single();
    if (fetchError || !restaurant) throw new Error("المطعم غير موجود");

    let settings = restaurant.reservationSettings || { isEnabled: false, totalSeats: 0, bookedSeats: 0 };
    
    if (isEnabled !== undefined) settings.isEnabled = isEnabled;
    if (totalSeats !== undefined) settings.totalSeats = Number(totalSeats);
    if (resetCounter === true) settings.bookedSeats = 0;

    const { data: updatedRestaurant, error: updateError } = await supabase.from('restaurants').update({ reservationSettings: settings }).eq('_id', rId).select().single();
    if (updateError) throw updateError;
    
    if (req.io) {
        req.io.emit("seats_updated", { slug: updatedRestaurant.slug, total: settings.totalSeats, booked: settings.bookedSeats, available: settings.totalSeats - settings.bookedSeats });
    }

    res.status(200).json({ status: "success", data: { reservationSettings: settings } });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});
app.post("/api/v1/sales/join", upload.single('image'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: "يرجى رفع صورة" });
    const { data: newRequest, error } = await supabase.from('sales_requests').insert([{ 
      name: req.body.name, phone: req.body.phone, walletNumber: req.body.walletNumber, image: req.file.path, status: 'pending'
    }]).select().single();
    
    if (error) throw error;
    if (req.io) req.io.emit("new-sales-request", newRequest);
    res.status(201).json({ status: "success", data: newRequest });
  } catch (err) { res.status(400).json({ message: err.message }); }
});

app.get("/api/v1/sales/requests", protect, restrictTo("admin"), async (req, res) => {
  try { 
    const { data: requests, error } = await supabase.from('sales_requests').select('*').order('createdAt', { ascending: false });
    if (error) throw error;
    res.status(200).json({ status: "success", data: requests }); 
  }
  catch(err) { res.status(400).json({ message: err.message }); }
});


app.post("/api/v1/users/create-sales-agent", protect, restrictTo("admin"), async (req, res) => {
  try {
    const { name, email, password, phone } = req.body;
    const hashedPassword = await bcrypt.hash(password, 12);
    
    const { data: newSales, error } = await supabase.from('users').insert([{
      name, email, password: hashedPassword, phone, role: "sales", active: true
    }]).select().single();

    if (error) {
      if (error.code === '23505') throw new Error("هذا البريد مستخدم بالفعل");
      throw error;
    }
    res.status(201).json({ status: "success", data: { user: newSales } });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

app.get("/api/v1/admin/sales-stats", protect, restrictTo("admin"), async (req, res) => {
  try {
    const { data: salesAgents, error: agentsError } = await supabase.from('users').select('*').eq('role', 'sales');
    if (agentsError) throw agentsError;
    
    const stats = await Promise.all((salesAgents || []).map(async (agent) => {
      const { data: clients } = await supabase.from('users').select('*').eq('createdBy', agent._id);
      
      const safeClients = clients || [];
      const totalClients = safeClients.length;
      const activeClients = safeClients.filter(c => c.active && !c.isTrial).length; 
      const trialClients = safeClients.filter(c => c.isTrial).length;
      
      return {
        _id: agent._id,
        salesName: agent.name,
        salesEmail: agent.email,
        salesPhone: agent.phone,
        totalClients,
        activeClients,
        trialClients,
        clientsList: safeClients.map(c => ({
            name: c.name, email: c.email, phone: c.phone, isTrial: c.isTrial, active: c.active, createdAt: c.createdAt
        }))
      };
    }));

    stats.sort((a, b) => b.activeClients - a.activeClients);
    res.status(200).json({ status: "success", data: { stats } });
  } catch (err) { res.status(400).json({ message: err.message }); }
});

app.post("/api/v1/sales/create-client", protect, restrictTo("sales", "admin"), async (req, res) => {
  try {
    const { name, email, password, phone, restaurantName, slug } = req.body;
    
    const trialEnds = new Date();
    trialEnds.setHours(trialEnds.getHours() + 24);
    const hashedPassword = await bcrypt.hash(password, 12);
    
    const { data: newUser, error: userError } = await supabase.from('users').insert([{
      name, email, password: hashedPassword, phone, role: "owner",
      isTrial: true, trialExpires: trialEnds.toISOString(), createdBy: req.user._id,
      productLimit: 75, hasStock: false
    }]).select().single();

    if (userError) {
      if (userError.code === '23505') throw new Error("البيانات (الايميل أو الرابط) مكررة");
      throw userError;
    }

    const { data: newRestaurant, error: resError } = await supabase.from('restaurants').insert([{
      restaurantName, slug, owner: newUser._id, contactInfo: { phone, whatsapp: phone, address: "العنوان الافتراضي" }
    }]).select().single();
    
    if (resError) throw resError;

    res.status(201).json({ status: "success", data: { user: newUser, restaurant: newRestaurant } });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

app.patch("/api/v1/sales/requests/:id", protect, restrictTo("admin"), async (req, res) => {
  try {
    const { status, email, password } = req.body;
    const { data: request, error: reqError } = await supabase.from('sales_requests').update({ status }).eq('_id', req.params.id).select().single();
    if (reqError) throw reqError;
    
    if (status === "approved" && email && password) {
      const hashedPassword = await bcrypt.hash(password, 12);
      await supabase.from('users').insert([{
        name: request.name, email: email, password: hashedPassword, phone: request.phone, role: "sales", active: true
      }]);
    }

    res.status(200).json({ status: "success", data: request });
  } catch(err) { res.status(400).json({ message: err.message }); }
});

app.delete("/api/v1/sales/requests/:id", protect, restrictTo("admin"), async (req, res) => {
    try { 
        const { error } = await supabase.from('sales_requests').delete().eq('_id', req.params.id); 
        if (error) throw error;
        res.status(200).json({ status: "success", message: "تم حذف الطلب" }); 
    }
    catch(err) { res.status(400).json({ message: err.message }); }
});

app.delete("/api/v1/sales/:id", protect, restrictTo("admin"), async (req, res) => {
    try {
        const { data: request } = await supabase.from('sales_requests').select('*').eq('_id', req.params.id).single();
        let userDeleted = false;

        if (request) {
            await supabase.from('sales_requests').delete().eq('_id', req.params.id);
            const { error: delError } = await supabase.from('users').delete().eq('phone', request.phone).eq('role', 'sales');
            if (!delError) userDeleted = true;
        } else {
            const { error: delError } = await supabase.from('users').delete().eq('_id', req.params.id).eq('role', 'sales');
            if (!delError) userDeleted = true;
        }

        if (!request && !userDeleted) {
            return res.status(404).json({ status: "fail", message: "الوكيل أو الطلب غير موجود" });
        }

        res.status(200).json({ status: "success", message: "تم حذف الوكيل والبيانات المرتبطة بنجاح" });
    } catch (err) {
        res.status(400).json({ status: "error", message: err.message });
    }
});

app.post("/api/v1/ai/process-menu", protect, restrictTo("admin"), memoryUpload.array("menuImages", 10), async (req, res) => {
  try {
    const { ownerId } = req.body;
    if (!req.files || req.files.length === 0) throw new Error("يرجى رفع صور المنيو");
    const { data: restaurant } = await supabase.from('restaurants').select('_id').eq('owner', ownerId).single();
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
      let { data: category } = await supabase.from('categories').select('*').eq('name', item.category).eq('restaurant_id', restaurantId).single();
      
      if (!category) {
        const { data: newCat } = await supabase.from('categories').insert([{ name: item.category, restaurant_id: restaurantId }]).select().single();
        category = newCat;
      }

      const productInserts = item.products.map((p) => ({
          name: { ar: p.name, en: p.name }, 
          description: { ar: p.description, en: "" },
          price: p.price, 
          category: category.name, 
          restaurant: restaurantId, 
          image: "",
          isAvailable: true
      }));
      
      if (productInserts.length > 0) {
          await supabase.from('products').insert(productInserts);
      }
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


// ======================= SEO / Brand helpers =======================
const SITE_URL = (process.env.SITE_URL || "https://imenueg.com").replace(/\/+$/, "");

const escHtml = (str) =>
  String(str == null ? "" : str)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

const absUrl = (p) => {
  const u = String(p || "").replace(/\\/g, "/").trim();
  if (!u) return "";
  if (/^https?:\/\//i.test(u)) return u;
  return `${SITE_URL}/${u.replace(/^\/+/, "")}`;
};

// الأولوية: لوجو صفحة المتجر ← صورة المطعم ← صورة الهيرو
const pickBrandImage = (r) =>
  absUrl(r.storePage && r.storePage.logo) ||
  absUrl(r.image) ||
  absUrl(r.customUI && r.customUI.heroImage) ||
  "";

const slugToWords = (slug) => String(slug || "").replace(/[-_]+/g, " ").trim();

const getBrand = async (slug) => {
  const { data, error } = await supabase
    .from("restaurants")
    .select("restaurantName, slug, image, customUI, storePage, isActive, owner:users(active, subscriptionExpires, isTrial)")
    .eq("slug", slug)
    .single();
  if (error || !data) return null;
  const o = Array.isArray(data.owner) ? data.owner[0] : data.owner;
  const expired = o && o.subscriptionExpires && new Date() > new Date(o.subscriptionExpires);
  data.isPublic = data.isActive !== false && !(o && (o.active === false || expired || o.isTrial));
  return data;
};

const injectHead = (html, { title, description, url, image, keywords, robots, jsonld }) => {
  const tags = [
    `<title>${escHtml(title)}</title>`,
    `<meta name="description" content="${escHtml(description)}" />`,
    keywords ? `<meta name="keywords" content="${escHtml(keywords)}" />` : "",
    `<meta name="robots" content="${robots || "index, follow, max-image-preview:large"}" />`,
    `<link rel="canonical" href="${escHtml(url)}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="iMenu" />`,
    `<meta property="og:locale" content="ar_EG" />`,
    `<meta property="og:title" content="${escHtml(title)}" />`,
    `<meta property="og:description" content="${escHtml(description)}" />`,
    `<meta property="og:url" content="${escHtml(url)}" />`,
    image ? `<meta property="og:image" content="${escHtml(image)}" />` : "",
    image ? `<meta property="og:image:alt" content="${escHtml(title)}" />` : "",
    `<meta name="twitter:card" content="summary" />`,
    `<meta name="twitter:title" content="${escHtml(title)}" />`,
    `<meta name="twitter:description" content="${escHtml(description)}" />`,
    image ? `<meta name="twitter:image" content="${escHtml(image)}" />` : "",
    image ? `<link rel="icon" href="${escHtml(image)}" />` : "",
    jsonld ? `<script type="application/ld+json">${JSON.stringify(jsonld).replace(/</g, "\\u003c")}</script>` : "",
  ].filter(Boolean).join("\n    ");

  html = html.replace(/<title>[\s\S]*?<\/title>/i, "");
  html = html.replace(/<meta\s+(?:property|name)=["'](?:og:|twitter:|description|keywords|robots)[^"']*["'][^>]*>/gi, "");
  html = html.replace(/<link\s+rel=["'](?:canonical|icon)["'][^>]*>/gi, "");
  return html.replace(/<head(\s[^>]*)?>/i, (m) => `${m}\n    ${tags}\n`);
};

const buildJsonLd = (r, pageUrl, image, kind) => {
  const name = r.restaurantName || r.slug;
  const words = slugToWords(r.slug);
  const alt = words && words.toLowerCase() !== String(name).toLowerCase() ? [words] : [];
  return {
    "@context": "https://schema.org",
    "@type": "Restaurant",
    name,
    ...(alt.length ? { alternateName: alt } : {}),
    url: pageUrl,
    ...(image ? { image, logo: image } : {}),
    ...(kind === "menu" ? { hasMenu: pageUrl } : {}),
    isPartOf: { "@type": "WebSite", name: "iMenu", url: SITE_URL },
  };
};

// ======================= /menu/:slug =======================
app.get("/menu/:slug", async (req, res) => {
  const filePath = path.join(__dirname, "public", "menu.html");
  try {
    const r = await getBrand(req.params.slug);
    let html = fs.readFileSync(filePath, "utf8");
    if (r) {
      const name = r.restaurantName || r.slug;
      const words = slugToWords(r.slug);
      const showWords = words && words.toLowerCase() !== String(name).toLowerCase();
      const title = `${name}${showWords ? ` (${words})` : ""} | المنيو الإلكتروني`;
      const description = `شوف منيو ${name} بالأصناف والأسعار وأطلب أونلاين — منيو إلكتروني من iMenu.`;
      const pageUrl = `${SITE_URL}/menu/${encodeURIComponent(r.slug)}`;
      const image = pickBrandImage(r);
      html = injectHead(html, {
        title, description, url: pageUrl, image,
        keywords: [name, words, "منيو", "menu", "iMenu"].filter(Boolean).join(", "),
        robots: r.isPublic ? undefined : "noindex, nofollow",
        jsonld: buildJsonLd(r, pageUrl, image, "menu"),
      });
    }
    res.set("Cache-Control", "public, max-age=300");
    res.send(html);
  } catch (err) {
    console.error("Menu meta injection error:", err);
    res.sendFile(filePath);
  }
});

app.get("/reserve/:slug", (req, res) => res.sendFile(path.join(__dirname, "public", "reservation.html")));
app.get("/rate/:slug", (req, res) => res.sendFile(path.join(__dirname, "public", "rate.html")));

// ======================= /store/:slug =======================
app.get("/store/:slug", async (req, res) => {
  const filePath = path.join(__dirname, "public", "store.html");
  try {
    const r = await getBrand(req.params.slug);
    let html = fs.readFileSync(filePath, "utf8");
    if (r) {
      const sp = r.storePage || {};
      const name = sp.title || r.restaurantName || "صفحة المتجر";
      const words = slugToWords(r.slug);
      const showWords = words && words.toLowerCase() !== String(name).toLowerCase();
      const description = sp.message || sp.subtitle || sp.greeting || `تابع ${name} وكل روابطنا من هنا`;
      const pageUrl = `${SITE_URL}/store/${encodeURIComponent(r.slug)}`;
      const image = pickBrandImage(r);
      html = injectHead(html, {
        title: `${name}${showWords ? ` (${words})` : ""}`,
        description, url: pageUrl, image,
        keywords: [name, words, "iMenu"].filter(Boolean).join(", "),
        robots: r.isPublic && sp.enabled !== false ? undefined : "noindex, nofollow",
        jsonld: buildJsonLd(r, pageUrl, image, "store"),
      });
    }
    res.set("Cache-Control", "public, max-age=300");
    res.send(html);
  } catch (err) {
    console.error("Store page meta injection error:", err);
    res.sendFile(filePath);
  }
});

// ======================= دليل المنيوهات + sitemap + robots =======================
const listPublicBrands = async () => {
  const { data, error } = await supabase
    .from("restaurants")
    .select("restaurantName, slug, image, customUI, storePage, isActive, owner:users(active, subscriptionExpires, isTrial)");
  if (error) throw error;
  const now = new Date();
  return (data || [])
    .filter((r) => {
      if (!r.slug || r.isActive === false) return false;
      const o = Array.isArray(r.owner) ? r.owner[0] : r.owner;
      if (o && (o.active === false || o.isTrial)) return false;
      if (o && o.subscriptionExpires && now > new Date(o.subscriptionExpires)) return false;
      return true;
    })
    .map((r) => ({
      slug: r.slug,
      name: r.restaurantName || r.slug,
      image: pickBrandImage(r),
      hasStore: !!(r.storePage && r.storePage.enabled !== false && (r.storePage.title || (r.storePage.links || []).length)),
    }))
    .sort((a, b) => String(a.name).localeCompare(String(b.name), "ar"));
};

app.get("/menus", async (req, res) => {
  try {
    const brands = await listPublicBrands();
    const cards = brands.map((b) => {
      const ini = escHtml(String(b.name).trim().charAt(0));
      const logo = b.image
        ? `<img src="${escHtml(b.image)}" alt="${escHtml(b.name)}" loading="lazy" onerror="this.replaceWith(Object.assign(document.createElement('span'),{textContent:'${ini}'}))">`
        : `<span>${ini}</span>`;
      return `<div class="card"><a class="logo" href="/menu/${encodeURIComponent(b.slug)}">${logo}</a><h2><a href="/menu/${encodeURIComponent(b.slug)}">${escHtml(b.name)}</a></h2><div class="links"><a href="/menu/${encodeURIComponent(b.slug)}">المنيو</a>${b.hasStore ? `<a href="/store/${encodeURIComponent(b.slug)}">صفحة المتجر</a>` : ""}</div></div>`;
    }).join("");

    const jsonld = {
      "@context": "https://schema.org",
      "@type": "ItemList",
      name: "منيوهات ومتاجر iMenu",
      itemListElement: brands.map((b, i) => ({ "@type": "ListItem", position: i + 1, name: b.name, url: `${SITE_URL}/menu/${encodeURIComponent(b.slug)}` })),
    };

    const html = `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />
<title>كل المنيوهات والمتاجر | iMenu</title>
<meta name="description" content="دليل المطاعم والكافيهات والمتاجر اللي عندها منيو إلكتروني على iMenu. اختار المكان وشوف المنيو." />
<meta name="robots" content="index, follow" />
<link rel="canonical" href="${SITE_URL}/menus" />
<meta property="og:type" content="website" /><meta property="og:title" content="كل المنيوهات والمتاجر | iMenu" /><meta property="og:url" content="${SITE_URL}/menus" /><meta property="og:image" content="${SITE_URL}/og-image.jpg" />
<script type="application/ld+json">${JSON.stringify(jsonld).replace(/</g, "\\u003c")}</script>
<link href="https://fonts.googleapis.com/css2?family=Tajawal:wght@400;700;800&display=swap" rel="stylesheet" />
<style>
*{box-sizing:border-box;margin:0;font-family:"Tajawal",sans-serif}body{background:#0f1115;color:#fff;padding:90px 5% 40px}
a{color:inherit;text-decoration:none}header{position:fixed;inset:0 0 auto 0;padding:16px 5%;background:rgba(15,17,21,.95);border-bottom:1px solid rgba(255,255,255,.08);font-weight:900;font-size:22px}
header b{color:#d4af37}h1{text-align:center;font-size:clamp(24px,4vw,38px);margin-bottom:8px}p.sub{text-align:center;color:#9ca3af;margin-bottom:32px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:16px;max-width:1100px;margin:auto}
.card{background:rgba(30,35,45,.7);border:1px solid rgba(255,255,255,.08);border-radius:18px;padding:20px 14px;text-align:center}
.logo{width:84px;height:84px;border-radius:50%;margin:0 auto 12px;background:#1b2029;display:flex;align-items:center;justify-content:center;overflow:hidden;font-size:34px;font-weight:800;color:#d4af37}
.logo img{width:100%;height:100%;object-fit:cover}h2{font-size:16px;margin-bottom:10px}
.links{display:flex;gap:8px;justify-content:center;flex-wrap:wrap}.links a{font-size:13px;padding:6px 12px;border-radius:50px;border:1px solid #d4af37;color:#d4af37}.links a:hover{background:#d4af37;color:#000}
</style></head><body>
<header><a href="/"><b>i</b>Menu</a></header>
<h1>كل المنيوهات والمتاجر</h1><p class="sub">الأماكن اللي عندها منيو إلكتروني على iMenu</p>
<div class="grid">${cards || "<p class='sub'>لا يوجد بعد</p>"}</div>
</body></html>`;
    res.set("Cache-Control", "public, max-age=600");
    res.type("html").send(html);
  } catch (err) {
    console.error("menus directory error:", err);
    res.status(500).send("Error");
  }
});

app.get("/sitemap.xml", async (req, res) => {
  try {
    const brands = await listPublicBrands();
    const urls = [
      `<url><loc>${SITE_URL}/</loc><priority>1.0</priority></url>`,
      `<url><loc>${SITE_URL}/menus</loc><priority>0.9</priority></url>`,
    ];
    brands.forEach((b) => {
      const img = b.image ? `<image:image><image:loc>${escHtml(b.image)}</image:loc><image:title>${escHtml(b.name)}</image:title></image:image>` : "";
      urls.push(`<url><loc>${SITE_URL}/menu/${encodeURIComponent(b.slug)}</loc><priority>0.8</priority>${img}</url>`);
      if (b.hasStore) urls.push(`<url><loc>${SITE_URL}/store/${encodeURIComponent(b.slug)}</loc><priority>0.7</priority>${img}</url>`);
    });
    res.set("Cache-Control", "public, max-age=3600");
    res.type("application/xml").send(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">\n${urls.join("\n")}\n</urlset>`);
  } catch (err) {
    console.error("sitemap error:", err);
    res.status(500).send("Error");
  }
});

app.get("/robots.txt", (req, res) => {
  res.type("text/plain").send(
`User-agent: *
Allow: /
Disallow: /api/
Disallow: /owner
Disallow: /super-admin
Disallow: /sales-dashboard
Disallow: /login
Disallow: /simulator

Sitemap: ${SITE_URL}/sitemap.xml
`);
});

app.get("/simulator", (req, res) => res.sendFile(path.join(__dirname, "public", "simulator.html")));
app.get("/owner", (req, res) => res.sendFile(path.join(__dirname, "public", "admin.html")));
app.get("/super-admin", (req, res) => res.sendFile(path.join(__dirname, "public", "super.html")));
app.get("/sales-dashboard", (req, res) => res.sendFile(path.join(__dirname, "public", "sales.html")));
app.get("/login", (req, res) => res.sendFile(path.join(__dirname, "public", "login.html")));
app.get("/join-sales", (req, res) => res.sendFile(path.join(__dirname, "public", "sales-register.html")));
app.get("/promo", (req, res) => res.sendFile(path.join(__dirname, "public", "promo.html")));
app.get("/", (req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));

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

app.post("/api/v1/subscribe", async (req, res) => {
  await PushSubscription.findOneAndUpdate({ endpoint: req.body.endpoint }, req.body, { upsert: true });
  res.status(201).json({ status: "success" });
});

app.get("/api/v1/sales/my-clients", protect, restrictTo("sales"), async (req, res) => {
  try {
    const clients = await User.find({ createdBy: req.user._id }).sort("-createdAt");
    res.status(200).json({ status: "success", data: { clients } });
  } catch (err) { res.status(400).json({ message: err.message }); }
});


app.get("/api/v1/vapid-key", (req, res) => res.json({ publicKey: publicVapidKey }));


app.post("/api/v1/owner/push-subscribe", protect, async (req, res) => {
  try {
    let restaurantId = req.user.restaurant;
    if (req.user.role === "owner") {
      const { data: restaurant } = await supabase
        .from("restaurants")
        .select("_id")
        .eq("owner", req.user._id)
        .single();
      if (!restaurant) return res.status(404).json({ message: "لم يتم العثور على مطعم" });
      restaurantId = restaurant._id;
    }
    if (!restaurantId) return res.status(400).json({ message: "لا يوجد مطعم مرتبط بالحساب" });

    const { endpoint, keys } = req.body || {};
    if (!endpoint || !keys || !keys.p256dh || !keys.auth) {
      return res.status(400).json({ message: "بيانات الاشتراك غير مكتملة" });
    }

    const { error } = await supabase.from("push_subscriptions").upsert(
      {
        restaurant_id: restaurantId,
        endpoint,
        p256dh: keys.p256dh,
        auth: keys.auth,
      },
      { onConflict: "restaurant_id,endpoint" },
    );

    if (error) throw error;
    res.status(201).json({ status: "success" });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

app.post("/api/v1/owner/push-unsubscribe", protect, async (req, res) => {
  try {
    const { endpoint } = req.body || {};
    if (!endpoint) return res.status(400).json({ message: "endpoint مطلوب" });
    await supabase.from("push_subscriptions").delete().eq("endpoint", endpoint);
    res.status(200).json({ status: "success" });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});


async function sendPushToRestaurant(restaurantId, payloadObj) {
  try {
    const { data: subs } = await supabase
      .from("push_subscriptions")
      .select("*")
      .eq("restaurant_id", restaurantId);

    if (!subs || subs.length === 0) return;

    const payload = JSON.stringify(payloadObj);
    subs.forEach((sub) => {
      webPush
        .sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, payload)
        .catch((e) => {
          if (e.statusCode === 410 || e.statusCode === 404) {
            supabase.from("push_subscriptions").delete().eq("id", sub.id).then(() => {});
          } else {
            console.error("Push error:", e.message);
          }
        });
    });
  } catch (e) {
    console.error("sendPushToRestaurant error:", e.message);
  }
}

app.get("/api/v1/ratings/info/:slug", async (req, res) => {
  try {
    const { data: restaurant, error } = await supabase
      .from("restaurants")
      .select("restaurantName, customUI, isActive")
      .eq("slug", req.params.slug)
      .single();

    if (error || !restaurant) return res.status(404).json({ message: "المطعم غير موجود" });

    res.status(200).json({
      status: "success",
      data: {
        restaurantName: restaurant.restaurantName,
        primaryColor: restaurant.customUI?.primaryColor || "#B78728",
      },
    });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

app.get("/api/v1/store-page/:slug", async (req, res) => {
  try {
    const { data: restaurant, error } = await supabase
      .from("restaurants")
      .select("_id, restaurantName, slug, storePage, isActive")
      .eq("slug", req.params.slug)
      .single();

    if (error || !restaurant) return res.status(404).json({ status: "error", message: "الصفحة غير متاحة" });

    const storePage = restaurant.storePage || {};
    if (restaurant.isActive === false || storePage.enabled === false) {
      return res.status(404).json({ status: "error", message: "هذه الصفحة غير متاحة حالياً" });
    }

    let reviews = [];
    let ratingsAverage = 0;
    let ratingsCount = 0;
    try {
      const { data: allRatings } = await supabase
        .from("ratings")
        .select("customerName, stars, comment, createdAt")
        .eq("restaurant", restaurant._id)
        .order("createdAt", { ascending: false });

      const list = allRatings || [];
      ratingsCount = list.length;
      if (ratingsCount > 0) {
        ratingsAverage = Math.round((list.reduce((sum, r) => sum + Number(r.stars || 0), 0) / ratingsCount) * 10) / 10;
      }

      reviews = list
        .filter((r) => Number(r.stars) > 3 && r.comment && r.comment.trim())
        .slice(0, 12)
        .map((r) => ({
          name: (r.customerName || "عميل").trim().split(/\s+/)[0],
          stars: Number(r.stars),
          comment: r.comment.trim(),
          date: r.createdAt || null,
        }));
    } catch (e) {
      console.error("store-page reviews error:", e.message);
    }

    res.status(200).json({
      status: "success",
      data: {
        restaurantName: restaurant.restaurantName,
        slug: restaurant.slug,
        reviews,
        ratingsAverage,
        ratingsCount,
        title: storePage.title || restaurant.restaurantName,
        subtitle: storePage.subtitle || "",
        greeting: storePage.greeting || "",
        message: storePage.message || "",
        logo: storePage.logo || "",
        primaryColor: storePage.primaryColor || "#B78728",
        occasionTheme: storePage.occasionTheme || "none",
        links: (storePage.links || []).filter((l) => l.enabled !== false),
      },
    });
  } catch (err) {
    res.status(400).json({ status: "error", message: err.message });
  }
});

app.post("/api/v1/ratings/submit/:slug", async (req, res) => {
  try {
    const { name, phone, visitTime, stars, comment } = req.body;
    const starsNum = Number(stars);

    if (!name || !name.trim()) return res.status(400).json({ message: "من فضلك اكتب اسمك" });
    if (!phone || !phone.trim()) return res.status(400).json({ message: "من فضلك اكتب رقم تليفونك" });
    if (!/^01[0-9]{9}$/.test(phone.trim())) return res.status(400).json({ message: "رقم التليفون غير صحيح" });
    if (!starsNum || starsNum < 1 || starsNum > 5) return res.status(400).json({ message: "من فضلك اختر تقييم من 1 إلى 5 نجوم" });

    const { data: restaurant, error: resError } = await supabase
      .from("restaurants")
      .select("_id, restaurantName")
      .eq("slug", req.params.slug)
      .single();

    if (resError || !restaurant) return res.status(404).json({ message: "المطعم غير موجود" });

    const { data: newRating, error: insertError } = await supabase
      .from("ratings")
      .insert([{
        restaurant: restaurant._id,
        customerName: name.trim(),
        customerPhone: phone.trim(),
        visitTime: (visitTime || "").trim(),
        stars: starsNum,
        comment: (comment || "").trim(),
      }])
      .select()
      .single();

    if (insertError) throw insertError;

    if (req.io) {
      req.io.to(restaurant._id.toString()).emit("new_rating", newRating);
    }

    const starsEmoji = "⭐".repeat(starsNum);
    sendPushToRestaurant(restaurant._id, {
      title: `${starsEmoji} تقييم جديد من ${name.trim()}`,
      body: (comment || "").trim() || `تقييم ${starsNum} نجوم على ${restaurant.restaurantName}`,
      url: "/owner",
    });

    res.status(200).json({ status: "success", message: "تم إرسال تقييمك، شكراً لوقتك!" });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

app.get("/api/v1/ratings/list", protect, restrictTo("owner", "admin"), async (req, res) => {
  try {
    const { data: restaurant } = await supabase.from("restaurants").select("_id").eq("owner", req.user._id).single();
    if (!restaurant) return res.status(404).json({ message: "المطعم غير موجود" });

    const { data: ratings, error } = await supabase
      .from("ratings")
      .select("*")
      .eq("restaurant", restaurant._id)
      .order("createdAt", { ascending: false });

    if (error) throw error;

    const count = ratings ? ratings.length : 0;
    const average = count > 0 ? ratings.reduce((sum, r) => sum + Number(r.stars || 0), 0) / count : 0;

    res.status(200).json({
      status: "success",
      data: { ratings: ratings || [], average: Math.round(average * 10) / 10, count },
    });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

app.delete("/api/v1/ratings/:id", protect, restrictTo("owner", "admin"), async (req, res) => {
  try {
    const { data: restaurant } = await supabase.from("restaurants").select("_id").eq("owner", req.user._id).single();
    if (!restaurant) return res.status(404).json({ message: "المطعم غير موجود" });

    const { data: rating, error: findError } = await supabase
      .from("ratings")
      .select("_id, restaurant")
      .eq("_id", req.params.id)
      .single();

    if (findError || !rating) return res.status(404).json({ message: "التقييم غير موجود" });
    if (String(rating.restaurant) !== String(restaurant._id)) {
      return res.status(403).json({ message: "غير مسموح لك بمسح هذا التقييم" });
    }

    const { error: deleteError } = await supabase.from("ratings").delete().eq("_id", req.params.id);
    if (deleteError) throw deleteError;

    res.status(200).json({ status: "success", message: "تم مسح التقييم" });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

app.delete("/api/v1/ratings", protect, restrictTo("owner", "admin"), async (req, res) => {
  try {
    const { data: restaurant } = await supabase.from("restaurants").select("_id").eq("owner", req.user._id).single();
    if (!restaurant) return res.status(404).json({ message: "المطعم غير موجود" });

    const { error: deleteError } = await supabase.from("ratings").delete().eq("restaurant", restaurant._id);
    if (deleteError) throw deleteError;

    res.status(200).json({ status: "success", message: "تم مسح كل التقييمات" });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});


app.get("/api/v1/accounting/stats", protect, restrictTo("owner", "admin"), async (req, res) => {
  try {
    const { data: restaurant } = await supabase.from('restaurants').select('_id').eq('owner', req.user._id).single();
    if (!restaurant) return res.status(404).json({ message: "المطعم غير موجود" });

    let startOfMonth, endOfMonth, targetMonthStr;
    if (req.query.month) {
        const [y, m] = req.query.month.split('-');
        startOfMonth = new Date(y, m - 1, 1).toISOString();
        endOfMonth = new Date(y, m, 0, 23, 59, 59, 999).toISOString();
        targetMonthStr = req.query.month;
    } else {
        const now = new Date();
        startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
        endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999).toISOString();
        const m = now.getMonth() + 1;
        targetMonthStr = `${now.getFullYear()}-${m < 10 ? '0' + m : m}`;
    }

    const { data: salesDetails } = await supabase.from('orders')
        .select('orderNum, totalPrice, createdAt, tableNumber, items')
        .eq('restaurant', restaurant._id).eq('status', 'completed')
        .gte('createdAt', startOfMonth).lte('createdAt', endOfMonth)
        .order('createdAt', { ascending: false });
    
    const totalSales = (salesDetails || []).reduce((sum, order) => sum + order.totalPrice, 0);

    const { data: expensesDetails } = await supabase.from('expenses')
        .select('*').eq('restaurant', restaurant._id)
        .gte('date', startOfMonth).lte('date', endOfMonth)
        .order('date', { ascending: false });

    const totalExpenses = (expensesDetails || []).filter(exp => exp.category !== 'salaries').reduce((sum, exp) => sum + exp.amount, 0);

    const { data: payrollDetails } = await supabase.from('payrolls')
        .select('*, employee:employees(name, jobTitle)')
        .eq('restaurant', restaurant._id).eq('month', targetMonthStr);

    const totalSalaries = (payrollDetails || []).reduce((sum, p) => sum + p.totalSalary, 0);
    const netProfit = totalSales - (totalExpenses + totalSalaries);

    res.status(200).json({ 
        status: "success", 
        data: { 
            totalSales, totalExpenses, totalSalaries, netProfit,
            details: { sales: salesDetails, expenses: expensesDetails, salaries: payrollDetails }
        } 
    });
  } catch (err) { res.status(400).json({ message: err.message }); }
});

app.post("/api/v1/accounting/expenses", protect, restrictTo("owner", "admin"), async (req, res) => {
  try {
    const { data: restaurant } = await supabase.from('restaurants').select('_id').eq('owner', req.user._id).single();
    if (!restaurant) return res.status(404).json({ message: "لم يتم العثور على مطعم مرتبط بهذا الحساب" });
    
    const { data: expense, error: insertError } = await supabase.from('expenses').insert([{ ...req.body, restaurant: restaurant._id }]).select().single();
    if (insertError) throw insertError;

    if (req.body.category === 'salary_advance' && req.body.employee) {
        const { data: emp } = await supabase.from('employees').select('loanBalance').eq('_id', req.body.employee).single();
        if (emp) await supabase.from('employees').update({ loanBalance: emp.loanBalance + req.body.amount }).eq('_id', req.body.employee);
    }

    res.status(201).json({ status: "success", data: expense });
  } catch (err) { res.status(400).json({ message: err.message }); }
});

app.get("/api/v1/accounting/expenses", protect, async (req, res) => {
  try {
    const { data: restaurant } = await supabase.from('restaurants').select('_id').eq('owner', req.user._id).single();
    if (!restaurant) return res.status(200).json({ status: "success", data: [] });

    const { data: expenses, error } = await supabase.from('expenses').select('*').eq('restaurant', restaurant._id).order('date', { ascending: false });
    if (error) throw error;
    
    res.status(200).json({ status: "success", data: expenses });
  } catch (err) { res.status(400).json({ message: err.message }); }
});

app.delete("/api/v1/accounting/expenses/:id", protect, restrictTo("owner"), async (req, res) => {
  try { 
      const { data: expense, error: fetchError } = await supabase.from('expenses').select('*').eq('_id', req.params.id).single();
      if (fetchError || !expense) return res.status(404).json({ message: "المصروف غير موجود" });

      if (expense.category === 'salary_advance' && expense.employee) {
          const { data: emp } = await supabase.from('employees').select('loanBalance').eq('_id', expense.employee).single();
          if (emp) await supabase.from('employees').update({ loanBalance: emp.loanBalance - expense.amount }).eq('_id', expense.employee);
      }

      const { error: delError } = await supabase.from('expenses').delete().eq('_id', req.params.id); 
      if (delError) throw delError;
      
      res.status(200).json({ status: "success" }); 
  } 
  catch (err) { res.status(400).json({ message: err.message }); }
});

app.post("/api/v1/accounting/employees", protect, restrictTo("owner", "admin"), async (req, res) => {
  try {
    const { data: restaurant } = await supabase.from('restaurants').select('_id').eq('owner', req.user._id).single();
    if (!restaurant) return res.status(404).json({ message: "المطعم غير موجود" });

    const { data: emp, error } = await supabase.from('employees').insert([{ ...req.body, restaurant: restaurant._id }]).select().single();
    if (error) throw error;

    res.status(201).json({ status: "success", data: emp });
  } catch (err) { res.status(400).json({ message: err.message }); }
});

app.patch("/api/v1/accounting/employees/:id", protect, restrictTo("owner", "admin"), async (req, res) => {
  try {
    const updates = { ...req.body };
    delete updates.restaurant; 
    
    const { data: emp, error } = await supabase.from('employees').update(updates).eq('_id', req.params.id).select().single();
    if (error || !emp) return res.status(404).json({ message: "الموظف غير موجود" });
    
    res.status(200).json({ status: "success", data: emp });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

app.get("/api/v1/accounting/employees", protect, async (req, res) => {
  try {
    const { data: restaurant } = await supabase.from('restaurants').select('_id').eq('owner', req.user._id).single();
    if (!restaurant) return res.status(200).json({ status: "success", data: [] });

    const { data: employees, error } = await supabase.from('employees').select('*').eq('restaurant', restaurant._id).order('createdAt', { ascending: false });
    if (error) throw error;

    res.status(200).json({ status: "success", data: employees });
  } catch (err) { res.status(400).json({ message: err.message }); }
});

app.post("/api/v1/accounting/employees/:id/advance", protect, restrictTo("owner"), async (req, res) => {
  try {
    const { amount } = req.body;
    const { data: emp, error: fetchError } = await supabase.from('employees').select('*').eq('_id', req.params.id).single();
    if (fetchError || !emp) throw new Error("الموظف غير موجود");

    const newLoanBalance = emp.loanBalance + Number(amount);
    const { data: updatedEmp, error: updateError } = await supabase.from('employees').update({ loanBalance: newLoanBalance }).eq('_id', emp._id).select().single();
    if (updateError) throw updateError;
    
    const { data: restaurant } = await supabase.from('restaurants').select('_id').eq('owner', req.user._id).single();
    if (restaurant) {
      await supabase.from('expenses').insert([{
        restaurant: restaurant._id,
        title: `سلفة للموظف: ${emp.name}`,
        amount: Number(amount),
        category: 'salary_advance', 
        employee: emp._id,
        description: 'سلفة تخصم من الراتب'
      }]);
    }

    res.status(200).json({ status: "success", data: updatedEmp });
  } catch (err) { res.status(400).json({ message: err.message }); }
});

app.delete("/api/v1/accounting/employees/:id", protect, restrictTo("owner"), async (req, res) => {
  try { 
    const { error } = await supabase.from('employees').delete().eq('_id', req.params.id);
    if (error) throw error;
    res.status(200).json({ status: "success" }); 
  } catch (err) { res.status(400).json({ message: err.message }); }
});

app.post("/api/v1/accounting/attendance", protect, restrictTo("owner", "admin", "cashier"), async (req, res) => {
  try {
    const { employeeId, type, date } = req.body;
    const { data: restaurant } = await supabase.from('restaurants').select('_id').eq('owner', req.user._id).single();
    
    const { data: att } = await supabase.from('attendances').select('*').eq('employee', employeeId).eq('date', date).single();
    
    if (type === "checkIn") {
      if (att) return res.status(400).json({ message: "تم تسجيل الحضور مسبقاً" });
      
      const { data: newAtt, error: insertError } = await supabase.from('attendances').insert([{ 
        employee: employeeId, restaurant: restaurant._id, date, checkIn: new Date().toISOString(), status: 'present' 
      }]).select().single();
      
      if (insertError) throw insertError;
      return res.status(200).json({ status: "success", data: newAtt });

    } else if (type === "checkOut") {
      if (!att) return res.status(400).json({ message: "يجب تسجيل الحضور أولاً" });
      
      const checkOutTime = new Date();
      const checkInTime = new Date(att.checkIn);
      const hoursWorked = (checkOutTime - checkInTime) / 36e5;
      
      const { data: emp } = await supabase.from('employees').select('workHours').eq('_id', employeeId).single();
      let overtimeHours = 0;
      if (emp && hoursWorked > emp.workHours) {
        overtimeHours = Number((hoursWorked - emp.workHours).toFixed(2));
      }
      
      const { data: updatedAtt, error: updateError } = await supabase.from('attendances').update({ 
        checkOut: checkOutTime.toISOString(), overtimeHours 
      }).eq('_id', att._id).select().single();
      
      if (updateError) throw updateError;
      return res.status(200).json({ status: "success", data: updatedAtt });
    }
  } catch (err) { res.status(400).json({ message: err.message }); }
});

app.get("/api/v1/accounting/attendance", protect, async (req, res) => {
  try {
    const { date } = req.query;
    const { data: restaurant } = await supabase.from('restaurants').select('_id').eq('owner', req.user._id).single();
    
    const { data: logs, error } = await supabase.from('attendances').select('*, employee:employees(*)').eq('restaurant', restaurant._id).eq('date', date);
    if (error) throw error;

    res.status(200).json({ status: "success", data: logs });
  } catch (err) { res.status(400).json({ message: err.message }); }
});

app.post("/api/v1/accounting/payroll/generate", protect, restrictTo("owner", "admin"), async (req, res) => {
  try {
    const { month, bonuses, deductions, deductLoan, isPreview } = req.body; 
    const { data: restaurant } = await supabase.from('restaurants').select('_id').eq('owner', req.user._id).single();
    if (!restaurant) return res.status(404).json({ message: "المطعم غير موجود" });
    
    const { data: employees } = await supabase.from('employees').select('*').eq('restaurant', restaurant._id);
    const { data: allAttendance } = await supabase.from('attendances').select('*').eq('restaurant', restaurant._id).ilike('date', `${month}%`);

    const payrolls = [];

    for (const emp of (employees || [])) {
      const empLogs = (allAttendance || []).filter(log => log.employee === emp._id);
      
      const totalOvertimeHours = empLogs.reduce((sum, log) => sum + (log.overtimeHours || 0), 0);
      const totalDeductionHours = empLogs.reduce((sum, log) => sum + (log.deductionHours || 0), 0);
      
      let hourlyRate = 0;
      if (emp.salaryType === 'monthly') {
          hourlyRate = emp.baseSalary / 30 / (emp.workHours || 9);
      } else {
          hourlyRate = emp.baseSalary / (emp.workHours || 9);
      }

      const autoOvertimePay = Math.round(totalOvertimeHours * hourlyRate); 
      const autoDeductionVal = Math.round(totalDeductionHours * hourlyRate);

      const manualBonus = bonuses && bonuses[emp._id] ? Number(bonuses[emp._id]) : 0;
      const manualDeduct = deductions && deductions[emp._id] ? Number(deductions[emp._id]) : 0;
      
      let loanDeduction = 0;
      if (deductLoan && deductLoan[emp._id]) {
        const amountToDeduct = Number(deductLoan[emp._id]);
        loanDeduction = amountToDeduct > emp.loanBalance ? emp.loanBalance : amountToDeduct;
        
        if (!isPreview) {
            await supabase.from('employees').update({ loanBalance: emp.loanBalance - loanDeduction }).eq('_id', emp._id);
        }
      }

      const totalSalary = Math.round(emp.baseSalary + autoOvertimePay + manualBonus - autoDeductionVal - manualDeduct - loanDeduction);

      const payrollEntry = {
        employee: emp, 
        restaurant: restaurant._id,
        month,
        baseAmount: emp.baseSalary,
        overtimeAmount: autoOvertimePay, 
        bonuses: manualBonus,
        deductions: manualDeduct + autoDeductionVal, 
        loansDeducted: loanDeduction,
        totalSalary: totalSalary > 0 ? totalSalary : 0,
        stats: { 
            otHours: totalOvertimeHours,
            deductHours: totalDeductionHours
        },
        status: 'Pending',
        isPaid: false
      };

      payrolls.push(payrollEntry);
    }

   if (!isPreview) {
            const { data: oldPayrolls } = await supabase.from('payrolls').select('*').eq('restaurant', restaurant._id).eq('month', month);
            
            for (const p of (oldPayrolls || [])) {
                if (p.loansDeducted > 0) {
                    const { data: oldEmp } = await supabase.from('employees').select('loanBalance').eq('_id', p.employee).single();
                    if (oldEmp) await supabase.from('employees').update({ loanBalance: oldEmp.loanBalance + p.loansDeducted }).eq('_id', p.employee);
                }
            }

            await supabase.from('payrolls').delete().eq('restaurant', restaurant._id).eq('month', month);
            
            const dbPayload = payrolls.map(p => {
                const { stats, ...rest } = p;
                return { ...rest, employee: p.employee._id };
            });

            if (dbPayload.length > 0) {
                await supabase.from('payrolls').insert(dbPayload);
            }

            for (const p of dbPayload) {
                if (p.loansDeducted > 0) {
                    const { data: curEmp } = await supabase.from('employees').select('loanBalance').eq('_id', p.employee).single();
                    if (curEmp) await supabase.from('employees').update({ loanBalance: curEmp.loanBalance - p.loansDeducted }).eq('_id', p.employee);
                }
            }
        }

    res.status(200).json({ status: "success", data: payrolls });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

const SITE_BUCKET = "site-settings";
let _siteBucketReady = false;
let _siteBucketPromise = null;
function ensureSiteSettingsTable() {
  if (_siteBucketReady) return Promise.resolve(true);
  if (_siteBucketPromise) return _siteBucketPromise;
  _siteBucketPromise = (async () => {
    try {
      const { error } = await supabase.storage.createBucket(SITE_BUCKET, { public: false });
      if (error && !/already exists|duplicate/i.test(error.message || "")) throw error;
      _siteBucketReady = true;
      console.log("✅ إعدادات الصفحة الرئيسية جاهزة (Supabase Storage)");
      return true;
    } catch (e) {
      console.error("❌ فشل تجهيز bucket الإعدادات:", e.message);
      return false;
    } finally { _siteBucketPromise = null; }
  })();
  return _siteBucketPromise;
}

const SITE_DEFAULTS = {
  partners: { enabled: true, title: "أبرز شركائنا", subtitle: "نفتخر بثقة عملائنا ونجاحنا معاً", items: [] },
  contacts: { facebook: "", phones: [], whatsapps: [] },
};

const _isMissing = (err) => !!err && /not.?found|does not exist|404/i.test(String(err.message || "") + " " + String(err.statusCode || err.status || ""));

const _siteCache = {};
const _clone = (o) => JSON.parse(JSON.stringify(o));

async function readSiteSetting(key) {
  if (_siteCache[key]) return _clone(_siteCache[key]);
  const base = _clone(SITE_DEFAULTS[key]);
  const { data, error } = await supabase.storage.from(SITE_BUCKET).download(key + ".json");
  if (error) {
    if (_isMissing(error)) return base;
    throw error;
  }
  let value = {};
  try { value = JSON.parse(await data.text()) || {}; } catch (_) {}
  const merged = { ...base, ...value };
  _siteCache[key] = _clone(merged);
  return merged;
}

async function writeSiteSetting(key, value) {
  const body = Buffer.from(JSON.stringify(value));
  const up = () => supabase.storage.from(SITE_BUCKET).upload(key + ".json", body, { contentType: "application/json", upsert: true, cacheControl: "0" });
  let { error } = await up();
  if (error && _isMissing(error)) {
    if (await ensureSiteSettingsTable()) ({ error } = await up());
  }
  if (error) throw error;
  _siteCache[key] = _clone(value);
  return value;
}

const _str = (v, max = 200) => String(v == null ? "" : v).trim().slice(0, max);
const _cleanList = (arr) =>
  (Array.isArray(arr) ? arr : [])
    .map((x) => ({ label: _str(x && x.label, 40), number: _str(x && x.number, 25).replace(/[^\d+\s-]/g, "") }))
    .filter((x) => x.number.replace(/\D/g, "").length >= 7)
    .slice(0, 12);
const _cleanUrl = (u) => {
  const v = _str(u, 500);
  if (!v) return "";
  const full = /^https?:\/\//i.test(v) ? v : "https://" + v;
  try { const url = new URL(full); return /^https?:$/.test(url.protocol) ? url.href : ""; } catch (_) { return ""; }
};

async function _findRestaurantBySlug(slug) {
  const { data, error } = await supabase.from("restaurants").select("slug, restaurantName").eq("slug", slug).maybeSingle();
  if (error) throw error;
  return data || null;
}

app.get("/api/v1/site/public", async (req, res) => {
  try {
    const [partners, contacts] = await Promise.all([readSiteSetting("partners"), readSiteSetting("contacts")]);
    const items = (partners.items || []).filter((p) => p.visible !== false).map(({ id, name, image, slug }) => ({ id, name, image, slug: slug || "" }));
    res.set("Cache-Control", "no-store");
    res.json({ status: "success", data: { partners: { enabled: partners.enabled !== false, title: partners.title, subtitle: partners.subtitle, items }, contacts } });
  } catch (err) {
    res.json({ status: "success", data: { partners: { enabled: false, items: [] }, contacts: SITE_DEFAULTS.contacts } });
  }
});

app.get("/api/v1/site/admin", protect, restrictTo("admin"), async (req, res) => {
  try {
    await ensureSiteSettingsTable();
    const [partners, contacts] = await Promise.all([readSiteSetting("partners"), readSiteSetting("contacts")]);
    res.json({ status: "success", data: { partners, contacts } });
  } catch (err) { res.status(500).json({ status: "error", message: err.message }); }
});

app.get("/api/v1/site/restaurants", protect, restrictTo("admin"), async (req, res) => {
  try {
    const { data, error } = await supabase.from("restaurants").select("slug, restaurantName");
    if (error) throw error;
    const list = (data || [])
      .filter((r) => r.slug)
      .map((r) => ({ slug: r.slug, name: r.restaurantName || r.slug }))
      .sort((a, b) => String(a.name).localeCompare(String(b.name), "ar"));
    res.json({ status: "success", data: list });
  } catch (err) { res.status(500).json({ status: "error", message: err.message }); }
});

app.put("/api/v1/site/contacts", protect, restrictTo("admin"), async (req, res) => {
  try {
    const value = {
      facebook: _cleanUrl(req.body.facebook),
      phones: _cleanList(req.body.phones),
      whatsapps: _cleanList(req.body.whatsapps),
    };
    await writeSiteSetting("contacts", value);
    res.json({ status: "success", data: value });
  } catch (err) { res.status(400).json({ status: "error", message: err.message }); }
});

app.put("/api/v1/site/partners-settings", protect, restrictTo("admin"), async (req, res) => {
  try {
    const cur = await readSiteSetting("partners");
    const value = {
      ...cur,
      enabled: req.body.enabled !== false && req.body.enabled !== "false",
      title: _str(req.body.title, 60) || SITE_DEFAULTS.partners.title,
      subtitle: _str(req.body.subtitle, 120),
    };
    await writeSiteSetting("partners", value);
    res.json({ status: "success", data: value });
  } catch (err) { res.status(400).json({ status: "error", message: err.message }); }
});

app.patch("/api/v1/site/partners/reorder", protect, restrictTo("admin"), async (req, res) => {
  try {
    const ids = Array.isArray(req.body.ids) ? req.body.ids : [];
    const cur = await readSiteSetting("partners");
    const byId = new Map((cur.items || []).map((p) => [p.id, p]));
    const sorted = ids.map((id) => byId.get(id)).filter(Boolean);
    (cur.items || []).forEach((p) => { if (!ids.includes(p.id)) sorted.push(p); });
    cur.items = sorted;
    await writeSiteSetting("partners", cur);
    res.json({ status: "success" });
  } catch (err) { res.status(400).json({ status: "error", message: err.message }); }
});

app.post("/api/v1/site/partners", protect, restrictTo("admin"), upload.single("image"), async (req, res) => {
  try {
    let name = _str(req.body.name, 80);
    const slug = _str(req.body.slug, 120);
    if (slug) {
      const r = await _findRestaurantBySlug(slug);
      if (!r) return res.status(400).json({ status: "fail", message: "المطعم المختار غير موجود" });
      if (!name) name = _str(r.restaurantName, 80);
    }
    if (!name) return res.status(400).json({ status: "fail", message: "اسم الشريك مطلوب" });
    const cur = await readSiteSetting("partners");
    cur.items = cur.items || [];
    if (cur.items.length >= 60) return res.status(400).json({ status: "fail", message: "وصلت للحد الأقصى (60 شريك)" });
    const partner = {
      id: require("crypto").randomUUID(),
      name,
      image: req.file ? req.file.path : "",
      slug,
      visible: req.body.visible !== "false",
    };
    cur.items.push(partner);
    await writeSiteSetting("partners", cur);
    res.status(201).json({ status: "success", data: partner });
  } catch (err) { res.status(400).json({ status: "error", message: err.message }); }
});

app.patch("/api/v1/site/partners/:id", protect, restrictTo("admin"), upload.single("image"), async (req, res) => {
  try {
    const cur = await readSiteSetting("partners");
    const p = (cur.items || []).find((x) => x.id === req.params.id);
    if (!p) return res.status(404).json({ status: "fail", message: "الشريك غير موجود" });
    if (req.body.name !== undefined) { const n = _str(req.body.name, 80); if (n) p.name = n; }
    if (req.body.slug !== undefined) {
      const slug = _str(req.body.slug, 120);
      if (slug && !(await _findRestaurantBySlug(slug))) return res.status(400).json({ status: "fail", message: "المطعم المختار غير موجود" });
      p.slug = slug;
    }
    if (req.body.visible !== undefined) p.visible = req.body.visible !== "false" && req.body.visible !== false;
    if (req.body.removeImage === "true") p.image = "";
    if (req.file) p.image = req.file.path;
    await writeSiteSetting("partners", cur);
    res.json({ status: "success", data: p });
  } catch (err) { res.status(400).json({ status: "error", message: err.message }); }
});

app.delete("/api/v1/site/partners/:id", protect, restrictTo("admin"), async (req, res) => {
  try {
    const cur = await readSiteSetting("partners");
    cur.items = (cur.items || []).filter((x) => x.id !== req.params.id);
    await writeSiteSetting("partners", cur);
    res.json({ status: "success" });
  } catch (err) { res.status(400).json({ status: "error", message: err.message }); }
});

app.get(/.*/, (req, res) => {
  if (req.originalUrl.startsWith('/api')) {
      return res.status(404).json({ status: "fail", message: "API Route Not Found - تأكد من تحديث السيرفر" });
  }

  const backUrl = req.header("Referer") || "/";
  if (backUrl.includes(req.originalUrl)) return res.redirect("/");
  res.redirect(backUrl);
});

app.use((err, req, res, next) => {
  console.error("🔥 Error Log:", err);
  res.status(500).json({ status: "error", message: err.message || "حدث خطأ غير متوقع في السيرفر" });
});

console.log("✅ Supabase Client Initialized!");

process.on("unhandledRejection", (r) => console.error("🔥 unhandledRejection:", r));
process.on("uncaughtException", (e) => console.error("🔥 uncaughtException:", e));

ensureOffersColumn().catch(() => {});
ensureSiteSettingsTable().catch(() => {});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`✅ Server is running on port ${PORT}`);
});