const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const userSchema = new mongoose.Schema({
  productLimit: { type: Number, default: 75 },
  name: {
    type: String,
    required: true,
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
  },
  password: {
    type: String,
    required: true,
  },
  phone: {
    type: String,
    required: true,
  },
  whatsapp: {
    type: String,
    default: "",
  },
  role: {
    type: String,
    enum: ["user", "owner", "admin", "cashier", "kitchen"],
    default: "user",
  },

  restaurant: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Restaurant",
  },

  shiftStart: { type: String, default: "00:00" },
  shiftEnd: { type: String, default: "23:59" },
  restDays: { type: [Number], default: [] },

  subscriptionExpires: {
    type: Date,
  },
  active: {
    type: Boolean,
    default: true,
  },
  // 🟢 التأكد من أن القيمة الافتراضية هي false
  hasStock: { type: Boolean, default: false },

  createdAt: {
    type: Date,
    default: Date.now,
  },
});

userSchema.methods.correctPassword = async function (
  candidatePassword,
  userPassword,
) {
  return await bcrypt.compare(candidatePassword, userPassword);
};

module.exports = mongoose.model("User", userSchema);
