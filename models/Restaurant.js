const mongoose = require("mongoose");

const restaurantSchema = new mongoose.Schema({
  owner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  restaurantName: { type: String, required: true },
  businessType: {
    type: String,
    enum: ["restaurant", "cafe", "both"],
    default: "restaurant",
  },
  slug: { type: String, required: true, unique: true },
  useTableNumbers: { type: Boolean, default: false },
  orderMode: {
    type: String,
    enum: ["whatsapp", "system", "view_only"],
    default: "whatsapp",
  },

  taxRate: { type: Number, default: 0 },
  serviceRate: { type: Number, default: 0 },
  isActive: { type: Boolean, default: true },
  enableCoupons: { type: Boolean, default: false },
  hasStock: { type: Boolean, default: true },
  qrImage: { type: String, default: "" },
  qrName: { type: String, default: "" },

  customUI: {
    bgType: { type: String, default: "color" },
    bgValue: { type: String, default: "#F9F9F9" },
    primaryColor: { type: String, default: "#B78728" },
    heroImage: { type: String, default: "" },

    layoutType: { type: String, default: "modern" },

    cardStyle: { type: String, default: "solid" },

    cardRadius: { type: Number, default: 16 },
    fontFamily: { type: String, default: "Tajawal" },
    showHero: { type: Boolean, default: true },

    heroOverlay: { type: Number, default: 30 },
    heroHeight: { type: Number, default: 200 },
  },

  contactInfo: {
    whatsapp: String,
    phone: String,
    address: String,
  },

  coverImage: String,
  logo: String,

  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("Restaurant", restaurantSchema);
