const StockItem = require("../models/StockItem");
const StockLog = require("../models/StockLog");

exports.createStockItem = async (req, res) => {
  try {
    const item = await StockItem.create({
      ...req.body,
      restaurant: req.body.restaurantId,
    });
    res.status(201).json({ status: "success", data: item });
  } catch (err) {
    res.status(400).json({ status: "fail", message: err.message });
  }
};

exports.getStockItems = async (req, res) => {
  try {
    const items = await StockItem.find({ restaurant: req.params.restaurantId });
    res.status(200).json({ status: "success", data: { items } });
  } catch (err) {
    res.status(400).json({ status: "fail", message: err.message });
  }
};

exports.adjustStock = async (req, res) => {
  try {
    const { amount, type } = req.body;
    const item = await StockItem.findById(req.params.id);

    item.quantity += amount;
    await item.save();

    await StockLog.create({
      restaurant: item.restaurant,
      stockItem: item._id,
      itemName: item.name,
      changeAmount: amount,
      type: type,
    });

    res.status(200).json({ status: "success", data: item });
  } catch (err) {
    res.status(400).json({ status: "fail", message: err.message });
  }
};

exports.getLogs = async (req, res) => {
  try {
    const { restaurantId, startDate, endDate } = req.query;
    let query = { restaurant: restaurantId };

    if (startDate && endDate) {
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      query.date = { $gte: new Date(startDate), $lte: end };
    }

    const logs = await StockLog.find(query).sort("-date");
    res.status(200).json({ status: "success", data: { logs } });
  } catch (err) {
    res.status(400).json({ status: "fail", message: err.message });
  }
};

exports.deleteStockItem = async (req, res) => {
  try {
    const StockItem = require("../models/StockItem");
    await StockItem.findByIdAndDelete(req.params.id);
    res.status(204).json({ status: "success", data: null });
  } catch (err) {
    res.status(400).json({ status: "fail", message: err.message });
  }
};
