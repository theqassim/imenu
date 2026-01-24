const express = require("express");
const authController = require("../controllers/authController");

const router = express.Router();

router.post("/signup", authController.signup);
router.post("/login", authController.login);

router.patch("/:id", authController.protect, authController.updateUser);
router.patch(
  "/:id/toggle-status",
  authController.protect,
  authController.toggleUserStatus,
);
router.delete("/:id", authController.protect, authController.deleteUser);

router.post(
  "/impersonate/:userId",
  authController.protect,
  authController.impersonateUser,
);

const User = require("../models/User");
router.get(
  "/",
  authController.protect,
  authController.restrictTo("admin"),
  async (req, res) => {
    let users = await User.find();

    const updatedUsers = await Promise.all(
      users.map(async (user) => {
        if (user.role === "owner" && user.active && user.subscriptionExpires) {
          if (new Date() > user.subscriptionExpires) {
            user.active = false;
            await user.save({ validateBeforeSave: false });
          }
        }
        return user;
      }),
    );

    res.status(200).json({ status: "success", data: { users: updatedUsers } });
  },
);

router.patch(
  "/:id/change-password-admin",
  authController.protect,
  authController.changeUserPasswordByAdmin,
);
router.patch(
  "/update-my-password",
  authController.protect,
  authController.updateMyPassword,
);

router.post(
  "/create-staff",
  authController.protect,
  authController.createStaff,
);
router.get("/my-staff", authController.protect, authController.getMyStaff);
router.patch("/staff/:id", authController.protect, authController.updateStaff); 
router.delete("/staff/:id", authController.protect, authController.deleteStaff);

module.exports = router;
