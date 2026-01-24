const User = require("../models/User");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");

const SUPER_ADMIN_ID = "000000000000000000000000";

const signToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: "90d",
  });
};

const createSendToken = (user, statusCode, res) => {
  const token = signToken(user._id);
  const cookieOptions = {
    expires: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
    httpOnly: true,
  };
  res.cookie("jwt", token, cookieOptions);

  if (user.password) user.password = undefined;

  res.status(statusCode).json({
    status: "success",
    token,
    data: { user },
  });
};

exports.signup = async (req, res) => {
  try {
    const {
      name,
      email,
      password,
      passwordConfirm,
      phone,
      role,
      subscriptionExpires,
      hasStock,
      productLimit,
    } = req.body;

    if (password !== passwordConfirm) {
      return res
        .status(400)
        .json({ status: "fail", message: "كلمات المرور غير متطابقة!" });
    }

    if (role === "admin") {
      return res.status(403).json({
        status: "fail",
        message: "غير مسموح بإنشاء حساب مسؤول (Admin) بهذه الطريقة.",
      });
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
      subscriptionExpires,
      hasStock: hasStock || false,
      productLimit: productLimit || 75,
    });

    createSendToken(newUser, 201, res);
  } catch (err) {
    let message = "حدث خطأ أثناء التسجيل";
    if (err.code === 11000) message = "هذا البريد الإلكتروني مسجل بالفعل!";
    res.status(400).json({ status: "fail", message });
  }
};

exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        status: "fail",
        message: "يرجى إدخال البريد الإلكتروني وكلمة المرور",
      });
    }

    const user = await User.findOne({ email }).select("+password");

    if (!user || !(await user.correctPassword(password, user.password))) {
      return res
        .status(401)
        .json({ status: "fail", message: "بيانات الدخول غير صحيحة" });
    }

    if (!user.active) {
     // التحقق من اشتراك المالك (خاص بالمالك فقط)
      if (
        user.role === "owner" &&
        user.subscriptionExpires &&
        new Date() > user.subscriptionExpires
      ) {
        return res.status(401).json({
          status: "fail",
          message: "عذراً، انتهت فترة الاشتراك الخاصة بك",
        });
      }
      return res
        .status(401)
        .json({ status: "fail", message: "هذا الحساب معطل حالياً" });
    }

    // ============================================================
    // 🔴 قيود الدخول (تطبق فقط على الكاشير والمطبخ)
    // ============================================================
    if (user.role === 'cashier' || user.role === 'kitchen') {
        // 🟢 ضبط التوقيت على القاهرة (مصر) لحل مشكلة فرق التوقيت
        const cairoDateStr = new Date().toLocaleString("en-US", {timeZone: "Africa/Cairo"});
        const now = new Date(cairoDateStr);
        
        // 1. فحص أيام الإجازة
        const today = now.getDay(); 
        if (user.restDays && user.restDays.includes(today)) {
            return res.status(403).json({
                status: "fail",
                message: "عذراً، لا يمكنك الدخول اليوم (يوم إجازة).",
            });
        }

        // 2. فحص ساعات العمل (إذا كانت محددة في حساب الموظف)
        if (user.shiftStart && user.shiftEnd) {
            const currentMins = now.getHours() * 60 + now.getMinutes();
            
            const [sh, sm] = user.shiftStart.split(':').map(Number);
            const [eh, em] = user.shiftEnd.split(':').map(Number);
            
            const startMins = sh * 60 + sm;
            const endMins = eh * 60 + em;

            let isWorking = false;
            
            // التعامل مع الشيفت اللي بيعدي نص الليل (مثلاً من 8 مساءً لـ 2 صباحاً)
            if (endMins < startMins) { 
                if (currentMins >= startMins || currentMins < endMins) isWorking = true;
            } else {
                // شيفت نهاري عادي
                if (currentMins >= startMins && currentMins < endMins) isWorking = true;
            }

            if (!isWorking) {
                return res.status(403).json({
                    status: "fail",
                    message: `عذراً، أنت خارج مواعيد عملك (${user.shiftStart} - ${user.shiftEnd})`,
                });
            }
        }
    }
    // ============================================================

    createSendToken(user, 200, res);
  } catch (err) {
    res.status(500).json({ status: "error", message: err.message });
  }
};
exports.protect = async (req, res, next) => {
  let token;
  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith("Bearer")
  ) {
    token = req.headers.authorization.split(" ")[1];
  }

  if (!token) {
    return res.status(401).json({ message: "أنت غير مسجل دخول!" });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (decoded.id === SUPER_ADMIN_ID) {
      req.user = {
        _id: SUPER_ADMIN_ID,
        name: "Super Admin",
        email: process.env.SUPER_ADMIN_EMAIL,
        role: "admin",
      };
      return next();
    }

    const currentUser = await User.findById(decoded.id);
    if (!currentUser) {
      return res.status(401).json({ message: "المستخدم لم يعد موجوداً." });
    }

    if (currentUser.role === "owner") {
      if (
        currentUser.subscriptionExpires &&
        new Date() > currentUser.subscriptionExpires
      ) {
        currentUser.active = false;
        await currentUser.save({ validateBeforeSave: false });
        return res
          .status(403)
          .json({ message: "انتهت مدة اشتراكك، يرجى التواصل مع الإدارة." });
      }
      if (currentUser.active === false) {
        return res.status(401).json({ message: "هذا الحساب معطل حالياً." });
      }
    }

    req.user = currentUser;
    next();
  } catch (err) {
    return res.status(401).json({ message: "التوكن غير صالح." });
  }
};

