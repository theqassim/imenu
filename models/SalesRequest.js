const mongoose = require("mongoose");

const salesRequestSchema = new mongoose.Schema({
  name: { type: String, required: true },
  phone: { type: String, required: true },
  walletNumber: { type: String, required: true }, // رقم المحفظة
  image: { type: String, required: true }, // رابط الصورة
  status: { 
    type: String, 
    enum: ["pending", "approved", "rejected"], 
    default: "pending" 
  },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("SalesRequest", salesRequestSchema);