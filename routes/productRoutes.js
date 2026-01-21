const express = require("express");
const multer = require("multer");
const productController = require("../controllers/productController");

const cloudinary = require("cloudinary").v2;
const { CloudinaryStorage } = require("multer-storage-cloudinary");

const router = express.Router();

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: "smart-menu",
    allowed_formats: ["jpg", "png", "jpeg", "webp"],
  },
});

const upload = multer({ storage: storage });

router.post("/", upload.single("image"), productController.createProduct);

router.get(
  "/restaurant/:restaurantId",
  productController.getRestaurantProducts,
);

router.delete("/:id", productController.deleteProduct);

router.patch("/:id/toggle", productController.toggleAvailability);

router.patch("/:id", upload.single("image"), productController.updateProduct);

module.exports = router;
