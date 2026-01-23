const Order = require("../models/Order");
const Product = require("../models/Product");
const StockItem = require("../models/StockItem");
const StockLog = require("../models/StockLog");


exports.createOrder = async (req, res) => {
  try {
    
    const { restaurantId, tableNumber, items, subTotal, taxAmount, serviceAmount, couponCode, discountAmount, totalPrice } = req.body;

    if (couponCode) {
        const Coupon = require("../models/Coupon");
        await Coupon.findOneAndUpdate(
            { code: couponCode, restaurant: restaurantId },
            { $inc: { usedCount: 1 } }
        );
    }

    const lastOrder = await Order.findOne({ restaurant: restaurantId }).sort({ orderNum: -1 });
    const nextOrderNum = lastOrder && lastOrder.orderNum ? lastOrder.orderNum + 1 : 1;

    
    const newOrder = await Order.create({
      restaurant: restaurantId,
      tableNumber,
      orderNum: nextOrderNum,
      items, 
      subTotal,
      taxAmount,
      serviceAmount,
      couponCode,
      discountAmount,
      totalPrice,
      status: 'pending' 
    });

    
    if (req.io) {
      req.io.to(restaurantId).emit("new-order", newOrder);
    }

    res.status(201).json({ status: "success", data: { order: newOrder } });
  } catch (err) {
    res.status(400).json({ status: "fail", message: err.message });
  }
};


exports.getActiveOrders = async (req, res) => {
  try {
    const orders = await Order.find({
      restaurant: req.params.restaurantId,
      status: { $in: ['pending', 'preparing'] } 
    }).sort('-createdAt');

    res.status(200).json({ status: "success", data: { orders } });
  } catch (err) {
    res.status(400).json({ status: "fail", message: err.message });
  }
};


exports.updateOrderStatus = async (req, res) => {
  try {
    const { status } = req.body;
    const orderId = req.params.id;

    
    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({ status: "fail", message: "الطلب غير موجود" });
    }

    
    
    if (status === 'completed' && order.status !== 'completed') {
      
      
      for (const item of order.items) {
        
        
        
        const product = await Product.findOne({ 
            $or: [{ 'name.ar': item.name }, { 'name.en': item.name }],
            restaurant: order.restaurant 
        }).populate('ingredients.stockItem');

        
        if (product && product.ingredients && product.ingredients.length > 0) {
          
          for (const ing of product.ingredients) {
            
            if(ing.stockItem && ing.stockItem._id) {
              
              
              const deductionAmount = ing.quantity * item.qty;

              
              await StockItem.findByIdAndUpdate(ing.stockItem._id, {
                $inc: { quantity: -deductionAmount }
              });

              
              await StockLog.create({
                restaurant: order.restaurant,
                stockItem: ing.stockItem._id,
                itemName: ing.stockItem.name, 
                changeAmount: -deductionAmount, 
                type: 'consumption', 
                orderId: order._id
              });
            }
          }
        }
      }
    }
    

    
    order.status = status;
    await order.save();

    
    if (req.io) {
      req.io.to(order.restaurant.toString()).emit("order-updated", order);
      
      req.io.to(order._id.toString()).emit("status-changed", status);
    }

    res.status(200).json({ status: "success", data: { order } });
  } catch (err) {
    console.error(err);
    res.status(400).json({ status: "fail", message: err.message });
  }
};


exports.getOrderHistory = async (req, res) => {
    try {
        const { restaurantId } = req.params;
        const { startDate, endDate, search } = req.query;
        
        let query = { 
            restaurant: restaurantId,
            status: { $in: ['completed', 'canceled'] } 
        };

        
        if (startDate && endDate) {
            query.createdAt = { 
                $gte: new Date(startDate), 
                $lte: new Date(endDate) 
            };
        }

        
        if (search) {
            query.$or = [
                { orderNum: Number(search) },
                { tableNumber: search } 
            ];
        }

        const orders = await Order.find(query).sort('-createdAt');

        
        let totalSales = 0;
        orders.forEach(o => {
            if(o.status === 'completed') totalSales += o.totalPrice;
        });

        res.status(200).json({ status: "success", data: { orders, totalSales } });
    } catch (err) {
        res.status(400).json({ status: "fail", message: err.message });
    }
};


exports.getRecentCompletedOrders = async (req, res) => {
    try {
        
        const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
        
        const orders = await Order.find({
            restaurant: req.params.restaurantId,
            status: 'completed',
            updatedAt: { $gte: twoHoursAgo }
        }).sort('-updatedAt');

        res.status(200).json({ status: "success", data: { orders } });
    } catch (err) {
        res.status(400).json({ status: "fail", message: err.message });
    }
};