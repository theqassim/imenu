const mongoose = require("mongoose");

const stockLogSchema = new mongoose.Schema({
  restaurant: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Restaurant",
    required: true,
  },
  stockItem: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "StockItem",
    required: true,
  },
  itemName: String,
  changeAmount: { type: Number, required: true },
  type: {
    type: String,
    enum: ["consumption", "restock", "adjustment", "waste"],
    required: true,
  },
  orderId: { type: mongoose.Schema.Types.ObjectId, ref: "Order" },
  date: { type: Date, default: Date.now },
});

module.exports = mongoose.model("StockLog", stockLogSchema);
