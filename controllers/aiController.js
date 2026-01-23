const { GoogleGenerativeAI } = require("@google/generative-ai");
const Category = require("../models/Category");
const Product = require("../models/Product");
const Restaurant = require("../models/Restaurant");

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

exports.processMenuWithAI = async (req, res) => {
  try {
    const { ownerId } = req.body;
    if (!req.files || req.files.length === 0)
      throw new Error("يرجى رفع صور المنيو");

    const restaurant = await Restaurant.findOne({ owner: ownerId });
    if (!restaurant)
      throw new Error("لم يتم العثور على مطعم مرتبط بهذا المالك");

    const restaurantId = restaurant._id;

    const model = genAI.getGenerativeModel({ model: "gemma-3-27b-it" });

    const imageParts = req.files.map((file) => ({
      inlineData: {
        data: file.buffer.toString("base64"),
        mimeType: file.mimetype,
      },
    }));

    const prompt = `
      حلل صور المنيو هذه واستخرج كل الأكلات والمشروبات بدقة. 
      أريد النتيجة كـ JSON Array فقط بهذا التنسيق:
      [
        {
          "category": "اسم القسم بالعربي",
          "products": [
            {
              "name": "اسم المنتج", 
              "price": 100, 
              "description": "وصف بسيط للمكونات",
              "imageSearchTerm": "وصف بالانجليزية للمنتج لاستخدامه في البحث عن صورة مناسبة له"
            }
          ]
        }
      ]
      ملاحظة: 
      1. استخرج الأسعار كأرقام فقط. 
      2. حقل imageSearchTerm يجب أن يكون وصفاً دقيقاً بالإنجليزية (مثل: "Grilled chicken burger with cheese and lettuce").
    `;

    const result = await model.generateContent([prompt, ...imageParts]);
    const response = await result.response;
    const rawText = response.text();
    const jsonMatch = rawText.match(/\[[\s\S]*\]/);
    const jsonText = jsonMatch
      ? jsonMatch[0]
      : rawText.replace(/```json|```/g, "");
    const menuData = JSON.parse(jsonText);
    for (const item of menuData) {
      let category = await Category.findOne({
        name: item.category,
        restaurant: restaurantId,
      });
      if (!category) {
        category = await Category.create({
          name: item.category,
          restaurant: restaurantId,
        });
      }

      const productPromises = item.products.map((p) => {
        const productImage = "";

        return Product.create({
          name: { ar: p.name, en: p.name },
          description: { ar: p.description, en: "" },
          price: p.price,
          category: category.name,
          restaurant: restaurantId,
          image: productImage,
        });
      });
      await Promise.all(productPromises);
    }

    if (req.io) req.io.to(restaurantId).emit("menu_updated");

    res
      .status(200)
      .json({ status: "success", message: "تم رفع المنيو بالكامل بنجاح" });
  } catch (err) {
    let errorMessage = err.message;
    if (err.message.includes("503") || err.message.includes("overloaded")) {
      errorMessage =
        "سيرفر Gemma مشغول حالياً، يرجى المحاولة مرة أخرى بعد 10 ثوانٍ ⏳";
    }
    res.status(400).json({ status: "fail", message: errorMessage });
  }
};
