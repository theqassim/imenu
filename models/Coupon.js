const mongoose = require("mongoose");

const couponSchema = new mongoose.Schema({
  code: { type: String, required: true, uppercase: true, trim: true },
  restaurant: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Restaurant",
    required: true,
  },
  discountType: {
    type: String,
    enum: ["percent", "fixed"],
    default: "percent",
  },
  value: { type: Number, required: true },
  maxDiscount: { type: Number },
  minOrderVal: { type: Number, default: 0 },
  usageLimit: { type: Number, default: 1000 },
  usedCount: { type: Number, default: 0 },
  expiresAt: { type: Date },
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
});

couponSchema.index({ code: 1, restaurant: 1 }, { unique: true });

module.exports = mongoose.model("Coupon", couponSchema);