exports.restrictTo = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        status: "fail",
        message: "ليس لديك صلاحية للقيام بهذا الإجراء",
      });
    }
    next();
  };
};

exports.updateUser = async (req, res) => {
  try {
    if (req.body.password) delete req.body.password;

    if (req.body.productLimit !== undefined) {
      req.body.productLimit = Number(req.body.productLimit);
    }

    if (req.body.subscriptionExpires) {
      const newExpiry = new Date(req.body.subscriptionExpires);
      newExpiry.setHours(23, 59, 59, 999);
      req.body.subscriptionExpires = newExpiry;

      if (newExpiry > new Date()) {
        req.body.active = true;
      }
    }

    const updatedUser = await User.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });

    res.status(200).json({ status: "success", data: { user: updatedUser } });
  } catch (err) {
    res.status(400).json({ status: "fail", message: err.message });
  }
};

exports.impersonateUser = async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res
        .status(403)
        .json({ status: "fail", message: "غير مسموح لك بهذا الإجراء" });
    }
    const userToImpersonate = await User.findById(req.params.userId);
    if (!userToImpersonate) {
      return res
        .status(404)
        .json({ status: "fail", message: "المالك غير موجود" });
    }
    createSendToken(userToImpersonate, 200, res);
  } catch (err) {
    res.status(400).json({ status: "fail", message: err.message });
  }
};

exports.toggleUserStatus = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return res
        .status(404)
        .json({ status: "fail", message: "المستخدم غير موجود" });
    }

    const newStatus = user.active === false ? true : false;

    const updatedUser = await User.findByIdAndUpdate(
      req.params.id,
      { active: newStatus },
      { new: true, runValidators: false },
    );

    res.status(200).json({
      status: "success",
      message: `تم ${updatedUser.active ? "تفعيل" : "تعطيل"} الحساب بنجاح`,
      active: updatedUser.active,
    });
  } catch (err) {
    res.status(400).json({ status: "error", message: err.message });
  }
};

exports.deleteUser = async (req, res) => {
  try {
    const user = await User.findByIdAndDelete(req.params.id);
    if (!user) {
      return res
        .status(404)
        .json({ status: "fail", message: "المستخدم غير موجود" });
    }
    res.status(200).json({
      status: "success",
      message: "تم حذف المستخدم وجميع بياناته بنجاح",
    });
  } catch (err) {
    res.status(400).json({ status: "error", message: err.message });
  }
};

exports.changeUserPasswordByAdmin = async (req, res) => {
  try {
    const { password } = req.body;

    if (!password || password.length < 6) {
      return res.status(400).json({
        status: "fail",
        message: "يجب أن تكون كلمة المرور 6 أحرف على الأقل",
      });
    }

    const hashedPassword = await bcrypt.hash(password, 12);

    const user = await User.findByIdAndUpdate(
      req.params.id,
      {
        password: hashedPassword,
      },
      { new: true },
    );

    if (!user) {
      return res
        .status(404)
        .json({ status: "fail", message: "المستخدم غير موجود" });
    }

    res.status(200).json({
      status: "success",
      message: "تم تغيير كلمة المرور بنجاح",
    });
  } catch (err) {
    res.status(400).json({ status: "error", message: err.message });
  }
};

exports.updateMyPassword = async (req, res) => {
  try {
    const { password } = req.body;

    if (!password || password.length < 6) {
      return res.status(400).json({
        status: "fail",
        message: "يجب أن تكون كلمة المرور 6 أحرف على الأقل",
      });
    }

    const hashedPassword = await bcrypt.hash(password, 12);

    await User.findByIdAndUpdate(req.user.id, {
      password: hashedPassword,
    });

    res.status(200).json({
      status: "success",
      message: "تم تغيير كلمة المرور بنجاح",
    });
  } catch (err) {
    res.status(400).json({ status: "error", message: err.message });
  }
};

