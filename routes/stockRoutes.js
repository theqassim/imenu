const express = require("express");
const stockController = require("../controllers/stockController");
const authController = require("../controllers/authController");

const router = express.Router();

// 1. التحقق من تسجيل الدخول
router.use(authController.protect);

// 2. التحقق من أن المستخدم يمتلك ميزة المخازن (Middleware جديد)
router.use((req, res, next) => {
  // إذا كان المستخدم هو المالك، يجب أن تكون لديه hasStock مفعلة
  // إذا كان موظف (كاشير/مطبخ)، نتحقق من مالك المطعم (اختياري حسب منطقك، هنا سنفحص المستخدم الحالي فقط)

  if (req.user.role === "owner" && !req.user.hasStock) {
    return res.status(403).json({
      status: "fail",
      message: "هذه الميزة غير مفعلة في باقتك، يرجى التواصل مع الإدارة.",
    });
  }
  next();
});

router.post("/", stockController.createStockItem);
router.get("/logs", stockController.getLogs);
router.get("/:restaurantId", stockController.getStockItems);
router.post("/:id/adjust", stockController.adjustStock);
router.delete("/:id", stockController.deleteStockItem);

module.exports = router;
