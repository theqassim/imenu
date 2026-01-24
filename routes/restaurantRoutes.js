const express = require("express");
const multer = require("multer");
const { CloudinaryStorage } = require("multer-storage-cloudinary");
const cloudinary = require("cloudinary").v2;
const restaurantController = require("../controllers/restaurantController");
const authController = require("../controllers/authController");

const router = express.Router();

const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: { folder: "restaurants-covers", allowed_formats: ["jpg", "png"] },
  transformation: [{ width: 1000, quality: "auto" }]
});
const upload = multer({ storage: storage });

router.post(
  "/",
  authController.protect,
  upload.single("image"),
  restaurantController.createRestaurant,
);

router.get(
  "/my-restaurant",
  authController.protect,
  restaurantController.getMyRestaurant,
);
router.get("/:slug", restaurantController.getMenu);
router.get("/", authController.protect, restaurantController.getAllRestaurants);

router.delete(
  "/:id",
  authController.protect,
  restaurantController.deleteRestaurant,
);
router.patch(
  "/:id",
  authController.protect,
  upload.fields([
    { name: "bgImage", maxCount: 1 },
    { name: "heroImage", maxCount: 1 },
  ]),
  restaurantController.updateRestaurant,
);

router.patch(
  "/update-qr/:slug",
  authController.protect,
  restaurantController.updateQRCode,
);

module.exports = router;
