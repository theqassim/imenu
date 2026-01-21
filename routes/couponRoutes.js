const express = require("express");
const router = express.Router();
const couponController = require("../controllers/couponController");
const authController = require("../controllers/authController");

router.post("/validate/:restaurantId", couponController.validateCoupon);

router.use(authController.protect);
router.post("/:restaurantId", couponController.createCoupon);
router.get("/:restaurantId", couponController.getRestaurantCoupons);
router.delete("/:id", couponController.deleteCoupon);

module.exports = router;
