const mongoose = require("mongoose");

const productSchema = new mongoose.Schema({
  restaurant: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Restaurant",
    required: true,
  },
  name: {
    en: { type: String, required: true },
    ar: { type: String },
  },
  description: {
    en: String,
    ar: String,
  },

  price: { type: Number, default: 0 },
  oldPrice: { type: Number, default: 0 },

  sizes: [
    {
      name: { type: String, required: true },
      price: { type: Number, required: true },
      oldPrice: { type: Number, default: 0 },
    },
  ],
  category: {
    type: String,
    required: true,
  },
  image: {
    type: String,
    default: "",
  },
  isAvailable: {
    type: Boolean,
    default: true,
  },
});

module.exports = mongoose.model("Product", productSchema);
