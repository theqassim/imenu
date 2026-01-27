const express = require("express");
const multer = require("multer");
const { CloudinaryStorage } = require("multer-storage-cloudinary");
const cloudinary = require("cloudinary").v2;
const salesController = require("../controllers/salesController");
const authController = require("../controllers/authController");

const router = express.Router();

// إعداد Cloudinary (نفس المستخدم في المطاعم)
const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: { folder: "sales-agents", allowed_formats: ["jpg", "png", "jpeg"] },
});
const upload = multer({ storage: storage });

// Public Route (للتقديم)
router.post("/", upload.single("image"), salesController.createRequest);

// Protected Routes (للسوبر أدمن)
router.use(authController.protect, authController.restrictTo("admin"));

router.get("/", salesController.getAllRequests);
router.patch("/:id/status", salesController.updateStatus);
router.delete("/:id", salesController.deleteRequest);

module.exports = router;