const Category = require("../models/Category");
const Product = require("../models/Product");

exports.createCategory = async (req, res) => {
  try {
    const { name, restaurantId } = req.body;
    let imagePath = "";
    if (req.file) imagePath = req.file.path;

    const newCategory = await Category.create({
      name,
      image: imagePath,
      restaurant: restaurantId,
    });

    if (req.io) {
      req.io.to(restaurantId).emit("menu_updated");
    }

    res
      .status(201)
      .json({ status: "success", data: { category: newCategory } });
  } catch (err) {
    res.status(400).json({ status: "fail", message: err.message });
  }
};

exports.getRestaurantCategories = async (req, res) => {
  try {
    const categories = await Category.find({
      restaurant: req.params.restaurantId,
    });

    const categoriesWithCounts = await Promise.all(
      categories.map(async (cat) => {
        const count = await Product.countDocuments({
          category: cat.name,
          restaurant: req.params.restaurantId,
        });
        return { ...cat.toObject(), productCount: count };
      }),
    );

    const totalProducts = await Product.countDocuments({
      restaurant: req.params.restaurantId,
    });

    res.status(200).json({
      status: "success",
      data: {
        categories: categoriesWithCounts,
        stats: {
          totalCats: categories.length,
          totalProds: totalProducts,
        },
      },
    });
  } catch (err) {
    res.status(400).json({ status: "fail", message: err.message });
  }
};

exports.deleteCategory = async (req, res) => {
  try {
    const category = await Category.findByIdAndDelete(req.params.id);

    if (!category) {
      return res
        .status(404)
        .json({ status: "fail", message: "القسم غير موجود" });
    }

    await Product.deleteMany({
      category: category.name,
      restaurant: category.restaurant,
    });

    if (req.io) {
      req.io.to(category.restaurant.toString()).emit("menu_updated");
    }

    res.status(204).json({ status: "success", data: null });
  } catch (err) {
    res.status(400).json({ status: "fail", message: err.message });
  }
};

exports.updateCategory = async (req, res) => {
  try {
    const updateData = { name: req.body.name };

    if (req.file) {
      updateData.image = req.file.path;
    }

    const updatedCategory = await Category.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true },
    );

    if (!updatedCategory) {
      return res
        .status(404)
        .json({ status: "fail", message: "القسم غير موجود" });
    }

    if (req.io) {
      req.io.to(updatedCategory.restaurant.toString()).emit("menu_updated");
    }

    res
      .status(200)
      .json({ status: "success", data: { category: updatedCategory } });
  } catch (err) {
    res.status(400).json({ status: "fail", message: err.message });
  }
};
