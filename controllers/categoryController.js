const Category = require("../models/Category");


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
    res.status(200).json({ status: "success", data: { categories } });
  } catch (err) {
    res.status(400).json({ status: "fail", message: err.message });
  }
};


exports.deleteCategory = async (req, res) => {
  try {
    const category = await Category.findByIdAndDelete(req.params.id);

    
    if (category && req.io) {
      req.io.to(category.restaurant.toString()).emit("menu_updated");
    }

    res.status(204).json({ status: "success", data: null });
  } catch (err) {
    res.status(400).json({ status: "fail", message: err.message });
  }
};
