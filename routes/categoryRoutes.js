const express = require("express");
const multer = require("multer");
const categoryController = require("../controllers/categoryController");
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
    folder: "smart-menu-categories",
    allowed_formats: ["jpg", "png", "jpeg"],
  },
});
const upload = multer({ storage: storage });

router.post("/", upload.single("image"), categoryController.createCategory);
router.get("/:restaurantId", categoryController.getRestaurantCategories);
router.delete("/:id", categoryController.deleteCategory);

module.exports = router;
