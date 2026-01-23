const express = require("express");
const mongoose = require("mongoose");
const router = express.Router();
const Order = require("../models/Order");
const Restaurant = require("../models/Restaurant");
const authController = require("../controllers/authController");
const orderController = require("../controllers/orderController");

router.post("/", async (req, res) => {
  try {
    const {
      restaurantId,
      tableNumber,
      items,
      subTotal,
      taxAmount,
      serviceAmount,
      couponCode,
      discountAmount,
    } = req.body;
    const Coupon = require("../models/Coupon");

    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const endOfToday = new Date();
    endOfToday.setHours(23, 59, 59, 999);

    const lastOrderToday = await Order.findOne({
      restaurant: restaurantId,
      createdAt: { $gte: startOfToday, $lte: endOfToday },
    }).sort({ orderNum: -1 });

    const nextOrderNum =
      lastOrderToday && lastOrderToday.orderNum
        ? lastOrderToday.orderNum + 1
        : 1;

    let finalDiscount = discountAmount || 0;
    if (couponCode) {
      await Coupon.findOneAndUpdate(
        { code: couponCode, restaurant: restaurantId },
        { $inc: { usedCount: 1 } },
      );
    }

    let calculatedTotal =
      subTotal + (taxAmount || 0) + (serviceAmount || 0) - finalDiscount;
    if (calculatedTotal < 0) calculatedTotal = 0;

    const newOrder = await Order.create({
      restaurant: restaurantId,
      orderNum: nextOrderNum,
      tableNumber,
      items,
      subTotal,
      taxAmount,
      serviceAmount,
      discountAmount: finalDiscount,
      couponCode,
      totalPrice: calculatedTotal,
    });

    if (req.io) {
      req.io.to(restaurantId).emit("new-order", newOrder);
    }

    res.status(201).json({ status: "success", data: { order: newOrder } });
  } catch (err) {
    res.status(400).json({ status: "fail", message: err.message });
  }
});

const checkPermission = async (user, restaurantId) => {
  if (user.role === "admin") return true;

  if (user.role === "owner") {
    const isOwner = await Restaurant.exists({
      _id: restaurantId,
      owner: user._id,
    });
    return !!isOwner;
  } else {
    return (
      user.restaurant && user.restaurant.toString() === restaurantId.toString()
    );
  }
};

router.get(
  "/:restaurantId/active",
  authController.protect,
  async (req, res) => {
    try {
      const hasAccess = await checkPermission(
        req.user,
        req.params.restaurantId,
      );

      if (!hasAccess) {
        return res.status(403).json({
          status: "fail",
          message: "ليس لديك صلاحية لرؤية طلبات هذا المطعم",
        });
      }

      const orders = await Order.find({
        restaurant: req.params.restaurantId,
        status: { $in: ["pending", "preparing"] },
      }).sort({ createdAt: 1 });

      res.status(200).json({ status: "success", data: { orders } });
    } catch (err) {
      res.status(400).json({ status: "fail", message: err.message });
    }
  },
);

router.get(
  "/:restaurantId/recent-completed",
  authController.protect,
  async (req, res) => {
    try {
      const hasAccess = await checkPermission(
        req.user,
        req.params.restaurantId,
      );
      if (!hasAccess) {
        return res
          .status(403)
          .json({ status: "fail", message: "ليس لديك صلاحية" });
      }

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
  },
);

router.get(
  "/:restaurantId/history",
  authController.protect,
  async (req, res) => {
    try {
      const hasAccess = await checkPermission(
        req.user,
        req.params.restaurantId,
      );
      if (!hasAccess) {
        return res
          .status(403)
          .json({ status: "fail", message: "ليس لديك صلاحية" });
      }

      let query = {
        restaurant: req.params.restaurantId,
        status: { $in: ["completed", "canceled"] },
      };

      if (req.user.role === "cashier") {
        const startOfToday = new Date();
        startOfToday.setHours(0, 0, 0, 0);
        query.createdAt = { $gte: startOfToday };
      } else if (req.user.role === "owner" || req.user.role === "admin") {
        if (req.query.startDate && req.query.endDate) {
          query.createdAt = {
            $gte: new Date(req.query.startDate),
            $lte: new Date(new Date(req.query.endDate).setHours(23, 59, 59)),
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
  },
);
router.patch(
  "/:id/status",
  authController.protect,
  authController.restrictTo("owner", "cashier", "kitchen", "admin"),
  orderController.updateOrderStatus,
);
(async (req, res) => {
  try {
    const { status } = req.body;

    const orderToUpdate = await Order.findById(req.params.id);
    if (!orderToUpdate)
      return res.status(404).json({ message: "الطلب غير موجود" });

    const hasAccess = await checkPermission(req.user, orderToUpdate.restaurant);

    if (!hasAccess) {
      return res
        .status(403)
        .json({ message: "لا تملك صلاحية لتحديث هذا الطلب" });
    }

    const order = await Order.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true },
    );

    if (req.io) {
      req.io.to(req.params.id).emit("status-changed", order.status);
      req.io.to(order.restaurant.toString()).emit("order-updated", order);
    }

    res.status(200).json({ status: "success", data: { order } });
  } catch (err) {
    res.status(400).json({ status: "fail", message: err.message });
  }
},
  (module.exports = router));
