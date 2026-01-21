const Restaurant = require("../models/Restaurant");
const Product = require("../models/Product");

exports.createRestaurant = async (req, res) => {
  try {
    const { restaurantName, businessType, slug, contactInfo, owner } = req.body;

    const newRestaurant = await Restaurant.create({
      restaurantName,
      businessType,
      slug,
      contactInfo,
      owner: owner,
      image: req.file ? req.file.path : undefined,
    });

    res
      .status(201)
      .json({ status: "success", data: { restaurant: newRestaurant } });
  } catch (err) {
    res.status(400).json({ status: "fail", message: err.message });
  }
};

exports.getMenu = async (req, res) => {
  try {
    const restaurant = await Restaurant.findOne({
      slug: req.params.slug,
    }).populate("owner");

    if (!restaurant) {
      return res
        .status(404)
        .json({ status: "fail", message: "المطعم غير موجود" });
    }

    if (restaurant.owner) {
      const isExpired =
        restaurant.owner.subscriptionExpires &&
        new Date() > restaurant.owner.subscriptionExpires;
      if (restaurant.owner.active === false || isExpired) {
        return res.status(403).json({
          status: "fail",
          message: "هذا المنيو غير متاح حالياً (عطل فني أو انتهاء اشتراك)",
        });
      }
    }

    const products = await Product.find({ restaurant: restaurant._id });

    res.status(200).json({
      status: "success",
      data: {
        restaurant,
        menu: products,
      },
    });
  } catch (err) {
    res.status(400).json({ status: "fail", message: err.message });
  }
};

exports.getMyRestaurant = async (req, res) => {
  try {
    let query = {};

    if (req.user.role === "owner") {
      query = { owner: req.user._id };
    } else if (
      (req.user.role === "cashier" || req.user.role === "kitchen") &&
      req.user.restaurant
    ) {
      query = { _id: req.user.restaurant };
    } else {
      return res
        .status(404)
        .json({ status: "fail", message: "ليس لديك صلاحية الوصول لمطعم." });
    }

    const restaurant = await Restaurant.findOne(query);

    if (!restaurant) {
      return res.status(404).json({
        status: "fail",
        message:
          req.user.role === "admin"
            ? "حساب أدمن عام."
            : "لم يتم العثور على مطعم مرتبط بهذا الحساب.",
      });
    }

    res.status(200).json({
      status: "success",
      data: {
        restaurant,
        userRole: req.user.role,
      },
    });
  } catch (err) {
    res.status(400).json({ status: "fail", message: err.message });
  }
};

exports.updateRestaurant = async (req, res) => {
  try {
    let updateData = { ...req.body };

    if (updateData.customUI && typeof updateData.customUI === "string") {
      try {
        updateData.customUI = JSON.parse(updateData.customUI);
      } catch (e) {
        updateData.customUI = {};
      }
    }

    if (req.files) {
      if (!updateData.customUI) updateData.customUI = {};

      if (req.files["bgImage"]) {
        updateData.customUI.bgValue = req.files["bgImage"][0].path;
        updateData.customUI.bgType = "image";
      }

      if (req.files["heroImage"]) {
        updateData.customUI.heroImage = req.files["heroImage"][0].path;
      }
    }

    const updatedRestaurant = await Restaurant.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true },
    );

    if (req.io) {
      req.io.to(req.params.id).emit("menu_updated");
    }

    res
      .status(200)
      .json({ status: "success", data: { restaurant: updatedRestaurant } });
  } catch (err) {
    console.error(err);
    res.status(400).json({ status: "fail", message: err.message });
  }
};

exports.getAllRestaurants = async (req, res) => {
  try {
    const restaurants = await Restaurant.find().populate("owner", "name email");
    res.status(200).json({
      status: "success",
      data: { restaurants },
    });
  } catch (err) {
    res.status(400).json({ status: "fail", message: err.message });
  }
};

exports.deleteRestaurant = async (req, res) => {
  try {
    const restaurant = await Restaurant.findByIdAndDelete(req.params.id);
    if (!restaurant) {
      return res
        .status(404)
        .json({ status: "fail", message: "المطعم غير موجود" });
    }
    res.status(204).json({ status: "success", data: null });
  } catch (err) {
    res.status(400).json({ status: "fail", message: err.message });
  }
};

exports.updateQRCode = async (req, res) => {
  try {
    const { qrImage, qrName } = req.body;

    const restaurant = await Restaurant.findOneAndUpdate(
      { slug: req.params.slug },
      { qrImage, qrName },
      { new: true },
    );

    if (!restaurant) {
      return res
        .status(404)
        .json({ status: "fail", message: "المطعم غير موجود" });
    }

    res.status(200).json({ status: "success", data: { restaurant } });
  } catch (err) {
    res.status(400).json({ status: "fail", message: err.message });
  }
};
