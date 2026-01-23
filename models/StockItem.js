const mongoose = require("mongoose");

const stockItemSchema = new mongoose.Schema({
  restaurant: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Restaurant",
    required: true,
  },
  name: { type: String, required: true },
  quantity: { type: Number, default: 0 },
  unit: { type: String, required: true },
  costPerUnit: { type: Number, default: 0 },
  alertLevel: { type: Number, default: 5 },
  lastUpdated: { type: Date, default: Date.now },
});

module.exports = mongoose.model("StockItem", stockItemSchema);
