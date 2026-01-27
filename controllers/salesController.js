const SalesRequest = require("../models/SalesRequest");

exports.createRequest = async (req, res) => {
  try {
    const { name, phone, walletNumber } = req.body;
    
    // التحقق من وجود الصورة
    if (!req.file) {
      return res.status(400).json({ status: "fail", message: "يرجى رفع صورة شخصية" });
    }

    const newRequest = await SalesRequest.create({
      name,
      phone,
      walletNumber,
      image: req.file.path, // رابط الصورة من Cloudinary
    });

    // إشعار السوبر أدمن (Socket.io)
    if (req.io) {
      req.io.emit("new-sales-request", newRequest);
    }

    res.status(201).json({ status: "success", data: newRequest });
  } catch (err) {
    res.status(400).json({ status: "fail", message: err.message });
  }
};

exports.getAllRequests = async (req, res) => {
  try {
    const requests = await SalesRequest.find().sort({ createdAt: -1 });
    res.status(200).json({ status: "success", data: requests });
  } catch (err) {
    res.status(400).json({ status: "fail", message: err.message });
  }
};

exports.updateStatus = async (req, res) => {
  try {
    const { status } = req.body;
    const request = await SalesRequest.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true }
    );
    res.status(200).json({ status: "success", data: request });
  } catch (err) {
    res.status(400).json({ status: "fail", message: err.message });
  }
};

exports.deleteRequest = async (req, res) => {
  try {
    await SalesRequest.findByIdAndDelete(req.params.id);
    res.status(200).json({ status: "success", message: "Deleted successfully" });
  } catch (err) {
    res.status(400).json({ status: "fail", message: err.message });
  }
};