exports.createStaff = async (req, res) => {
  try {
    if (req.user.role !== "owner") {
      return res.status(403).json({ message: "غير مسموح لك بإضافة موظفين" });
    }

    const {
      name,
      email,
      password,
      role,
      restaurantId,
      phone,
      shiftStart,
      shiftEnd,
      restDays,
    } = req.body;

    if (!["cashier", "kitchen"].includes(role)) {
      return res.status(400).json({ message: "الدور غير صحيح" });
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
    res.status(400).json({ status: "fail", message: err.message });
  }
};

exports.getMyStaff = async (req, res) => {
  try {
    const Restaurant = require("../models/Restaurant");
    const myRestaurant = await Restaurant.findOne({ owner: req.user._id });

    if (!myRestaurant) return res.status(404).json({ message: "لا تملك مطعم" });

    const staff = await User.find({
      restaurant: myRestaurant._id,
      role: { $ne: "owner" },
    }).select("-password");

    res.status(200).json({ status: "success", data: { staff } });
  } catch (err) {
    res.status(400).json({ status: "fail", message: err.message });
  }
};

exports.updateStaff = async (req, res) => {
  try {
    if (req.user.role !== 'owner') {
        return res.status(403).json({ message: "غير مسموح لك بتعديل الموظفين" });
    }

    const staffId = req.params.id;
    // التأكد أن الموظف يتبع لهذا المالك
    const staffMember = await User.findOne({ _id: staffId, owner: req.user._id });

    if (!staffMember) {
        return res.status(404).json({ message: "الموظف غير موجود أو لا يتبع لك" });
    }

    const updates = { ...req.body };

    // تحديث الباسورد فقط لو تم إرساله، وإلا نحذفه من التحديث
    if (updates.password && updates.password.trim() !== "") {
        const bcrypt = require('bcryptjs');
        updates.password = await bcrypt.hash(updates.password, 12);
    } else {
        delete updates.password;
    }

    const updatedUser = await User.findByIdAndUpdate(staffId, updates, {
      new: true,
      runValidators: true,
    });

    res.status(200).json({ status: "success", data: { user: updatedUser } });
  } catch (err) {
    res.status(400).json({ status: "fail", message: err.message });
  }
};

// 🟢 دالة تعديل الموظف (تم إصلاح مشكلة الربط)
exports.updateStaff = async (req, res) => {
  try {
    // 1. التأكد أنك المالك
    if (req.user.role !== 'owner') {
        return res.status(403).json({ message: "غير مسموح لك بتعديل الموظفين" });
    }

    // 2. جلب مطعم المالك الحالي للتأكد من الملكية
    const Restaurant = require("../models/Restaurant");
    const myRestaurant = await Restaurant.findOne({ owner: req.user._id });
    if (!myRestaurant) {
        return res.status(404).json({ message: "لا يوجد مطعم مرتبط بحسابك" });
    }

    const staffId = req.params.id;
    
    // 3. البحث عن الموظف داخل مطعم هذا المالك (أضمن طريقة)
    const staffMember = await User.findOne({ _id: staffId, restaurant: myRestaurant._id });

    if (!staffMember) {
        return res.status(404).json({ message: "الموظف غير موجود أو لا يتبع لمطعمك" });
    }

    // 4. تجهيز البيانات للتحديث
    const updates = { ...req.body };

    // عدم السماح بتغيير المطعم أو المالك
    delete updates.restaurant;
    delete updates.owner;

    // تحديث الباسورد فقط لو المالك كتب باسورد جديد
    if (updates.password && updates.password.trim() !== "") {
        const bcrypt = require('bcryptjs');
        updates.password = await bcrypt.hash(updates.password, 12);
    } else {
        delete updates.password; // لو فاضي، شيله عشان ميبوظش القديم
    }

    const updatedUser = await User.findByIdAndUpdate(staffId, updates, {
      new: true,
      runValidators: true,
    });

    res.status(200).json({ status: "success", data: { user: updatedUser } });
  } catch (err) {
    res.status(400).json({ status: "fail", message: err.message });
  }
};

exports.deleteStaff = async (req, res) => {
  try {
    // أيضاً نستخدم المطعم للتحقق عند الحذف
    const Restaurant = require("../models/Restaurant");
    const myRestaurant = await Restaurant.findOne({ owner: req.user._id });
    
    if (!myRestaurant) return res.status(404).json({message: "لا تملك مطعم"});

    const staffMember = await User.findOne({ _id: req.params.id, restaurant: myRestaurant._id });

    if (!staffMember) {
      return res.status(404).json({ status: "fail", message: "الموظف غير موجود أو لا يتبع لك" });
    }

    await User.findByIdAndDelete(req.params.id);
    res.status(200).json({ status: "success", message: "تم حذف الموظف بنجاح" });
  } catch (err) {
    res.status(400).json({ status: "fail", message: err.message });
  }
};
