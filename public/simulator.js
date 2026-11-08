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

    if (parts[2] === "users" && parts[3] === "login") {
      return response(ok({ token: TOKEN, user: { _id: "sim-user", name: "مدير المطعم", role: "owner" } }));
    }
    if (parts[2] === "users" && parts[3] === "changeMyPassword" && method === "POST") {
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
    { view: "categories", title: "ابدأ بتقسيم المنيو", text: "الأقسام هي طريقة ترتيب المنتجات أمام الكاشير والعميل. أنشئ أقسامًا واضحة مثل البرجر والمشروبات، وحدد محطة التحضير لكل قسم حتى يصل الطلب للمكان الصحيح." },
    { view: "products", title: "أضف المنتجات وأسعارها", text: "أضف اسم المنتج وسعر البيع واربطه بالقسم. حدّد التوفر ومحطة التحضير، ثم أضف المقادير من شاشة الوصفات ليتابع النظام تكلفة المنتج واستهلاك المخزون." },
    { view: "stock", title: "سجّل الخامات ووحداتها", text: "في المخزن سجّل كل خامة بوحدة شراء ثابتة، مثل كيلو أو لتر أو قطعة، مع الكمية الحالية وتكلفة الوحدة وحد التنبيه. أدخل تاريخ الصلاحية عند توفره حتى تظهر تنبيهات التشغيلات القريبة من الانتهاء." },
    { view: "stock", title: "استلام فاتورة المورد", text: "بعد إنشاء الخامة، استخدم إضافة رصيد لتسجيل الكمية المستلمة وتاريخ صلاحيتها. كل استلام يظهر كتشغيلة منفصلة، وتُخصم الكميات من الأقدم صلاحية أولًا لتقليل الهدر." },
    { view: "stock", title: "التسويات والهالك والجرد", text: "سجّل الهالك والتسوية بسبب الكسر أو فرق الجرد مع السبب والكمية. راجع سجل حركة المخزون بعد كل تعديل، ونفّذ الجرد المفاجئ بمقارنة الرصيد الفعلي مع المسجل قبل اعتماد الفرق." },
    { view: "shift", nav: "nav-surprise-inventory", action: "printSurpriseInventory", title: "الجرد المفاجئ للمخزون", text: "ابدأ جردًا مفاجئًا لمقارنة كميات الخامات الفعلية بما هو مسجل. راجع الفروقات صنفًا بصنف، وحدد سبب النقص أو الزيادة قبل اعتماد أي تسوية؛ لا تستخدم الجرد بدل تسجيل الاستلام أو الهالك." },
    { view: "recipes", title: "اربط وصفة المنتج بالخامات", text: "افتح الوصفات وحدد المنتج ثم الخامة والكمية التي يستهلكها كل طبق. مثال: برجر كلاسيك يستهلك 150 جرام لحم وقطعة خبز. البيع بعد ذلك يخفض الرصيد تلقائيًا بحسب الوصفة والكمية المباعة." },
    { view: "staff", title: "جهّز الموظفين والصلاحيات", text: "أضف حسابات العاملين وحدد الدور المناسب: مالك، مدير، كاشير، كابتن أو مطبخ. امنح أقل صلاحية لازمة لكل مستخدم، وراجع أن إجراءات الأسعار والمخزون والإغلاق مقصورة على المخولين." },
    { view: "shift", title: "افتح الوردية وسجّل العهدة", text: "قبل استقبال الطلبات افتح وردية جديدة وسجّل النقدية الافتتاحية الموجودة في الدرج. الوردية تربط الطلبات والمصروفات والحركات بالفترة والموظف والجهاز، فلا تبدأ بيعًا قبل فتحها." },
    { view: "orders", title: "تابع طلبات الصالة والمطبخ", text: "شاشة الطلبات تعرض الحالات من جديد إلى التحضير ثم الجاهز والتسليم. راجع الملاحظات والإضافات، وأرسل كل صنف لمحطة التحضير المحددة في إعداد القسم." },
    { view: "manual-pos", title: "أنشئ فاتورة كاشير", text: "في البيع المباشر اختر المنتجات والكميات، واختر تيك أواي أو طاولة، ثم راجع الإجمالي والضرائب والخدمة والخصم قبل التأكيد. الطباعة في هذا المحاكي معاينة فقط ولا ترسل لأي طابعة." },
    { view: "tables", title: "إدارة الطاولات", text: "افتح طاولة للعميل وسجل الطلب عليها، ثم تابع حالتها حتى طلب الحساب والدفع. يمكنك من الشاشة الحقيقية نقل الطلب أو دمج الحسابات وفق صلاحيات المستخدم." },
    { view: "delivery", title: "طلبات الدليفري", text: "سجل بيانات العميل والعنوان ورقم الهاتف ومندوب التوصيل، وتابع حالة الطلب والتحصيل. راجع طريقة الدفع والعمولة وأي مديونية للمندوب عند التسوية." },
    { view: "talabat", title: "قنوات الطلبات الخارجية", text: "تابع طلبات منصات التوصيل ومطابقة إجمالي الطلب والعمولة والتحصيل. لا تعتمد التسوية قبل مطابقة كشف المنصة مع الطلبات المسجلة." },
    { view: "bulk", title: "البيع بالجملة", text: "استخدم البيع بالجملة لإدخال مجموعة أصناف وكمياتها في فاتورة واحدة، ثم راجع الإجمالي والخصم وبيانات العميل قبل الحفظ." },
    { view: "coupons", title: "الكوبونات والعروض", text: "أنشئ كوبونًا برمز واضح، وحدد نوع الخصم وقيمته وفترة الصلاحية والحدود المسموحة. اختبر شروطه على فاتورة تدريبية قبل نشره للعملاء." },
    { view: "expenses", title: "سجّل مصروفات الوردية", text: "سجّل المصروف فور حدوثه مع التصنيف والقيمة والبيان. المصروفات تقلل النقدية المتوقعة عند الجرد؛ لا تسجل مشتريات الخامات كاستهلاك، بل أدخلها كاستلام مخزون لتبقى الكمية والتكلفة دقيقة." },
    { view: "history", title: "راجع البيع والفواتير", text: "سجل المبيعات يعرض الفواتير وحالة الدفع وطريقة التحصيل. راجع المرتجعات والإلغاءات والخصومات قبل الإغلاق، لأن أي تصحيح يجب أن يكون موثقًا ومسموحًا للمستخدم." },
    { view: "hr", title: "الحضور والموارد البشرية", text: "سجل حضور وانصراف الموظفين وراجع ساعات العمل والجزاءات والسلف والرواتب. استخدم الملخصات للتأكد من اكتمال سجلات الفريق قبل اعتماد المستحقات." },
    { view: "reports", title: "حلّل أداء اليوم", text: "التقارير تلخص المبيعات حسب المنتج والقسم ومحطة التحضير وطريقة الدفع والموظف. قارن الفترة نفسها، وتأكد من اختيار التاريخ الصحيح قبل الطباعة أو التصدير." },
    { view: "devices", title: "الأجهزة والطابعات", text: "راجع الأجهزة المتصلة وتسمياتها ومحطات التحضير والطابعات المعروفة. الاختبار والاكتشاف في النسخة الفعلية يحتاجان شبكة محلية؛ في هذا المحاكي لن يتم الاتصال بأي جهاز." },
    { view: "shift", title: "جرد الدرج قبل الإغلاق", text: "عدّ النقدية الفعلية وسجلها، ثم قارنها بالنقدية المتوقعة بعد المبيعات والمصروفات والعهدة. راجع المدفوعات الإلكترونية والطلبات المعلقة، ولا تخلطها مع نقدية الدرج." },
    { view: "shift", title: "أغلق الوردية واحفظ ملخصها", text: "بعد المطابقة أغلق الوردية من شاشة الشيفت. راجع إجمالي المبيعات، النقدي والبطاقات، المصروفات، الفرق بين المتوقع والفعلي، وعدد الطلبات. سيُحفظ سجل الإغلاق للمراجعة والتقارير." },
    { view: "shift-history", title: "ارجع لسجل الورديات", text: "سجل الورديات يتيح مراجعة الورديات المغلقة وملخصاتها. استخدمه لمراجعة الفروقات والأرقام، ولا تعد فتح أو تعديل وردية إلا وفق إجراء إداري موثق." },
    { view: "settings", title: "اضبط إعدادات المطعم والطباعة", text: "راجع الضرائب والخدمة وأرقام الطاولات وطرق الدفع وإعدادات الفاتورة. عرّف الطابعات ومحطات التحضير في النظام الفعلي؛ في المحاكي لا يتم إرسال أوامر طباعة حقيقية." },
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
    const style = document.createElement("style");
    style.textContent = [
      "#sim-banner{position:fixed;z-index:10001;top:10px;left:50%;transform:translateX(-50%);background:#172554;color:#fff;padding:8px 16px;border-radius:999px;font:700 13px/1.5 Arial,sans-serif;box-shadow:0 6px 24px #0f172a55;white-space:nowrap}",
      "#sim-launch{position:fixed;z-index:10002;bottom:22px;left:22px;border:0;border-radius:50px;padding:13px 18px;background:#4338ca;color:#fff;font:700 15px Arial,sans-serif;box-shadow:0 8px 25px #4338ca66;cursor:pointer}",
      "#sim-guide{position:fixed;z-index:10003;inset:0;background:#0f172a88;display:none;align-items:center;justify-content:center;padding:18px;font-family:Arial,sans-serif}",
      "#sim-guide.open{display:flex}#sim-guide-card{background:#fff;color:#1e293b;width:min(560px,100%);border-radius:20px;padding:24px;box-shadow:0 25px 80px #0005;text-align:right}",
      "#sim-guide-card h2{margin:8px 0 12px;font-size:23px;color:#312e81}#sim-guide-card p{font-size:16px;line-height:1.9;margin:0 0 16px}",
      "#sim-guide-progress{height:7px;background:#e2e8f0;border-radius:8px;overflow:hidden}#sim-guide-progress span{display:block;height:100%;background:#4f46e5;transition:width .2s}",
      "#sim-guide-meta{display:flex;justify-content:space-between;align-items:center;color:#64748b;font-size:13px;margin:12px 0}",
      "#sim-guide-actions{display:flex;gap:8px;flex-wrap:wrap}#sim-guide-actions button{border:0;border-radius:10px;padding:11px 15px;font-weight:700;cursor:pointer}",
      "#sim-guide-actions .primary{background:#4338ca;color:white;margin-inline-start:auto}#sim-guide-actions .sub{background:#eef2ff;color:#3730a3}#sim-guide-actions .reset{background:#fff1f2;color:#be123c}",
      ".sim-highlight{outline:4px solid #f59e0b!important;outline-offset:3px!important;position:relative;z-index:10004!important;filter:drop-shadow(0 0 10px #f59e0b88)}",
      "@media(max-width:600px){#sim-banner{top:auto;bottom:82px;font-size:11px}#sim-launch{bottom:15px;left:12px}#sim-guide-card{padding:18px}}"
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
    guide.setAttribute("aria-modal", "true");
    guide.innerHTML = '<div id="sim-guide-card"><div id="sim-guide-progress"><span></span></div><div id="sim-guide-meta"><span></span><button type="button" class="sub" data-action="close">إغلاق الشرح</button></div><h2></h2><p></p><div id="sim-guide-actions"><button type="button" class="reset" data-action="reset">إعادة بيانات التجربة</button><button type="button" class="sub" data-action="prev">السابق</button><button type="button" class="sub" data-action="open">افتح الشاشة</button><button type="button" class="primary" data-action="next">التالي</button></div></div>';
    document.body.appendChild(guide);
    let current = 0;
    function render(index) {
      current = Math.max(0, Math.min(lessons.length - 1, index));
      const lesson = lessons[current];
      guide.querySelector("#sim-guide-meta span").textContent = "الخطوة " + (current + 1) + " من " + lessons.length;
      guide.querySelector("#sim-guide-card h2").textContent = lesson.title;
      guide.querySelector("#sim-guide-card p").textContent = lesson.text;
      guide.querySelector("#sim-guide-progress span").style.width = ((current + 1) / lessons.length * 100) + "%";
      guide.querySelector('[data-action="prev"]').disabled = current === 0;
      guide.querySelector('[data-action="next"]').textContent = current === lessons.length - 1 ? "إنهاء الجولة" : "التالي";
      document.querySelectorAll(".sim-highlight").forEach((node) => node.classList.remove("sim-highlight"));
      const nav = document.getElementById(lesson.nav || "nav-" + lesson.view);
      if (nav) nav.classList.add("sim-highlight");
    }
    function openLesson(index) {
      render(index);
      guide.classList.add("open");
      launcher.textContent = "استكمل الشرح";
    }
    guide.addEventListener("click", (event) => {
      if (event.target === guide) guide.classList.remove("open");
      const action = event.target && event.target.dataset && event.target.dataset.action;
      if (!action) return;
      if (action === "close") guide.classList.remove("open");
      if (action === "prev") render(current - 1);
      if (action === "next") {
        if (current === lessons.length - 1) { guide.classList.remove("open"); showNotice("أحسنت! انتهت الجولة التعليمية. يمكنك فتح أي قسم ومتابعة التجربة.", "success"); }
        else render(current + 1);
      }
      if (action === "open") {
        const lesson = lessons[current];
        if (lesson.action && typeof window[lesson.action] === "function") window[lesson.action]();
        else if (typeof window.switchView === "function") window.switchView(lesson.view);
        else showNotice("انتظر لحظات حتى تكتمل تهيئة النظام.", "info");
        guide.classList.remove("open");
        launcher.textContent = "استكمل الشرح";
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
