const express = require("express");
const stockController = require("../controllers/stockController");
const authController = require("../controllers/authController");

const router = express.Router();

router.use(authController.protect);

router.post("/", stockController.createStockItem);
router.get("/logs", stockController.getLogs);
router.get("/:restaurantId", stockController.getStockItems);
router.post("/:id/adjust", stockController.adjustStock);
router.delete("/:id", stockController.deleteStockItem);

module.exports = router;
