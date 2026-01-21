const mongoose = require("mongoose");

const orderSchema = new mongoose.Schema(
  {
    restaurant: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Restaurant",
      required: true,
    },
    tableNumber: {
      type: String,
      default: "تيك أواي",
    },
    orderNum: { type: Number },
    couponCode: String,
    discountAmount: { type: Number, default: 0 },
    items: [
      {
        name: String,
        price: Number,
        qty: Number,
      },
    ],
    subTotal: { type: Number, required: true },
    taxAmount: { type: Number, default: 0 },
    serviceAmount: { type: Number, default: 0 },
    totalPrice: { type: Number, required: true },
    status: {
      type: String,
      enum: ["pending", "preparing", "completed", "canceled"],
      default: "pending",
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true },
);

module.exports = mongoose.model("Order", orderSchema);
