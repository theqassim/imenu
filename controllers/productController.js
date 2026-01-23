const Product = require("../models/Product");

exports.createProduct = async (req, res) => {
  try {
    const {
      name,
      description,
      price,
      oldPrice,
      sizes,
      category,
      restaurantId,
    } = req.body;

    let imagePath = "";
    if (req.file) {
      imagePath = req.file.path;
    }

    let parsedSizes = [];
    if (sizes) {
      try {
        parsedSizes = JSON.parse(sizes);
      } catch (e) {
        parsedSizes = [];
      }
    }

    const newProduct = await Product.create({
      name: JSON.parse(name),
      description: JSON.parse(description),
      price,
      oldPrice: oldPrice || 0,
      sizes: parsedSizes,
      category,
      restaurant: restaurantId,
      image: imagePath,
    });

    if (req.io) {
      req.io.to(restaurantId).emit("menu_updated");
    }

    res.status(201).json({ status: "success", data: { product: newProduct } });
  } catch (err) {
    res.status(400).json({ status: "fail", message: err.message });
  }
};

exports.getRestaurantProducts = async (req, res) => {
  try {
    const products = await Product.find({
      restaurant: req.params.restaurantId,
    }).sort("-createdAt");
    res.status(200).json({ status: "success", data: { products } });
  } catch (err) {
    res.status(400).json({ status: "fail", message: err.message });
  }
};

exports.deleteProduct = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);

    if (!product) {
      return res
        .status(404)
        .json({ status: "fail", message: "المنتج غير موجود" });
    }

    const Restaurant = require("../models/Restaurant");
    const restaurant = await Restaurant.findOne({
      _id: product.restaurant,
      owner: req.user._id,
    });

    if (!restaurant && req.user.role !== "admin") {
      return res
        .status(403)
        .json({ status: "fail", message: "ليس لديك صلاحية لمسح هذا المنتج" });
    }

    await Product.findByIdAndDelete(req.params.id);

    if (req.io) {
      req.io.to(product.restaurant.toString()).emit("menu_updated");
    }

    res.status(204).json({ status: "success", data: null });
  } catch (err) {
    res.status(400).json({ status: "fail", message: err.message });
  }
};

exports.toggleAvailability = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ message: "المنتج غير موجود" });

    product.isAvailable = !product.isAvailable;
    await product.save();

    if (req.io) {
      req.io.to(product.restaurant.toString()).emit("menu_updated");
    }

    res.status(200).json({ status: "success", data: { product } });
  } catch (err) {
    res.status(400).json({ status: "fail", message: err.message });
  }
};

exports.updateProduct = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product)
      return res
        .status(404)
        .json({ status: "fail", message: "المنتج غير موجود" });

    const Restaurant = require("../models/Restaurant");
    const restaurant = await Restaurant.findOne({
      _id: product.restaurant,
      owner: req.user._id,
    });

    if (!restaurant && req.user.role !== "admin") {
      return res
        .status(403)
        .json({ status: "fail", message: "ليس لديك صلاحية لتعديل هذا المنتج" });
    }

    const { name, description, price, oldPrice, sizes, category } = req.body;

    let updateData = {};

    if (name) updateData.name = JSON.parse(name);
    if (description) updateData.description = JSON.parse(description);

    if (price !== undefined) updateData.price = price;
    if (oldPrice !== undefined) updateData.oldPrice = oldPrice;
    if (category) updateData.category = category;

    if (sizes) {
      try {
        updateData.sizes = JSON.parse(sizes);
      } catch (e) {
        updateData.sizes = [];
      }
    }

    if (req.file) {
      updateData.image = req.file.path;
    }

    const updatedProduct = await Product.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true },
    );

    if (!updatedProduct) {
      return res
        .status(404)
        .json({ status: "fail", message: "المنتج غير موجود" });
    }

    if (req.io && updatedProduct.restaurant) {
      req.io.to(updatedProduct.restaurant.toString()).emit("menu_updated");
    }

    res
      .status(200)
      .json({ status: "success", data: { product: updatedProduct } });
  } catch (err) {
    console.error("Update Error:", err);
    res.status(400).json({ status: "fail", message: err.message });
  }
};
