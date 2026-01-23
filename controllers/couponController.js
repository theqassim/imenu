const Coupon = require("../models/Coupon");

exports.createCoupon = async (req, res) => {
  try {
    const {
      code,
      discountType,
      value,
      maxDiscount,
      minOrderVal,
      usageLimit,
      expiresAt,
    } = req.body;

    const existing = await Coupon.findOne({
      code: code.toUpperCase(),
      restaurant: req.params.restaurantId,
    });
    if (existing)
      return res
        .status(400)
        .json({ status: "fail", message: "الكود موجود بالفعل" });

    const newCoupon = await Coupon.create({
      code,
      restaurant: req.params.restaurantId,
      discountType,
      value,
      maxDiscount,
      minOrderVal,
      usageLimit,
      expiresAt,
    });
    res.status(201).json({ status: "success", data: { coupon: newCoupon } });
  } catch (err) {
    res.status(400).json({ status: "fail", message: err.message });
  }
};

exports.getRestaurantCoupons = async (req, res) => {
  try {
    const coupons = await Coupon.find({
      restaurant: req.params.restaurantId,
    }).sort("-createdAt");
    res.status(200).json({ status: "success", data: { coupons } });
  } catch (err) {
    res.status(400).json({ status: "fail", message: err.message });
  }
};

exports.deleteCoupon = async (req, res) => {
  try {
    await Coupon.findByIdAndDelete(req.params.id);
    res.status(200).json({ status: "success", message: "تم الحذف" });
  } catch (err) {
    res.status(400).json({ status: "fail", message: err.message });
  }
};

exports.validateCoupon = async (req, res) => {
  try {
    const { code, orderTotal } = req.body;
    const coupon = await Coupon.findOne({
      code: code.toUpperCase(),
      restaurant: req.params.restaurantId,
      isActive: true,
    });

    if (!coupon)
      return res.status(404).json({ status: "fail", message: "كود غير صحيح" });

    if (coupon.expiresAt && new Date() > coupon.expiresAt)
      return res
        .status(400)
        .json({ status: "fail", message: "الكوبون منتهي الصلاحية" });
    if (coupon.usedCount >= coupon.usageLimit)
      return res
        .status(400)
        .json({ status: "fail", message: "انتهى عدد مرات استخدام الكوبون" });
    if (orderTotal < coupon.minOrderVal)
      return res.status(400).json({
        status: "fail",
        message: `الحد الأدنى للطلب ${coupon.minOrderVal}`,
      });

    let discount = 0;
    if (coupon.discountType === "percent") {
      discount = (orderTotal * coupon.value) / 100;
      if (coupon.maxDiscount && discount > coupon.maxDiscount)
        discount = coupon.maxDiscount;
    } else {
      discount = coupon.value;
    }

    res.status(200).json({
      status: "success",
      data: {
        discount: discount,
        code: coupon.code,
        couponId: coupon._id,
      },
    });
  } catch (err) {
    res.status(400).json({ status: "fail", message: err.message });
  }
};
