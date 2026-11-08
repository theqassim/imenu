(function () {
  "use strict";

  const TOKEN = "IMENU_SIMULATOR_SESSION";
  const STORAGE_KEY = "imenu-simulator-state-v2";
  const restaurantId = "sim-restaurant";
  window.__imenuSimulator = true;
  const today = new Date().toISOString().slice(0, 10);
  const addDays = (days) => new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);

  sessionStorage.setItem("ownerToken", TOKEN);
  sessionStorage.setItem("currentUserName", "مدير المطعم - تجربة تعليمية");

  const freshState = () => ({
    nextId: 20,
    categories: [
      { _id: "cat-1", id: "cat-1", name: "وجبات البرجر", prepStation: "المطبخ", icon: "🍔", productCount: 2 },
      { _id: "cat-2", id: "cat-2", name: "المشروبات", prepStation: "المشروبات", icon: "🥤", productCount: 2 },
      { _id: "cat-3", id: "cat-3", name: "الإضافات", prepStation: "المطبخ", icon: "🍟", productCount: 1 }
    ],
    stock: [
      { _id: "stock-1", id: "stock-1", name: "لحم برجر", quantity: 12, unit: "كيلو", costPerUnit: 280, alertLevel: 3, piecesPerUnit: 1, expiryAlertDays: 30, restaurant: restaurantId, batches: [{ id: "batch-1", quantity: 12, expiryDate: addDays(20) }] },
      { _id: "stock-2", id: "stock-2", name: "خبز برجر", quantity: 45, unit: "قطعة", costPerUnit: 4, alertLevel: 10, piecesPerUnit: 1, expiryAlertDays: 30, restaurant: restaurantId, batches: [{ id: "batch-2", quantity: 45, expiryDate: addDays(5) }] },
      { _id: "stock-3", id: "stock-3", name: "جبنة شيدر", quantity: 6, unit: "كيلو", costPerUnit: 190, alertLevel: 2, piecesPerUnit: 1, expiryAlertDays: 30, restaurant: restaurantId, batches: [{ id: "batch-3", quantity: 6, expiryDate: addDays(15) }] },
      { _id: "stock-4", id: "stock-4", name: "بطاطس", quantity: 18, unit: "كيلو", costPerUnit: 35, alertLevel: 4, piecesPerUnit: 1, expiryAlertDays: 30, restaurant: restaurantId, batches: [{ id: "batch-4", quantity: 18, expiryDate: addDays(25) }] },
      { _id: "stock-5", id: "stock-5", name: "زيت قلي", quantity: 8, unit: "لتر", costPerUnit: 85, alertLevel: 2, piecesPerUnit: 1, expiryAlertDays: 30, restaurant: restaurantId, batches: [{ id: "batch-5", quantity: 8, expiryDate: addDays(45) }] },
      { _id: "stock-6", id: "stock-6", name: "مشروب غازي", quantity: 36, unit: "علبة", costPerUnit: 12, alertLevel: 8, piecesPerUnit: 1, expiryAlertDays: 30, restaurant: restaurantId, batches: [{ id: "batch-6", quantity: 36, expiryDate: addDays(120) }] }
    ],
    products: [
      { _id: "prod-1", id: "prod-1", name: { ar: "برجر كلاسيك", en: "Classic Burger" }, price: 120, category: "وجبات البرجر", image: "", isAvailable: true, ingredients: [{ stockItem: "stock-1", quantity: 0.15 }, { stockItem: "stock-2", quantity: 1 }, { stockItem: "stock-3", quantity: 0.03 }] },
      { _id: "prod-2", id: "prod-2", name: { ar: "برجر دبل", en: "Double Burger" }, price: 175, category: "وجبات البرجر", image: "", isAvailable: true, ingredients: [{ stockItem: "stock-1", quantity: 0.3 }, { stockItem: "stock-2", quantity: 1 }, { stockItem: "stock-3", quantity: 0.05 }] },
      { _id: "prod-3", id: "prod-3", name: { ar: "مشروب غازي", en: "Soft Drink" }, price: 25, category: "المشروبات", image: "", isAvailable: true, ingredients: [{ stockItem: "stock-6", quantity: 1 }] },
      { _id: "prod-4", id: "prod-4", name: { ar: "بطاطس مقرمشة", en: "Crispy Fries" }, price: 45, category: "الإضافات", image: "", isAvailable: true, ingredients: [{ stockItem: "stock-4", quantity: 0.2 }, { stockItem: "stock-5", quantity: 0.03 }] },
      { _id: "prod-5", id: "prod-5", name: { ar: "مياه معدنية", en: "Mineral Water" }, price: 15, category: "المشروبات", image: "", isAvailable: true, ingredients: [] }
    ],
    orders: [
      { _id: "order-1", id: "order-1", orderNum: 104, status: "completed", paymentMethod: "cash", total: 145, createdAt: new Date(Date.now() - 3600000).toISOString(), items: [{ name: "برجر كلاسيك", quantity: 1, price: 120 }, { name: "مشروب غازي", quantity: 1, price: 25 }] }
    ],
    shifts: [{ _id: "shift-1", id: "shift-1", shiftNum: 11, status: "closed", openedByName: "مدير المطعم", startTime: new Date(Date.now() - 26 * 3600000).toISOString(), endTime: new Date(Date.now() - 18 * 3600000).toISOString(), openingBalance: 500, closingBalance: 2160, deviceKey: "simulator" }],
    expenses: [{ _id: "expense-1", id: "expense-1", name: "مستلزمات نظافة", amount: 80, category: "مصروفات تشغيل", date: today, note: "بيانات تدريبية" }],
    employees: [
      { _id: "emp-1", id: "emp-1", name: "أحمد محمد", role: "cashier", phone: "01000000001", salary: 6000, isActive: true },
      { _id: "emp-2", id: "emp-2", name: "سارة علي", role: "kitchen", phone: "01000000002", salary: 5500, isActive: true }
    ],
    stockLogs: [],
    attendance: [],
    settings: { taxRate: 0, serviceRate: 0 }
  });

  function readState() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved ? Object.assign(freshState(), JSON.parse(saved)) : freshState();
    } catch (error) {
      console.error("تعذر قراءة بيانات المحاكي المحفوظة", error);
      return freshState();
    }
  }

  let state = readState();
  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (error) {
      console.error("تعذر حفظ بيانات المحاكي", error);
      showNotice("تعذر حفظ التغييرات التجريبية في هذا المتصفح.", "error");
    }
  }

  function response(payload, status) {
    return new Response(JSON.stringify(payload), {
      status: status || 200,
      headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }
    });
  }

  function getBody(init) {
    if (!init || !init.body) return {};
    if (init.body instanceof FormData) {
      const result = {};
      init.body.forEach((value, key) => {
        if (typeof value !== "string") return;
        result[key] = value;
        if (["name", "description", "ingredients", "sizes", "quickComments"].includes(key)) {
          try { result[key] = JSON.parse(value); } catch (error) {}
        }
      });
      return result;
    }
    try { return JSON.parse(init.body); } catch (error) { return {}; }
  }

  function ok(data, extra) {
    return Object.assign({ status: "success", data: data || {} }, extra || {});
  }

  function stockItem(item) {
    return Object.assign({ restaurant: restaurantId, batches: [] }, item, { id: item.id || item._id, _id: item._id || item.id });
  }

  function handleApi(url, init) {
    const path = url.pathname.replace(/\/+$/, "");
    const parts = path.split("/").filter(Boolean);
    const method = (init && init.method || "GET").toUpperCase();
    const body = getBody(init);
    const last = parts[parts.length - 1];
    const id = parts[parts.length - 1];

    if (path === "/api/v1/users/my-staff") {
      return response(ok({ staff: state.employees }));
    }
    if (parts[2] === "users" && parts[3] === "staff" && method === "POST") {
      const employeeId = "emp-" + state.nextId++;
      const employee = Object.assign({ _id: employeeId, id: employeeId, isActive: true, salary: 0 }, body);
      state.employees.push(employee); save();
      return response(ok({ user: employee }), 201);
    }
    if (parts[2] === "users" && parts[3] === "staff" && parts[4] && method === "DELETE") {
      state.employees = state.employees.filter((employee) => employee.id !== parts[4] && employee._id !== parts[4]); save();
      return response(ok({}));
    }
    if (parts[2] === "users" && parts[3] === "staff" && parts[4] && ["PATCH", "PUT"].includes(method)) {
      const employee = state.employees.find((entry) => entry.id === parts[4] || entry._id === parts[4]);
      if (employee) Object.assign(employee, body);
      save();
      return response(ok({ user: employee }));
    }
    if (path === "/api/v1/captains/" + restaurantId) {
      return response(ok(state.employees.filter((employee) => employee.role === "captain")));
    }
    if (path === "/api/v1/restaurants/my-restaurant") {
      return response(ok({
        restaurant: Object.assign({
          _id: restaurantId, id: restaurantId, restaurantName: "مطعم التجربة", slug: "demo",
          taxRate: state.settings.taxRate, serviceRate: state.settings.serviceRate,
          useTableNumbers: true, customUI: { tableCount: 12 }, orderMode: "system",
          enableCoupons: true, printOrderNumber: true, printSettings: JSON.stringify({}),
          isRetail: false, isAccessories: false, currency: "ج.م"
        }, state.settings),
        userRole: "owner", user: { _id: "sim-user", id: "sim-user", name: "مدير المطعم", role: "owner" },
        hasStock: true, hasPlaystation: true, shiftStart: null, shiftEnd: null
      }));
    }
    if (path === "/api/v1/restaurants/" + restaurantId + "/cancel-settings" ||
        path === "/api/v1/restaurants/" + restaurantId + "/discount-settings" ||
        path === "/api/v1/restaurants/" + restaurantId + "/channel-tax-service-settings" ||
        path === "/api/v1/restaurants/" + restaurantId + "/talabat-markup-settings" ||
        path === "/api/v1/restaurants/" + restaurantId + "/payment-methods" ||
        path === "/api/v1/restaurants/" + restaurantId + "/cashier-permissions") {
      return response(ok({}));
    }
    if (path === "/api/v1/appearance" || path === "/api/v1/printers-config" ||
        path === "/api/v1/printers-list" || path === "/api/v1/device-labels/" + restaurantId) {
      return response(ok(path.includes("printers") ? [] : {}));
    }
    if (path === "/api/v1/restaurants/" + restaurantId) {
      return response(ok({ restaurant: { _id: restaurantId, customUI: { tableCount: 12, tableZones: [], dupZones: [] } } }));
    }
    if (path === "/api/v1/categories/" + restaurantId || path === "/api/v1/categories") {
      if (method === "GET") return response(ok({ categories: state.categories, stats: { totalCats: state.categories.length, totalProds: state.products.length } }));
      if (method === "POST") {
        const categoryId = "cat-" + state.nextId++;
        const category = Object.assign({ _id: categoryId, id: categoryId, productCount: 0, prepStation: "المطبخ" }, body);
        state.categories.push(category); save();
        return response(ok({ category }), 201);
      }
    }
    if (parts[2] === "categories" && parts[3] && method === "DELETE") {
      state.categories = state.categories.filter((category) => category.id !== parts[3] && category._id !== parts[3]); save();
      return response(ok({}));
    }
    if (parts[2] === "categories" && parts[3] && ["PATCH", "PUT"].includes(method)) {
      const category = state.categories.find((entry) => entry.id === parts[3] || entry._id === parts[3]);
      if (category) Object.assign(category, body);
      save();
      return response(ok({ category }));
    }
    if (path === "/api/v1/products/restaurant/" + restaurantId) {
      return response(ok({ products: state.products }));
    }
    if (path === "/api/v1/products" && method === "POST") {
      const productId = "prod-" + state.nextId++;
      const product = Object.assign({ _id: productId, id: productId, isAvailable: true, ingredients: [] }, body);
      state.products.push(product); save();
      return response(ok({ product }), 201);
    }
    if (parts[2] === "products" && parts[3] && method === "PATCH" && parts[4] === "toggle") {
      const product = state.products.find((item) => item._id === parts[3] || item.id === parts[3]);
      if (product) product.isAvailable = !product.isAvailable;
      save();
      return response(ok({ product }));
    }
    if (parts[2] === "products" && parts[3] && ["PATCH", "PUT"].includes(method)) {
      const product = state.products.find((item) => item._id === parts[3] || item.id === parts[3]);
      if (product) Object.assign(product, body);
      save();
      return response(ok({ product }));
    }
    if (parts[2] === "products" && parts[3] && method === "DELETE") {
      state.products = state.products.filter((item) => item._id !== parts[3] && item.id !== parts[3]); save();
      return response(ok({}));
    }
    if (path === "/api/v1/stock/" + restaurantId || path === "/api/v1/stock/restaurant/" + restaurantId) {
      return response(ok({ items: state.stock.map(stockItem) }));
    }
    if (path === "/api/v1/stock" && method === "POST") {
      const qty = Number(body.quantity) || 0;
      const stockId = "stock-" + state.nextId++;
      const item = stockItem(Object.assign({
        _id: stockId, id: stockId,
        quantity: qty, alertLevel: 0, piecesPerUnit: 1, expiryAlertDays: 30,
        batches: qty > 0 ? [{ id: "batch-" + state.nextId, quantity: qty, expiryDate: body.expiryDate || null }] : []
      }, body));
      state.stock.push(item); save();
      return response(ok(item), 201);
    }
    if (path === "/api/v1/stock/logs") return response(ok({ logs: state.stockLogs }));
    if (parts[2] === "stock" && parts[3] && parts[4] === "adjust" && method === "PATCH") {
      const item = state.stock.find((entry) => entry.id === parts[3] || entry._id === parts[3]);
      if (!item) return response({ status: "fail", message: "الخامة غير موجودة" }, 404);
      const amount = Math.abs(Number(body.amount) || 0);
      const change = body.type === "restock" ? amount : body.type === "waste" ? -amount : Number(body.amount) || 0;
      item.quantity = Math.max(0, Number(item.quantity || 0) + change);
      item.batches = item.batches || [];
      if (body.type === "restock") item.batches.push({ id: "batch-" + state.nextId++, quantity: amount, expiryDate: body.expiryDate || null });
      if (body.type === "waste" && item.batches.length) item.batches[0].quantity = Math.max(0, item.batches[0].quantity - amount);
      state.stockLogs.unshift({ _id: "log-" + state.nextId++, itemName: item.name, stockItem: item.id, changeAmount: change, type: body.type || "adjustment", date: new Date().toISOString() });
      save();
      return response(ok(stockItem(item)));
    }
    if (parts[2] === "stock" && parts[3] && parts[4] === "edit" && method === "PATCH") {
      const item = state.stock.find((entry) => entry.id === parts[3] || entry._id === parts[3]);
      if (item) Object.assign(item, body);
      save();
      return response(ok(stockItem(item || {})));
    }
    if (parts[2] === "stock" && parts[3] && method === "DELETE") {
      state.stock = state.stock.filter((entry) => entry.id !== parts[3] && entry._id !== parts[3]); save();
      return response(ok({}));
    }
    if (path === "/api/v1/shifts/active/" + restaurantId) {
      return response(ok({ shift: state.shifts.find((shift) => shift.status === "active") || null, deviceKey: "simulator" }));
    }
    if (path === "/api/v1/shifts/active-all/" + restaurantId) {
      return response(ok({ shifts: state.shifts.filter((shift) => shift.status === "active"), currentDeviceKey: "simulator" }));
    }
    if (path === "/api/v1/shifts/pending/" + restaurantId) return response(ok({ shifts: state.shifts.filter((shift) => shift.status === "pending") }));
    if (path === "/api/v1/shifts/history/" + restaurantId) return response(ok({ shifts: state.shifts.filter((shift) => shift.status !== "active") }));
    if (path === "/api/v1/shifts/start" && method === "POST") {
      state.shifts.filter((shift) => shift.status === "active").forEach((shift) => { shift.status = "pending"; shift.endTime = new Date().toISOString(); });
      const shift = { _id: "shift-" + state.nextId++, id: "shift-" + state.nextId, shiftNum: state.shifts.length + 12, status: "active", openedByName: "مدير المطعم", startTime: new Date().toISOString(), openingBalance: Number(body.openingBalance || body.cashAmount || 0), deviceKey: "simulator" };
      state.shifts.push(shift); save();
      return response(ok({ shift }), 201);
    }
    if (parts[2] === "shifts" && parts[3] && parts[4] === "end" && method === "POST") {
      const shift = state.shifts.find((entry) => entry.id === parts[3] || entry._id === parts[3]);
      if (shift) { shift.status = "closed"; shift.endTime = new Date().toISOString(); shift.closingBalance = body.closingBalance || body.actualCash || 0; }
      save();
      return response(ok({ shift }));
    }
    if (parts[2] === "shifts" && parts[3] && parts[4] === "summary") {
      const shift = state.shifts.find((entry) => entry.id === parts[3] || entry._id === parts[3]) || state.shifts[0];
      const orders = state.orders.filter((order) => order.status === "completed");
      return response(ok({ shift, summary: { totalSales: orders.reduce((sum, order) => sum + Number(order.total || 0), 0), ordersCount: orders.length, cashSales: orders.filter((order) => order.paymentMethod === "cash").reduce((sum, order) => sum + Number(order.total || 0), 0), expenses: state.expenses } }));
    }
    if (path === "/api/v1/orders/" + restaurantId || path === "/api/v1/orders/" + restaurantId + "/active" ||
        path === "/api/v1/orders/active/" + restaurantId || path === "/api/v1/orders/my-orders") {
      return response(ok({ orders: state.orders.filter((order) => order.status !== "completed") }));
    }
    if (path === "/api/v1/orders/history/" + restaurantId || path === "/api/v1/orders/" + restaurantId + "/history" ||
        path === "/api/v1/orders/recent-completed/" + restaurantId) {
      return response(ok({ orders: state.orders.filter((order) => order.status === "completed") }));
    }
    if (path === "/api/v1/orders" && method === "POST") {
      const items = body.items || body.orderItems || [];
      const total = Number(body.total || body.grandTotal || items.reduce((sum, item) => sum + Number(item.price || 0) * Number(item.quantity || item.qty || 1), 0));
      const order = Object.assign({
        _id: "order-" + state.nextId++, id: "order-" + state.nextId,
        orderNum: state.orders.length + 105, status: "pending", paymentMethod: body.paymentMethod || "cash",
        total, createdAt: new Date().toISOString(), items, restaurant: restaurantId
      }, body);
      state.orders.unshift(order);
      items.forEach((line) => {
        const lineName = typeof line.name === "object" ? line.name.ar : line.name;
        const product = state.products.find((entry) => entry._id === (line.productId || line.product || line.id) || entry.name.ar === lineName);
        if (!product) return;
        (product.ingredients || []).forEach((ingredient) => {
          const item = state.stock.find((entry) => entry.id === (ingredient.stockItem || ingredient.stockItemId));
          if (item) item.quantity = Math.max(0, Number(item.quantity) - Number(ingredient.quantity || 0) * Number(line.quantity || line.qty || 1));
        });
      });
      save();
      return response(ok({ order }), 201);
    }
    if (parts[2] === "orders" && parts[3] && parts.length === 4 && ["PATCH", "PUT"].includes(method)) {
      const order = state.orders.find((entry) => entry.id === parts[3] || entry._id === parts[3]);
      if (order) Object.assign(order, body);
      save();
      return response(ok({ order }));
    }
    if (parts[2] === "orders" && parts[3] && parts[4] === "status" && method === "PATCH") {
      const order = state.orders.find((entry) => entry.id === parts[3] || entry._id === parts[3]);
      if (order) order.status = body.status || body.newStatus || order.status;
      save();
      return response(ok({ order }));
    }
    if (path === "/api/v1/expenses/" + restaurantId || path === "/api/v1/expenses/" + restaurantId + "/categories") {
      if (method === "GET") return response(ok(path.endsWith("/categories") ? ["مصروفات تشغيل", "مشتريات", "صيانة"] : state.expenses));
      if (method === "POST") {
        const expenseId = "expense-" + state.nextId++;
        const expense = Object.assign({ _id: expenseId, id: expenseId, date: today }, body);
        state.expenses.unshift(expense); save();
        return response(ok({ expense }), 201);
      }
    }
    if (path === "/api/v1/hr/employees" && method === "POST") {
      const employeeId = "emp-" + state.nextId++;
      const employee = Object.assign({ _id: employeeId, id: employeeId, isActive: true, salary: 0, leave_balance: 21 }, body);
      state.employees.push(employee); save();
      return response(ok(employee), 201);
    }
    if (path === "/api/v1/hr/employees" || path === "/api/v1/accounting/employees") return response(ok(state.employees));
    if (parts[2] === "hr" && parts[3] === "employees" && parts[4] && method === "DELETE") {
      state.employees = state.employees.filter((employee) => employee.id !== parts[4] && employee._id !== parts[4]); save();
      return response(ok({}));
    }
    if (parts[2] === "hr" && parts[3] === "employees" && parts[4] && parts[5] === "salary" && method === "PATCH") {
      const employee = state.employees.find((entry) => entry.id === parts[4] || entry._id === parts[4]);
      if (employee) employee.salary = Number(body.salary) || 0;
      save();
      return response(ok({ employee }));
    }
    if (parts[2] === "hr" && parts[3] === "employees" && parts[4] && parts[5] === "shift" && method === "PATCH") {
      const employee = state.employees.find((entry) => entry.id === parts[4] || entry._id === parts[4]);
      if (employee) Object.assign(employee, body);
      save();
      return response(ok({ employee }));
    }
    if (parts[2] === "hr" && parts[3] === "employees" && parts[4] && parts[5] === "settings") {
      if (method === "GET") return response(ok({ settings: {} }));
      return response(ok({}));
    }
    if (path === "/api/v1/hr/settings") return response(ok({ settings: {} }));
    if (path === "/api/v1/hr/attendance/all" || path === "/api/v1/accounting/attendance") return response(ok({ attendance: state.attendance }));
    if (parts[2] === "hr" && (parts[3] === "summary" || parts[3] === "deductions")) return response(ok({ summary: {}, deductions: [], employee: state.employees[0] }));
    if (path === "/api/v1/coupons/" + restaurantId) return response(ok({ coupons: [] }));
    if (path === "/api/v1/devices") return response(ok([]));
    if (path === "/api/v1/devices/block" || path === "/api/v1/devices/unblock") {
      return response({ status: "success", simulated: true, message: "تمت محاكاة تحديث حالة الجهاز." });
    }
    if (path === "/api/v1/network/qr") {
      const placeholder = '<svg xmlns="http://www.w3.org/2000/svg" width="220" height="220"><rect width="100%" height="100%" fill="#f1f5f9"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-family="sans-serif" font-size="16" fill="#475569">محاكاة فقط</text></svg>';
      return response(ok({
        qrCode: "data:image/svg+xml;charset=utf-8," + encodeURIComponent(placeholder),
        url: "المحاكي لا يدعم الاتصال بالشبكة"
      }));
    }

    if (parts[2] === "users" && parts[3] === "login") {
      return response(ok({ token: TOKEN, user: { _id: "sim-user", name: "مدير المطعم", role: "owner" } }));
    }
    if (parts[2] === "users" && parts[3] === "changeMyPassword" && method === "PATCH") {
      return response({ status: "success", simulated: true, message: "تمت محاكاة تغيير كلمة المرور فقط." });
    }
    if (path.startsWith("/api/v1/")) {
      if (path.includes("/print") || path.endsWith("/printers-test")) {
        return response({ status: "success", simulated: true, message: "معاينة تجريبية فقط" });
      }
      if (method === "GET") return response(ok({ items: [], orders: [], products: [], categories: [], employees: [], shifts: [], expenses: [], logs: [] }));
      return response({ status: "fail", message: "هذه العملية غير مفعّلة في المحاكي، ولم يتم حفظ أي بيانات." }, 501);
    }
    return null;
  }

  const nativeFetch = window.fetch.bind(window);
  window.fetch = function (input, init) {
    let url;
    try { url = new URL(typeof input === "string" ? input : input.url, window.location.href); }
    catch (error) { return nativeFetch(input, init); }
    if (url.pathname.startsWith("/api/v1/")) return Promise.resolve(handleApi(url, init || {}));
    return nativeFetch(input, init);
  };
  window.print = function () {
    showNotice("الطباعة الفعلية غير مفعّلة في المحاكي.", "info");
  };
  window.toggleFullScreen = function () {
    showNotice("المحاكي يعمل داخل نافذة عادية حتى تقدر تشوف الشرح والنظام مع بعض.", "info");
  };
  window.exitApplication = async function () {
    showNotice("إغلاق التطبيق الحقيقي غير متاح في المحاكي. تقدر تقفل تبويب المتصفح بأمان.", "info");
  };
  window.logout = function () {
    showNotice("تسجيل الخروج غير مطلوب في التجربة. بياناتك التجريبية محفوظة في هذا المتصفح.", "info");
  };

  window.io = window.io || function () {
    const listeners = {};
    return {
      on(event, handler) { (listeners[event] = listeners[event] || []).push(handler); return this; },
      off() { return this; },
      emit() { return this; },
      connect() { return this; },
      disconnect() { return this; }
    };
  };

  const lessons = [
    { view: "categories", target: "#view-categories", title: "ابدأ بتقسيم المنيو", text: "دي شاشة الأقسام. كل قسم بيظهر للكاشير في ترتيب واضح. اكتب اسم القسم وحدد محطة التحضير المناسبة، زي المطبخ أو المشروبات، وبعدها اضغط حفظ. بص على الجدول تحت عشان تراجع الأقسام الموجودة." },
    { view: "products", target: "#view-products", title: "أضف المنتجات وأسعارها", text: "من شاشة المنتجات ضيف اسم الصنف وسعره واختار القسم. خليك متأكد إن المنتج متاح للبيع، وبعد الحفظ تقدر تربطه بالمقادير من شاشة الوصفات." },
    { view: "stock", target: "#view-stock", title: "سجّل الخامات ووحداتها", text: "دي شاشة المخزن. سجّل اسم كل خامة بوحدة ثابتة: كيلو أو لتر أو قطعة، وحدد الرصيد الحالي والتكلفة وحد التنبيه. الرصيد القليل أو الصلاحية القريبة بيظهروا هنا للتنبيه." },
    { view: "stock", target: "#view-stock", title: "استلام فاتورة المورد", text: "بعد إنشاء الخامة، استخدم زر إضافة رصيد لتسجيل الكمية المستلمة وتاريخ الصلاحية. كل استلام بيتسجل كتشغيلة منفصلة، والرصيد بيتحدث قدامك." },
    { view: "stock", target: "#view-stock", title: "التسويات والهالك والجرد", text: "من نفس الشاشة سجّل الهالك أو التسوية لو فيه كسر أو فرق جرد. راجع سجل الحركة قبل اعتماد التعديل، وقارن الكمية الفعلية بالرصيد المسجل." },
    { view: "shift", nav: "nav-surprise-inventory", action: "printSurpriseInventory", title: "الجرد المفاجئ للمخزون", text: "من أيقونة الجرد المفاجئ ابدأ عدّ الخامات وقارنها بالرصيد في النظام. راجع الفروق وحدد سببها قبل اعتماد التسوية." },
    { view: "recipes", target: "#view-recipes", title: "اربط وصفة المنتج بالخامات", text: "دي شاشة الوصفات. اختار المنتج، وبعدها اربط كل خامة بالكمية اللي بيستهلكها الطبق. مثال: البرجر يستهلك 150 جرام لحم وقطعة خبز. بيع المنتج بعد كده يخصم المقادير من المخزن." },
    { view: "staff", target: "#view-staff", title: "جهّز الموظفين والصلاحيات", text: "من إدارة الموظفين ضيف كل مستخدم بدوره الصحيح: مالك أو مدير أو كاشير أو مطبخ. راجع الصلاحيات قبل الحفظ عشان كل موظف يشوف المهام المطلوبة منه بس." },
    { view: "shift", target: "#view-shift", title: "افتح الوردية وسجّل العهدة", text: "قبل البيع افتح وردية جديدة وسجّل النقدية الافتتاحية في الدرج. الوردية بتجمع الطلبات والمصروفات والحركات لحد وقت الإغلاق." },
    { view: "orders", target: "#view-orders", title: "تابع طلبات الصالة والمطبخ", text: "هنا تتابع الطلبات وحالتها: جديد، قيد التحضير، جاهز أو تم التسليم. افتح الطلب لمراجعة الأصناف والملاحظات، وكل صنف بيتوجه لمحطة التحضير المحددة لقسمه." },
    { view: "manual-pos", target: "#view-manual-pos", title: "أنشئ فاتورة كاشير", text: "في شاشة البيع المباشر اختار القسم والمنتج واضغط لإضافته للفاتورة. راجع الكمية والإجمالي، وبعدها اختار طريقة الدفع وأكد البيع. الطباعة هنا معاينة تجريبية فقط." },
    { view: "tables", target: "#view-tables", title: "إدارة الطاولات", text: "دي خريطة الطاولات. اختار طاولة متاحة عشان تفتح طلبها، ضيف الأصناف وسجل ملاحظات العميل. تابع لون وحالة الطاولة لحد ما الحساب يتدفع والطاولة تفضى." },
    { view: "delivery", target: "#view-delivery", title: "طلبات الدليفري", text: "سجّل رقم العميل والعنوان ومندوب التوصيل، وضيف الأصناف وطريقة الدفع. تابع حالة الطلب والتحصيل، وراجع مديونية المندوب عند التسوية." },
    { view: "talabat", target: "#view-talabat", title: "قنوات الطلبات الخارجية", text: "تابع طلبات منصات التوصيل وراجع قيمة الطلب والعمولة وطريقة التحصيل. قبل التسوية طابق الطلبات المسجلة مع كشف المنصة." },
    { view: "bulk", target: "#view-bulk", title: "البيع بالجملة", text: "ضيف أكتر من صنف وكميته في فاتورة واحدة، وبعدها راجع الإجمالي والخصم وبيانات العميل قبل تأكيد العملية." },
    { view: "expenses", target: "#view-expenses", title: "سجّل مصروفات الوردية", text: "سجّل المصروف وقت حدوثه مع التصنيف والقيمة والبيان. المصروف بيأثر على النقدية المتوقعة عند إغلاق الوردية. مشتريات الخامات سجّلها كاستلام مخزون مش كمصروف استهلاك." },
    { view: "history", target: "#view-history", title: "راجع البيع والفواتير", text: "من سجل المبيعات راجع الفواتير وحالة الدفع وطريقة التحصيل. راجع الإلغاءات والخصومات والمرتجعات قبل الإغلاق." },
    { view: "hr", target: "#view-hr", title: "الحضور والموارد البشرية", text: "تابع حضور وانصراف الموظفين، ساعات العمل، السلف والخصومات والرواتب. راجع سجلات الفريق قبل اعتماد المستحقات." },
    { view: "attendance-log", target: "#view-attendance-log", title: "راجع سجل الحضور", text: "افتح سجل الحضور لمراجعة تسجيلات الدخول والخروج حسب الموظف والتاريخ. راجع أي تسجيل ناقص قبل اعتماد ساعات العمل." },
    { view: "reports", target: "#view-reports", title: "حلّل أداء اليوم", text: "التقارير بتعرض المبيعات حسب المنتج والقسم ومحطة التحضير وطريقة الدفع والموظف. اختار الفترة الصح، وقارن المؤشرات قبل التصدير." },
    { view: "devices", target: "#view-devices", title: "الأجهزة والطابعات", text: "من هنا تراجع الأجهزة والطابعات ومحطات التحضير. في النظام الحقيقي اكتشاف الطابعات مرتبط بالشبكة المحلية؛ المحاكي يعرض واجهة الإعدادات من غير اتصال بأجهزة فعلية." },
    { view: "shift", target: "#view-shift", title: "جرد الدرج قبل الإغلاق", text: "عدّ النقدية الفعلية وقارنها بالمبيعات النقدية بعد العهدة والمصروفات. راجع المدفوعات الإلكترونية والطلبات المعلقة كلٌ على حدة." },
    { view: "shift", target: "#view-shift", title: "أغلق الوردية واحفظ ملخصها", text: "بعد المطابقة اقفل الوردية. راجع إجمالي المبيعات، النقدي والبطاقات، المصروفات، الفرق بين المتوقع والفعلي، وعدد الطلبات. الملخص يتسجل في سجل الورديات." },
    { view: "shift-history", target: "#view-shift-history", title: "ارجع لسجل الورديات", text: "من سجل الورديات راجع عمليات الإغلاق السابقة وملخص كل وردية. استخدمه لمراجعة الفروقات والأرقام عند الحاجة." },
    { view: "settings", target: "#view-settings", title: "اضبط إعدادات المطعم والطباعة", text: "راجع الضرائب والخدمة وأرقام الطاولات وطرق الدفع وشكل الفاتورة. احفظ الإعدادات بعد مراجعتها. الطباعة الفعلية غير مفعّلة في المحاكي." },
    { view: "design", title: "صمّم منيو العميل", text: "خصص شكل المنيو الإلكتروني، الألوان والصور وترتيب المنتجات ورسائل المطعم. اختبر العرض على الهاتف قبل نشر رابط المنيو." },
    { view: "paper-menu", title: "تصميم المنيو الورقي", text: "اختر قالب المنيو الورقي والأقسام والخطوط والألوان، واضبط ترتيب العناصر ثم عاين الصفحات قبل التصدير أو الطباعة." },
    { view: "playstation", title: "جلسات البلايستيشن", text: "إذا كان النشاط يقدم جلسات ألعاب، سجّل الأجهزة والأسعار وابدأ الجلسات وأوقفها عند انتهائها، ثم راجع مدة الاستخدام وقيمة الجلسة ضمن المبيعات." },
    { view: "match-tickets", title: "تذاكر المباريات", text: "أدخل اسم المباراة وسعر التذكرة والعدد، وراجع إجمالي التحصيل قبل الطباعة. الطباعة هنا تجريبية وتظهر معاينة فقط." },
    { view: "appearance", title: "المظهر وتجربة الاستخدام", text: "غيّر المظهر وإعدادات واجهة النظام بما يناسب جهازك. التغييرات في هذا المحاكي محفوظة محليًا داخل المتصفح ولا تؤثر على أي مطعم حقيقي." },
    { view: "switch-account", title: "التبديل بين الحسابات", text: "تتيح شاشة التبديل الانتقال بين حسابات محفوظة على الجهاز. في النظام الحقيقي لا تشارك كلمات المرور، وسجّل الخروج عند استخدام جهاز مشترك." },
    { view: "settings", nav: "nav-change-password", action: "openChangePasswordDialog", title: "تغيير كلمة المرور", text: "استخدم كلمة مرور قوية وفريدة، ولا تشاركها بين الموظفين. هذا الإجراء في المحاكي لا يغيّر أي كلمة مرور فعلية." },
    { view: "orders", title: "تعرّف على الطلبات والإعدادات الإضافية", text: "تشمل اللوحة أيضًا طلبات العميل، طلبات المنيو، إعدادات الأجهزة، تقارير المحطات، الطلبات المؤجلة، إدارة العملاء والموردين، والاستيراد والتصدير. افتح الأقسام من القائمة الجانبية واستكشف عناصرها؛ أي عمليات حفظ هنا تظل بيانات وهمية داخل متصفحك." }
  ];

  function showNotice(message, type) {
    if (window.Swal && typeof window.Swal.fire === "function") {
      window.Swal.fire({ toast: true, position: "top-end", icon: type || "info", title: message, showConfirmButton: false, timer: 2600 });
    } else {
      console.info(message);
    }
  }

  function installGuide() {
    if (document.getElementById("sim-guide")) return;
    window.toggleFullScreen = function () {
      showNotice("المحاكي يعمل داخل نافذة عادية حتى تقدر تشوف الشرح والنظام مع بعض.", "info");
    };
    window.exitApplication = async function () {
      showNotice("إغلاق التطبيق الحقيقي غير متاح في المحاكي. تقدر تقفل تبويب المتصفح بأمان.", "info");
    };
    window.logout = function () {
      showNotice("تسجيل الخروج غير مطلوب في التجربة. بياناتك التجريبية محفوظة في هذا المتصفح.", "info");
    };
    const style = document.createElement("style");
    style.textContent = [
      "#sim-banner{position:fixed;z-index:10001;top:8px;left:50%;transform:translateX(-50%);background:#172554;color:#fff;padding:6px 14px;border-radius:999px;font:700 12px/1.5 Arial,sans-serif;box-shadow:0 6px 24px #0f172a33;white-space:nowrap}",
      "#sim-launch{position:fixed;z-index:10002;bottom:18px;left:18px;border:0;border-radius:50px;padding:12px 16px;background:#4338ca;color:#fff;font:700 14px Arial,sans-serif;box-shadow:0 8px 25px #4338ca55;cursor:pointer}",
      "#sim-guide{position:fixed;z-index:10006;left:16px;top:64px;bottom:82px;width:340px;display:none;align-items:flex-start;justify-content:flex-start;padding:0;font-family:Arial,sans-serif;pointer-events:none}",
      "#sim-guide.open{display:flex}#sim-guide-card{pointer-events:auto;background:#fff;color:#1e293b;width:100%;max-height:100%;overflow:auto;border:1px solid #c7d2fe;border-radius:18px;padding:19px;box-shadow:0 12px 38px #0f172a25;text-align:right}",
      "#sim-guide-card h2{margin:8px 0 9px;font-size:20px;color:#312e81}#sim-guide-card p{font-size:15px;line-height:1.8;margin:0 0 14px}",
      "#sim-guide-progress{height:7px;background:#e2e8f0;border-radius:8px;overflow:hidden}#sim-guide-progress span{display:block;height:100%;background:#4f46e5;transition:width .2s}",
      "#sim-guide-meta{display:flex;justify-content:space-between;align-items:center;color:#64748b;font-size:13px;margin:12px 0}",
      "#sim-guide-actions{display:flex;gap:8px;flex-wrap:wrap}#sim-guide-actions button{border:0;border-radius:10px;padding:11px 15px;font-weight:700;cursor:pointer}",
      "#sim-guide-actions .primary{background:#4338ca;color:white;margin-inline-start:auto}#sim-guide-actions .sub{background:#eef2ff;color:#3730a3}#sim-guide-actions .reset{background:#fff1f2;color:#be123c}",
      "#sim-screen-guide{border-top:1px solid #e2e8f0;margin-top:14px;padding-top:12px}#sim-screen-guide>button{width:100%;border:0;border-radius:10px;padding:10px;background:#ecfdf5;color:#047857;font-weight:700;cursor:pointer}#sim-screen-actions{display:none;gap:8px;margin-top:9px}#sim-screen-actions.active{display:flex}#sim-screen-actions button{border:0;border-radius:9px;padding:8px 12px;background:#eef2ff;color:#3730a3;font-weight:700;cursor:pointer}#sim-screen-actions button:disabled{opacity:.45;cursor:default}#sim-screen-meta{font-size:12px;color:#64748b;margin:8px 0}",
      "#dashboard-section.sim-guide-visible .main-content{margin-left:370px;width:auto;min-width:0}",
      ".sim-highlight{outline:3px solid #f59e0b!important;outline-offset:3px!important;position:relative!important;z-index:10004!important;box-shadow:0 0 0 8px #f59e0b22!important;scroll-margin-top:85px}",
      ".sim-guide-arrow{display:inline-flex;align-items:center;gap:7px;color:#92400e;background:#fef3c7;border-radius:9px;padding:7px 10px;margin-bottom:12px;font-size:13px;font-weight:700}",
      "button[onclick=\"toggleFullScreen()\"]{display:none!important}",
      "@media(max-width:1100px){#sim-guide{top:auto;left:12px;right:auto;bottom:76px;width:min(340px,calc(100vw - 24px));max-height:34vh}#sim-guide-card{max-height:34vh}#dashboard-section.sim-guide-visible .main-content{margin-left:0;width:100%}#sim-launch{bottom:12px;left:12px}}",
      "@media(max-width:600px){#sim-banner{top:62px;left:50%;font-size:10px;max-width:95vw;white-space:normal;text-align:center}#sim-guide{bottom:72px;max-height:31vh}#sim-guide-card{max-height:31vh;padding:14px}#sim-guide-card p{font-size:14px;line-height:1.65}#sim-guide-actions button{padding:9px 11px;font-size:12px}}"
    ].join("");
    document.head.appendChild(style);
    const banner = document.createElement("div");
    banner.id = "sim-banner";
    banner.textContent = "محاكي تعليمي • بيانات تجريبية فقط • لا توجد طباعة أو عمليات حقيقية";
    document.body.appendChild(banner);
    const launcher = document.createElement("button");
    launcher.id = "sim-launch";
    launcher.type = "button";
    launcher.textContent = "▶ ابدأ الشرح";
    launcher.addEventListener("click", () => openLesson(current));
    document.body.appendChild(launcher);
    const guide = document.createElement("div");
    guide.id = "sim-guide";
    guide.setAttribute("role", "dialog");
    guide.setAttribute("aria-modal", "false");
    guide.innerHTML = '<div id="sim-guide-card"><div id="sim-guide-progress"><span></span></div><div id="sim-guide-meta"><span></span><button type="button" class="sub" data-action="close">إخفاء الشرح</button></div><h2></h2><p></p><div class="sim-guide-arrow"><i class="fas fa-location-arrow"></i><span>العنصر المشروح متظلل داخل الشاشة</span></div><div id="sim-guide-actions"><button type="button" class="reset" data-action="reset">إعادة التجربة</button><button type="button" class="sub" data-action="prev">السابق</button><button type="button" class="sub" data-action="open">أرني الإجراء</button><button type="button" class="primary" data-action="next">التالي</button></div><div id="sim-screen-guide"><button type="button" data-action="screen-start">اشرح كل عناصر الشاشة الحالية</button><small>يشمل الشرح الحقول والأزرار الظاهرة، ويتجدد تلقائيًا عند فتح نموذج أو تبويب فرعي.</small><div id="sim-screen-meta"></div><div id="sim-screen-actions"><button type="button" data-action="screen-prev">العنصر السابق</button><button type="button" data-action="screen-next">العنصر التالي</button></div></div></div>';
    document.body.appendChild(guide);
    let current = 0;
    let screenTour = false;
    let screenItems = [];
    let screenIndex = 0;
    let screenViewId = "";
    let screenObserverTimer;
    const screenContext = {
      categories: "تنظيم الأصناف في أقسام يسهل على الكاشير الوصول لها، وربط كل قسم بمحطة التحضير الصحيحة.",
      products: "تعريف الصنف وسعره وقسمه وتوفّره؛ راجع بيانات الصنف قبل إضافته لقائمة البيع.",
      stock: "تسجيل أرصدة الخامات ووحداتها وتكلفتها ومتابعة الوارد والصادر والصلاحية.",
      recipes: "ربط كل منتج بالخامات والكميات التي يستهلكها حتى تنعكس المبيعات على المخزون.",
      staff: "إضافة حسابات الفريق وتحديد الدور والصلاحيات المناسبة لكل موظف.",
      shift: "متابعة الوردية النشطة والنقدية والطلبات والمصروفات ثم مراجعة الأرقام قبل الإغلاق.",
      orders: "متابعة الطلبات وحالات التحضير والتسليم والتعامل مع تفاصيل كل طلب.",
      "manual-pos": "إنشاء فاتورة بيع مباشرة، مراجعة الأصناف والكميات والإجمالي ثم تسجيل طريقة الدفع.",
      tables: "إدارة الطاولات وربط الطلب بالطاولة ومتابعة حالتها حتى إغلاق الحساب.",
      delivery: "تسجيل طلبات التوصيل وبيانات العميل والمندوب والتحصيل.",
      talabat: "مراجعة طلبات القنوات الخارجية ومطابقة مبالغها وعمولاتها.",
      bulk: "إعداد فاتورة بيع بالجملة ومراجعة الأصناف والكميات والأسعار قبل التأكيد.",
      expenses: "تسجيل مصروفات التشغيل ومراجعة أثرها على حسابات الوردية.",
      history: "مراجعة الفواتير المسجلة وحالاتها وطرق الدفع.",
      hr: "متابعة ملفات الموظفين والرواتب والحضور والسلف والخصومات.",
      "attendance-log": "مراجعة سجلات الحضور والانصراف حسب الموظف والتاريخ.",
      reports: "اختيار نطاق التقرير ومراجعة مؤشرات الأداء قبل التصدير.",
      devices: "مراجعة إعدادات الاتصال والطابعات والأجهزة؛ لا يتصل المحاكي بأجهزة حقيقية.",
      settings: "ضبط تفضيلات المطعم والضرائب والطباعة وطرق الدفع قبل حفظها.",
      design: "تخصيص واجهة المنيو الإلكتروني ومراجعة شكلها قبل النشر.",
      "paper-menu": "اختيار قالب المنيو الورقي وترتيب محتواه ثم معاينته أو تصديره.",
      playstation: "متابعة الأجهزة والجلسات والأسعار وتسجيل بدء الجلسة وانتهائها.",
      "match-tickets": "إدارة بيانات المباراة والتذاكر ومراجعة العدد والتحصيل.",
      appearance: "تخصيص مظهر لوحة الإدارة وترتيبها على هذا الجهاز.",
      "switch-account": "اختيار حساب محفوظ للتبديل؛ لا تدخل بيانات حقيقية في المحاكي."
    };
    const actionHelp = [
      [/حفظ|تأكيد|اعتماد|إنشاء|إضافة|تسجيل|بدء|فتح/, "راجع الحقول والقيم أولًا، ثم استخدم هذا الزر لتسجيل الإجراء في بيانات المحاكي التجريبية."],
      [/حذف|إزالة|مسح|إلغاء الطلب/, "استخدمه لإزالة السجل المحدد. راجع الاسم أو الرقم جيدًا قبل التأكيد؛ بيانات المحاكي فقط هي التي تتأثر."],
      [/تعديل|تحرير|تحديث البيانات/, "يفتح أو يحفظ تعديلات السجل المحدد. راجع القيم الجديدة قبل اعتمادها."],
      [/بحث|فلتر|تصفية|عرض التقرير/, "طبّق البحث أو المرشحات المختارة لعرض السجلات المطابقة. تحقق من الفترة أو معيار البحث."],
      [/طباعة|معاينة/, "يعرض معاينة تجريبية للمستند؛ لا يرسل المحاكي مهمة إلى طابعة حقيقية."],
      [/تصدير|Excel|PDF|تحميل/, "يجهز نسخة قابلة للتصدير من البيانات الظاهرة. راجع الفترة والمحتوى قبل التنزيل."],
      [/استيراد|رفع ملف/, "يحمّل بيانات من ملف. تأكد من اختيار الملف والقالب الصحيحين قبل المتابعة."],
      [/تحديث|إعادة تحميل/, "يعيد تحميل بيانات هذا القسم من حالة المحاكي الحالية."],
      [/إغلاق|تقفيل|إنهاء الوردية/, "ابدأ الإغلاق بعد مراجعة المبيعات والمدفوعات والمصروفات ومطابقة النقدية الفعلية."],
      [/التالي|السابق|رجوع|إغلاق|إلغاء/, "ينقلك للخطوة أو الشاشة المناسبة من دون تسجيل عملية بيع أو تغيير بيانات بمفرده."]
    ];
    const specificActionHelp = [
      [/openStockModal|تسجيل خامة|إضافة خامة/, "يفتح نموذج الخامة. أدخل اسمًا واضحًا، ووحدة قياس ثابتة، والرصيد والتكلفة وحد التنبيه؛ لا تخلط بين الكيلو والجرام أو اللتر والملليلتر."],
      [/adjustStock|جرد/, "سجّل الكمية الفعلية التي تم عدّها، وحدد هل الحركة استلام أو هالك أو تسوية، ثم راجع سبب الفرق والرصيد الجديد."],
      [/open.*Recipe|recipe|وصفة|مقادير/, "اختَر المنتج ثم أضف كل خامة والكمية المستهلكة في الحصة الواحدة. راجع وحدات القياس؛ هذه المقادير هي أساس خصم المخزون عند البيع."],
      [/startShift|بدء وردية/, "ابدأ الوردية بعد عدّ النقدية الموجودة في الدرج. أدخل رصيد الافتتاح الفعلي، ثم راجعه قبل بدء البيع."],
      [/endShift|تقفيل|إغلاق وردية/, "قبل الإغلاق، طابق النقدية الفعلية مع المتوقع وراجع المدفوعات الإلكترونية والمصروفات والطلبات غير المكتملة."],
      [/add.*Order|create.*Order|manual-pos|تأكيد البيع|إنشاء فاتورة/, "راجع الأصناف والكميات والأسعار والخصم وطريقة الدفع. بعد التأكيد تسجّل الفاتورة تجريبيًا وقد تُخصم مقادير الوصفة من المخزون."],
      [/delete|حذف/, "تحقق من السجل المحدد قبل حذفه. الحذف في المحاكي يؤثر على بيانات التجربة المحفوظة في هذا المتصفح فقط."]
    ];
    const fieldHelp = [
      [/اسم الخامة/, "اكتب اسمًا مميزًا للخامة كما تظهر في الفواتير، مثل لحم البرجر أو زيت القلي، لتسهيل اختيارها في الوصفات."],
      [/الوحدة/, "اختر وحدة شراء ومتابعة ثابتة للخامة. وحّد القياس بين الرصيد والوصفة، ولا تسجل نفس الخامة مرة بالكيلو ومرة بالجرام من غير تحويل."],
      [/الكمية|الرصيد الحالي|رصيد الافتتاح|العهدة/, "أدخل الكمية أو الرصيد الفعلي وقت التسجيل، وليس تقديرًا. راجع الوحدة الظاهرة بجوار الحقل."],
      [/التكلفة|سعر الشراء|سعر الوحدة/, "أدخل تكلفة وحدة القياس المحددة للخامة، لا تكلفة كمية الفاتورة كلها، حتى تكون تكلفة الاستهلاك والتقارير منطقية."],
      [/حد التنبيه|الحد الأدنى/, "حدّد أقل رصيد تريد التنبيه عنده. اجعله مناسبًا لمعدل الاستهلاك ومدة توريد الخامة."],
      [/الصلاحية|تاريخ الانتهاء/, "أدخل تاريخ الصلاحية الصحيح من العبوة أو فاتورة المورد؛ استخدمه لمراجعة التشغيلات القريبة من الانتهاء."],
      [/اسم القسم/, "اكتب اسمًا قصيرًا واضحًا يظهر للكاشير، ثم اربطه بمحطة التحضير التي تستقبل الطلب."],
      [/اسم المنتج|اسم الصنف/, "اكتب الاسم الذي سيظهر للعميل والكاشير، ثم اختر القسم والسعر وحالة التوفر."],
      [/محطة التجهيز|محطة التحضير/, "اختر المحطة التي ستجهز الصنف، مثل المطبخ أو المشروبات، حتى يصل الطلب للمكان الصحيح."],
      [/رقم الهاتف|الهاتف|الموبايل/, "أدخل رقم التواصل بالصيغة الصحيحة، وراجعه قبل حفظ ملف الموظف أو العميل أو الطلب."],
      [/الدور|الصلاحية/, "اختر دور المستخدم حسب مسؤولياته الفعلية. امنح أقل صلاحيات تكفيه لإنجاز عمله."],
      [/الملاحظات|البيان|الوصف/, "اكتب سببًا أو تفاصيل واضحة تساعد في فهم العملية ومراجعتها لاحقًا، خصوصًا للمصروفات والتسويات."],
      [/الخصم/, "أدخل الخصم المصرح به فقط، وتأكد هل القيمة مبلغ أم نسبة قبل اعتماده."],
      [/طريقة الدفع|الدفع/, "اختر وسيلة التحصيل التي استُخدمت فعلًا حتى يظهر توزيع النقدية والمدفوعات الإلكترونية صحيحًا."]
    ];
    function visible(element) {
      if (!element || !element.isConnected || element.disabled || element.type === "hidden") return false;
      if (element.closest("#sim-guide, #sim-banner, #sim-launch")) return false;
      const style = window.getComputedStyle(element);
      return style.display !== "none" && style.visibility !== "hidden" && element.getClientRects().length > 0;
    }
    function activeView() {
      return document.querySelector('[id^="view-"]:not(.hidden)');
    }
    function getScreenViewId() {
      const view = activeView();
      return view ? view.id : "";
    }
    function collectScreenItems() {
      const view = activeView();
      const roots = [];
      if (view) roots.push(view);
      document.querySelectorAll(".swal2-popup, .modal.show, [role='dialog']:not(#sim-guide)").forEach((dialog) => {
        if (visible(dialog)) roots.push(dialog);
      });
      const selector = "input:not([type='hidden']), select, textarea, button, a[href], [role='button'], [onclick], label[for]";
      const items = [];
      roots.forEach((root) => root.querySelectorAll(selector).forEach((element) => {
        if (!visible(element)) return;
        if (element.tagName === "LABEL") {
          const field = document.getElementById(element.htmlFor);
          if (!field || field.type !== "file") return;
        }
        if (element.matches("[onclick]") && element.querySelector(selector)) return;
        if (!items.includes(element)) items.push(element);
      }));
      return items;
    }
    function controlName(element) {
      if (element.tagName === "LABEL") return element.innerText.trim();
      const labelledBy = element.getAttribute("aria-labelledby");
      const ariaLabel = element.getAttribute("aria-label");
      const associatedLabel = element.labels && element.labels.length ? element.labels[0] : null;
      let parent = element.parentElement;
      let parentLabel = null;
      for (let depth = 0; parent && depth < 4 && !parentLabel; depth++, parent = parent.parentElement) {
        parentLabel = parent.querySelector(":scope > label, :scope > div > label");
      }
      const ownText = (element.innerText || element.value || "").replace(/[\uE000-\uF8FF]/g, "").trim();
      const derivedId = element.id ? element.id.replace(/[-_]/g, " ") : "";
      const clickHandler = element.getAttribute("onclick") || "";
      const handlerName = clickHandler.match(/^\s*([a-zA-Z_$][\w$]*)\s*\(/);
      const icon = element.querySelector("i, svg");
      const iconClasses = icon ? icon.className.baseVal || icon.className : "";
      const iconName = /trash|delete|remove/i.test(iconClasses) ? "حذف السجل" :
        /edit|pen/i.test(iconClasses) ? "تعديل السجل" :
        /eye|view/i.test(iconClasses) ? "عرض التفاصيل" :
        /plus|add/i.test(iconClasses) ? "إضافة سجل" :
        /print/i.test(iconClasses) ? "طباعة أو معاينة" : "";
      const handlerLabels = {
        editStockItem: "تعديل بيانات الخامة", adjustStock: "تسوية أو جرد الخامة",
        deleteStockItem: "حذف الخامة", editProduct: "تعديل بيانات المنتج",
        deleteProduct: "حذف المنتج", editCategory: "تعديل القسم",
        deleteCategory: "حذف القسم", endShift: "تقفيل الوردية",
        startShift: "بدء وردية جديدة", printStockLogThermal: "طباعة سجل حركة المخزن",
        exportStockReportExcel: "تصدير تقرير المخزن إلى Excel"
      };
      return (ariaLabel || (associatedLabel && associatedLabel.innerText) || (parentLabel && parentLabel.innerText) ||
        (labelledBy && document.getElementById(labelledBy)?.innerText) || element.getAttribute("title") ||
        element.getAttribute("placeholder") || ownText || handlerLabels[handlerName && handlerName[1]] ||
        iconName || element.name || derivedId).trim().replace(/\s+/g, " ").slice(0, 100) || "هذا العنصر";
    }
    function describeControl(element) {
      const name = controlName(element);
      const type = (element.type || element.tagName).toLowerCase();
      const view = activeView();
      const section = view && view.querySelector("h2, h3, h4");
      const sectionName = section ? section.innerText.trim() : "القسم الحالي";
      const context = screenContext[view && view.id.replace("view-", "")] || "إدارة البيانات ومراجعة الإجراء قبل حفظه.";
      const hint = element.getAttribute("data-sim-help");
      if (hint) return hint;
      if (element.tagName === "BUTTON" || element.getAttribute("role") === "button" || element.hasAttribute("onclick")) {
        const label = name;
        const action = element.getAttribute("onclick") || "";
        const specific = specificActionHelp.find(([pattern]) => pattern.test(label + " " + action));
        const match = actionHelp.find(([pattern]) => pattern.test(label));
        return "في شاشة " + sectionName + "، زر «" + label + "»: " +
          (specific ? specific[1] : match ? match[1] : "نفّذ الإجراء المرتبط بالسجل أو الخيار المحدد. راجع البيانات الظاهرة قبل المتابعة.") +
          " " + context;
      }
      if (element.tagName === "SELECT") return "في شاشة " + sectionName + "، اختَر «" + name + "» من القائمة. راجع الاختيار لأنه يحدد طريقة تصنيف السجل أو الحساب الذي ستطبّق عليه العملية. " + context;
      if (type === "checkbox" || type === "radio") return "في شاشة " + sectionName + "، فعّل أو ألغِ «" + name + "» حسب الإعداد المطلوب. راجع أثر الخيار قبل حفظ النموذج. " + context;
      if (type === "file" || element.tagName === "LABEL") return "استخدم «" + name + "» لاختيار ملف أو صورة عند الحاجة. تأكد من اختيار الملف الصحيح، ثم راجع المعاينة قبل حفظ التغيير. " + context;
      if (type === "date" || type === "datetime-local" || type === "time") return "حدّد «" + name + "» بالتاريخ أو الوقت المطلوب. عند إعداد تقرير، تأكد من أن بداية الفترة ونهايتها صحيحتان قبل عرض النتائج. " + context;
      const field = fieldHelp.find(([pattern]) => pattern.test(name));
      if (field) return "في شاشة " + sectionName + "، «" + name + "»: " + field[1] + " " + context;
      if (type === "number" || type === "range") return "أدخل قيمة «" + name + "» رقمًا، وتأكد من الوحدة والكمية أو المبلغ المطلوب. راجع الإجمالي قبل التأكيد. " + context;
      if (element.tagName === "TEXTAREA") return "اكتب في «" + name + "» الملاحظات أو التفاصيل التي يحتاجها الموظف التالي لفهم العملية. اجعل الوصف واضحًا ومختصرًا. " + context;
      if (element.tagName === "INPUT") return "أدخل «" + name + "» في هذا الحقل. استخدم الاسم أو الرقم الصحيح، وتحقق من القيمة قبل حفظ النموذج. " + context;
      return "راجع «" + name + "» في شاشة " + sectionName + ". " + context;
    }
    function showScreenStep(index, scroll) {
      if (!screenItems.length) {
        const view = activeView();
        const section = view && view.querySelector("h2, h3, h4");
        const viewName = view ? view.id.replace("view-", "") : "";
        const title = section ? section.innerText.trim() : "محتوى الشاشة";
        const content = view ? view.innerText.replace(/\s+/g, " ").trim().slice(0, 260) : "";
        guide.querySelector("#sim-screen-meta").textContent = "شرح محتوى الشاشة • لا توجد عناصر تفاعلية متاحة الآن";
        guide.querySelector("#sim-guide-meta span").textContent = "شرح الشاشة";
        guide.querySelector("#sim-guide-card h2").textContent = title;
        guide.querySelector("#sim-guide-card p").textContent =
          (screenContext[viewName] || "تعرض الشاشة معلومات القسم وحالته الحالية.") +
          (content && content !== title ? " الحالة الظاهرة الآن: " + content : "");
        guide.querySelector("#sim-guide-progress span").style.width = "100%";
        guide.querySelector("#sim-screen-actions").classList.remove("active");
        document.querySelectorAll(".sim-highlight").forEach((node) => node.classList.remove("sim-highlight"));
        return;
      }
      screenIndex = Math.max(0, Math.min(screenItems.length - 1, index));
      const element = screenItems[screenIndex];
      guide.querySelector("#sim-screen-meta").textContent = "شرح العنصر " + (screenIndex + 1) + " من " + screenItems.length + " • " + controlName(element);
      guide.querySelector("#sim-guide-meta span").textContent = "شرح الشاشة • " + (screenIndex + 1) + " / " + screenItems.length;
      guide.querySelector("#sim-guide-card h2").textContent = controlName(element);
      guide.querySelector("#sim-guide-card p").textContent = describeControl(element);
      guide.querySelector("#sim-guide-progress span").style.width = ((screenIndex + 1) / screenItems.length * 100) + "%";
      guide.querySelector("#sim-screen-actions").classList.add("active");
      guide.querySelector('[data-action="screen-prev"]').disabled = screenIndex === 0;
      guide.querySelector('[data-action="screen-next"]').textContent = screenIndex === screenItems.length - 1 ? "إنهاء شرح الشاشة" : "العنصر التالي";
      document.querySelectorAll(".sim-highlight").forEach((node) => node.classList.remove("sim-highlight"));
      element.classList.add("sim-highlight");
      if (scroll) element.scrollIntoView({ behavior: "smooth", block: "center" });
    }
    function refreshScreenItems(preferDialog) {
      const previous = screenItems[screenIndex];
      const nextViewId = getScreenViewId();
      screenItems = collectScreenItems();
      if (screenViewId && nextViewId !== screenViewId) {
        screenIndex = 0;
      } else if (preferDialog) {
        const dialog = document.querySelector(".swal2-popup, .modal.show, [role='dialog']:not(#sim-guide)");
        const firstDialogItem = dialog && screenItems.findIndex((element) => dialog.contains(element));
        if (firstDialogItem >= 0) screenIndex = firstDialogItem;
      } else {
        const previousIndex = previous && screenItems.indexOf(previous);
        if (previousIndex >= 0) screenIndex = previousIndex;
        else screenIndex = Math.min(screenIndex, Math.max(0, screenItems.length - 1));
      }
      screenViewId = nextViewId;
      if (screenTour) showScreenStep(screenIndex, false);
    }
    function startScreenTour() {
      screenTour = true;
      guide.querySelector('[data-action="screen-start"]').textContent = "إنهاء شرح الشاشة";
      screenViewId = getScreenViewId();
      refreshScreenItems(false);
      if (!screenItems.length) {
        showScreenStep(0, false);
        return;
      }
      guide.classList.add("open");
      document.getElementById("dashboard-section").classList.add("sim-guide-visible");
      showScreenStep(0, true);
    }
    const originalSwitchView = window.switchView;
    if (typeof originalSwitchView === "function") {
      window.switchView = function (...args) {
        const result = originalSwitchView.apply(this, args);
        if (screenTour) {
          clearTimeout(screenObserverTimer);
          screenObserverTimer = setTimeout(() => refreshScreenItems(false), 180);
        }
        return result;
      };
    }
    const screenObserver = new MutationObserver(() => {
      if (!screenTour) return;
      clearTimeout(screenObserverTimer);
      screenObserverTimer = setTimeout(() => refreshScreenItems(true), 250);
    });
    screenObserver.observe(document.body, { childList: true, subtree: true });
    document.addEventListener("focusin", (event) => {
      if (!screenTour) return;
      const element = event.target.closest("input, select, textarea, button, a[href], [role='button'], [onclick]");
      const index = element && screenItems.indexOf(element);
      if (index >= 0) showScreenStep(index, false);
    });
    document.addEventListener("click", (event) => {
      if (!screenTour || guide.contains(event.target)) return;
      const element = event.target.closest("input, select, textarea, button, a[href], [role='button'], [onclick], label[for]");
      const index = element && screenItems.indexOf(element);
      if (index >= 0) showScreenStep(index, false);
      clearTimeout(screenObserverTimer);
      screenObserverTimer = setTimeout(() => refreshScreenItems(true), 350);
    });
    function render(index) {
      screenTour = false;
      guide.querySelector('[data-action="screen-start"]').textContent = "اشرح كل عناصر الشاشة الحالية";
      guide.querySelector("#sim-screen-actions").classList.remove("active");
      current = Math.max(0, Math.min(lessons.length - 1, index));
      const lesson = lessons[current];
      if (lesson.action === "openChangePasswordDialog") {
        lesson.view = "settings";
      }
      if (typeof window.switchView === "function") window.switchView(lesson.view);
      guide.querySelector("#sim-guide-meta span").textContent = "الخطوة " + (current + 1) + " من " + lessons.length;
      guide.querySelector("#sim-guide-card h2").textContent = lesson.title;
      guide.querySelector("#sim-guide-card p").textContent = lesson.text;
      guide.querySelector("#sim-guide-progress span").style.width = ((current + 1) / lessons.length * 100) + "%";
      guide.querySelector('[data-action="prev"]').disabled = current === 0;
      guide.querySelector('[data-action="next"]').textContent = current === lessons.length - 1 ? "إنهاء الجولة" : "التالي";
      document.querySelectorAll(".sim-highlight").forEach((node) => node.classList.remove("sim-highlight"));
      const nav = document.getElementById(lesson.nav || "nav-" + lesson.view);
      if (nav) nav.classList.add("sim-highlight");
      const target = document.querySelector(lesson.target || "#view-" + lesson.view);
      if (target) {
        target.classList.add("sim-highlight");
        target.scrollIntoView({ behavior: "smooth", block: "start" });
      } else if (nav) {
        nav.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }
      document.getElementById("dashboard-section").classList.add("sim-guide-visible");
    }
    function openLesson(index) {
      render(index);
      guide.classList.add("open");
      launcher.textContent = "استكمل الشرح";
    }
    guide.addEventListener("click", (event) => {
      const actionButton = event.target.closest && event.target.closest("[data-action]");
      const action = actionButton && actionButton.dataset.action;
      if (!action) return;
      if (action === "screen-start") {
        if (screenTour) {
          screenTour = false;
          guide.querySelector("#sim-screen-actions").classList.remove("active");
          render(current);
        } else startScreenTour();
        return;
      }
      if (action === "screen-prev" || action === "screen-next") {
        if (action === "screen-next" && screenIndex === screenItems.length - 1) {
          screenTour = false;
          guide.querySelector('[data-action="screen-start"]').textContent = "اشرح كل عناصر الشاشة الحالية";
          guide.querySelector("#sim-screen-actions").classList.remove("active");
          document.querySelectorAll(".sim-highlight").forEach((node) => node.classList.remove("sim-highlight"));
          guide.querySelector("#sim-screen-meta").textContent = "انتهى شرح عناصر الشاشة. افتح نموذجًا أو قسمًا فرعيًا لعرض عناصره وشرحها.";
        } else showScreenStep(screenIndex + (action === "screen-next" ? 1 : -1), true);
        return;
      }
      if (action === "close") {
        screenTour = false;
        guide.querySelector('[data-action="screen-start"]').textContent = "اشرح كل عناصر الشاشة الحالية";
        guide.classList.remove("open");
        document.getElementById("dashboard-section").classList.remove("sim-guide-visible");
        document.querySelectorAll(".sim-highlight").forEach((node) => node.classList.remove("sim-highlight"));
      }
      if (action === "prev") render(current - 1);
      if (action === "next") {
        if (current === lessons.length - 1) {
          guide.classList.remove("open");
          document.getElementById("dashboard-section").classList.remove("sim-guide-visible");
          document.querySelectorAll(".sim-highlight").forEach((node) => node.classList.remove("sim-highlight"));
          showNotice("أحسنت! انتهت الجولة التعليمية. يمكنك فتح أي قسم ومتابعة التجربة.", "success");
        }
        else render(current + 1);
      }
      if (action === "open") {
        const lesson = lessons[current];
        if (lesson.action && typeof window[lesson.action] === "function") window[lesson.action]();
        else if (typeof window.switchView === "function") window.switchView(lesson.view);
        else showNotice("انتظر لحظات حتى تكتمل تهيئة النظام.", "info");
      }
      if (action === "reset") {
        if (window.confirm("سيتم إعادة بيانات المحاكي التجريبية إلى حالتها الأولى. هل تريد المتابعة؟")) {
          localStorage.removeItem(STORAGE_KEY);
          state = freshState();
          save();
          window.location.reload();
        }
      }
    });
    openLesson(0);
  }

  document.addEventListener("DOMContentLoaded", installGuide, { once: true });
})();
