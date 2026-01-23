// --- Global Variables ---
let token = new URLSearchParams(window.location.search).get("t") || sessionStorage.getItem("ownerToken");
let restaurantId = null;
let categoriesData = [];
let currentUserRole = "owner";
let socket = null;

// --- Initialization ---
document.addEventListener("DOMContentLoaded", async () => {
    if (!token) {
        window.location.href = "/login";
        return;
    }
    sessionStorage.setItem("ownerToken", token);
    
    // Check Dark Mode
    if (localStorage.getItem("theme") === "dark") {
        document.body.classList.add("dark-mode");
    }

    await initApp();
});

async function initApp() {
    try {
        const res = await fetch("/api/v1/restaurants/my-restaurant", {
            headers: { Authorization: `Bearer ${token}` }
        });
        
        if (res.status === 401) {
            window.location.href = "/login";
            return;
        }

        const data = await res.json();
        if (data.status === "success") {
            const r = data.data.restaurant;
            restaurantId = r._id;
            document.getElementById("restaurant-id").value = r._id;
            document.getElementById("page-title").innerText = r.restaurantName;
            document.getElementById("preview-link").href = `/menu/${r.slug}`;
            
            currentUserRole = data.data.userRole;

            // Load Initial Data
            loadOrders();
            loadCategories(); // Pre-load
            initSocket(r._id);
            setupSettings(r);
        }
    } catch (e) {
        console.error("Init Error", e);
        Swal.fire("خطأ", "فشل الاتصال بالسيرفر", "error");
    }
}

// --- Navigation Logic ---
function switchView(viewName) {
    // 1. إخفاء جميع الأقسام وإضافة hidden لها
    document.querySelectorAll('.view-section').forEach(el => {
        el.classList.remove('active');
        el.classList.add('hidden'); // إجبار الإخفاء
    });
    
    // 2. إظهار القسم المطلوب وإزالة hidden منه
    const target = document.getElementById(`view-${viewName}`);
    if (target) {
        target.classList.remove('hidden'); // هذه هي الخطوة المهمة جداً التي كانت ناقصة
        target.classList.add('active');
    }

    // 3. تحديث البار السفلي (Bottom Nav)
    document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
    
    const navItem = document.getElementById(`nav-${viewName}`);
    if (navItem) {
        navItem.classList.add('active');
    } else {
        // إذا كنا في صفحة فرعية (مثل الإعدادات)، ننشط زر "المزيد"
        const moreBtn = document.getElementById('nav-more');
        if(moreBtn) moreBtn.classList.add('active');
    }

    // 4. تحميل البيانات الخاصة بالصفحة
    if (viewName === 'orders') loadOrders();
    if (viewName === 'products') loadProducts();
    if (viewName === 'categories') loadCategories();
    if (viewName === 'history') loadHistory();
    if (viewName === 'staff') loadStaff();
    if (viewName === 'design') loadThemes();

    // العودة لأعلى الصفحة
    window.scrollTo(0,0);
}
// --- Orders Logic ---
async function loadOrders() {
    const container = document.getElementById("orders-grid");
    container.innerHTML = '<div class="loading-spinner"><i class="fas fa-circle-notch fa-spin"></i></div>';
    
    // Reset Badge
    document.getElementById("live-badge-container").classList.add("hidden");

    try {
        const res = await fetch(`/api/v1/orders/${restaurantId}/active`, {
            headers: { Authorization: `Bearer ${token}` }
        });
        const data = await res.json();
        container.innerHTML = "";

        if (!data.data.orders.length) {
            container.innerHTML = `
                <div style="text-align:center; padding:40px; color:var(--text-muted)">
                    <i class="fas fa-mug-hot fa-3x" style="opacity:0.3; margin-bottom:15px"></i>
                    <p>لا توجد طلبات نشطة حالياً</p>
                </div>
            `;
            return;
        }

        data.data.orders.forEach(order => {
            container.innerHTML += createOrderCard(order);
        });

    } catch (e) {
        container.innerHTML = '<p class="text-center text-danger">خطأ في التحميل</p>';
    }
}

function createOrderCard(order) {
    const time = new Date(order.createdAt).toLocaleTimeString("ar-EG", {hour: '2-digit', minute:'2-digit'});
    const statusClass = `status-${order.status}`;
    
    let statusLabel = "جديد";
    let actionBtn = `<button class="btn-primary" style="width:100%" onclick="updateStatus('${order._id}', 'preparing')">قبول وتجهيز</button>`;
    
    if (order.status === 'preparing') {
        statusLabel = "جاري التجهيز";
        actionBtn = `<button class="btn-primary" style="width:100%; background:var(--success)" onclick="updateStatus('${order._id}', 'completed')">إتمام الطلب</button>`;
    }

    let itemsHtml = order.items.map(i => `
        <div style="display:flex; justify-content:space-between; font-size:14px; border-bottom:1px dashed #eee; padding:5px 0;">
            <span>${i.name} <b>x${i.qty}</b></span>
            <span>${i.price * i.qty}</span>
        </div>
    `).join('');

    return `
        <div class="card order-card ${statusClass}" id="order-${order._id}">
            <div style="display:flex; justify-content:space-between; margin-bottom:10px;">
                <span class="badge" style="background:var(--text); color:white; font-size:14px">#${order.orderNum || String(order._id).slice(-4)}</span>
                <span class="badge badge-${order.status}">${statusLabel}</span>
            </div>
            <div style="font-weight:bold; font-size:16px; margin-bottom:5px;">
                ${order.tableNumber === 0 ? '<i class="fas fa-walking"></i> تيك أواي' : `<i class="fas fa-chair"></i> طاولة ${order.tableNumber}`}
            </div>
            <div style="font-size:12px; color:var(--text-muted); margin-bottom:10px;"><i class="far fa-clock"></i> ${time}</div>
            
            <div style="background:var(--bg); padding:10px; border-radius:8px; margin-bottom:10px;">
                ${itemsHtml}
                <div style="display:flex; justify-content:space-between; margin-top:10px; font-weight:800; color:var(--primary)">
                    <span>الإجمالي</span>
                    <span>${order.totalPrice} ج.م</span>
                </div>
            </div>

            <div style="display:flex; gap:10px;">
                <div style="flex:1">${actionBtn}</div>
                <button class="btn-icon" style="border-color:var(--danger); color:var(--danger)" onclick="updateStatus('${order._id}', 'canceled')"><i class="fas fa-times"></i></button>
            </div>
        </div>
    `;
}

async function updateStatus(id, status) {
    try {
        await fetch(`/api/v1/orders/${id}/status`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ status })
        });
        loadOrders();
    } catch (e) {
        Swal.fire("خطأ", "فشل التحديث", "error");
    }
}

// --- Products Logic ---
async function loadProducts() {
    const list = document.getElementById("products-list");
    list.innerHTML = '<div class="loading-spinner"><i class="fas fa-circle-notch fa-spin"></i></div>';
    
    try {
        const res = await fetch(`/api/v1/products/restaurant/${restaurantId}`, {
            headers: { Authorization: `Bearer ${token}` }
        });
        const data = await res.json();
        const products = data.data.products;
        
        // Populate Filter
        const filter = document.getElementById("p-cat-filter");
        filter.innerHTML = '<option value="all">الكل</option>';
        [...new Set(products.map(p => p.category))].forEach(c => {
            filter.innerHTML += `<option value="${c}">${c}</option>`;
        });

        renderProductsList(products);
        window.allProducts = products; // Cache for search

    } catch (e) {
        console.error(e);
    }
}

function renderProductsList(products) {
    const list = document.getElementById("products-list");
    list.innerHTML = "";
    
    if(!products.length) {
        list.innerHTML = `<div style="text-align:center; padding:20px; color:var(--text-muted)">لا توجد منتجات</div>`;
        return;
    }

    products.forEach(p => {
        const img = p.image || 'https://via.placeholder.com/100?text=No+Img';
        const pData = encodeURIComponent(JSON.stringify(p));
        
        list.innerHTML += `
            <div class="item-card">
                <img src="${img}" class="item-img">
                <div class="item-details">
                    <div class="item-title">${p.name.ar}</div>
                    <div class="item-meta">
                        <span>${p.category}</span>
                        ${p.isAvailable ? '<span style="color:var(--success)">متاح</span>' : '<span style="color:var(--danger)">غير متاح</span>'}
                    </div>
                    <div class="item-price">${p.price} ج.م</div>
                </div>
                <div class="item-actions">
                    <button class="btn-icon" style="width:30px; height:30px; font-size:12px;" onclick="editProductMobile('${pData}')">
                        <i class="fas fa-pen"></i>
                    </button>
                    <button class="btn-icon" style="width:30px; height:30px; font-size:12px; color:var(--text-muted)" onclick="toggleProd('${p._id}')">
                        <i class="fas fa-eye${p.isAvailable ? '' : '-slash'}"></i>
                    </button>
                </div>
            </div>
        `;
    });
}

function searchProductsMobile() {
    const term = document.getElementById("product-search").value.toLowerCase();
    const filtered = window.allProducts.filter(p => p.name.ar.toLowerCase().includes(term));
    renderProductsList(filtered);
}

function filterProductsByCat() {
    const cat = document.getElementById("p-cat-filter").value;
    if (cat === 'all') renderProductsList(window.allProducts);
    else renderProductsList(window.allProducts.filter(p => p.category === cat));
}

// --- Categories Logic ---
async function loadCategories() {
    const res = await fetch(`/api/v1/categories/${restaurantId}`, { headers: { Authorization: `Bearer ${token}` } });
    const data = await res.json();
    categoriesData = data.data.categories;
    
    // Update Stats
    document.getElementById("stat-cats-count").innerText = data.data.stats.totalCats;
    document.getElementById("stat-prods-count").innerText = data.data.stats.totalProds;

    // Render Grid
    const container = document.getElementById("categories-list");
    container.innerHTML = "";
    
    categoriesData.forEach(c => {
        const img = c.image || 'https://via.placeholder.com/150';
        container.innerHTML += `
            <div class="cat-card">
                <div class="cat-actions">
                    <button class="btn-mini" onclick="editCategoryMobile('${c._id}', '${c.name}', '${c.image||''}')"><i class="fas fa-pen text-primary"></i></button>
                </div>
                <div class="cat-img-box"><img src="${img}"></div>
                <div class="cat-info">
                    <div style="font-weight:bold; font-size:14px;">${c.name}</div>
                    <div style="font-size:11px; color:var(--text-muted)">${c.productCount} منتج</div>
                </div>
            </div>
        `;
    });

    // Populate Selects in Forms
    const select = document.getElementById("p-cat");
    select.innerHTML = "";
    categoriesData.forEach(c => {
        select.innerHTML += `<option value="${c.name}">${c.name}</option>`;
    });
}

// --- Sheet/Modal Logic ---
function openSheet(id) {
    document.querySelector('.sheet-overlay').classList.add('active');
    document.getElementById(id).classList.add('open');
}
function closeSheet(id) {
    document.querySelector('.sheet-overlay').classList.remove('active');
    document.getElementById(id).classList.remove('open');
}
function closeAllSheets() {
    document.querySelectorAll('.bottom-sheet').forEach(el => el.classList.remove('open'));
    document.querySelector('.sheet-overlay').classList.remove('active');
}

function openProductSheet() {
    // Reset Form
    document.getElementById("p-id").value = "";
    document.getElementById("p-name").value = "";
    document.getElementById("p-price").value = "";
    document.getElementById("p-desc").value = "";
    document.getElementById("p-preview").classList.add("hidden");
    document.getElementById("prod-sheet-title").innerText = "منتج جديد";
    openSheet('sheet-product');
}

function editProductMobile(dataEncoded) {
    const p = JSON.parse(decodeURIComponent(dataEncoded));
    document.getElementById("p-id").value = p._id;
    document.getElementById("p-name").value = p.name.ar;
    document.getElementById("p-cat").value = p.category;
    document.getElementById("p-price").value = p.price;
    document.getElementById("p-desc").value = p.description?.ar || "";
    
    if(p.image) {
        document.getElementById("p-preview").src = p.image;
        document.getElementById("p-preview").classList.remove("hidden");
    }
    document.getElementById("prod-sheet-title").innerText = "تعديل منتج";
    openSheet('sheet-product');
}

async function saveProductMobile() {
    const id = document.getElementById("p-id").value;
    const formData = new FormData();
    formData.append("restaurantId", restaurantId);
    formData.append("name", JSON.stringify({ ar: document.getElementById("p-name").value, en: "" }));
    formData.append("price", document.getElementById("p-price").value);
    formData.append("category", document.getElementById("p-cat").value);
    formData.append("description", JSON.stringify({ ar: document.getElementById("p-desc").value, en: "" }));
    
    const file = document.getElementById("p-image").files[0];
    if (file) formData.append("image", file);

    // Simple pricing mode for mobile
    formData.append("sizes", JSON.stringify([])); 

    const url = id ? `/api/v1/products/${id}` : "/api/v1/products";
    const method = id ? "PATCH" : "POST";

    closeAllSheets();
    Swal.showLoading();
    
    await fetch(url, {
        method: method,
        headers: { Authorization: `Bearer ${token}` },
        body: formData
    });
    
    Swal.close();
    loadProducts();
    Swal.fire({toast:true, icon:'success', title:'تم الحفظ', position:'top-end', showConfirmButton:false, timer:1500});
}

function openCategorySheet() {
    document.getElementById("c-id").value = "";
    document.getElementById("c-name").value = "";
    document.getElementById("c-preview").classList.add("hidden");
    openSheet('sheet-category');
}
function editCategoryMobile(id, name, img) {
    document.getElementById("c-id").value = id;
    document.getElementById("c-name").value = name;
    if(img) {
        document.getElementById("c-preview").src = img;
        document.getElementById("c-preview").classList.remove("hidden");
    }
    openSheet('sheet-category');
}
async function saveCategoryMobile() {
    const id = document.getElementById("c-id").value;
    const formData = new FormData();
    formData.append("name", document.getElementById("c-name").value);
    const file = document.getElementById("c-image").files[0];
    if(file) formData.append("image", file);
    
    if(!id) formData.append("restaurantId", restaurantId);
    
    closeAllSheets();
    Swal.showLoading();
    await fetch(id ? `/api/v1/categories/${id}` : "/api/v1/categories", {
        method: id ? "PATCH" : "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData
    });
    Swal.close();
    loadCategories();
}

// --- Socket.io ---
function initSocket(rId) {
    if (socket) return;
    socket = io({ transports: ["websocket"], upgrade: false });
    
    socket.on("connect", () => {
        socket.emit("join-restaurant", rId);
    });

    socket.on("new-order", (order) => {
        // Play Sound
        const audio = document.getElementById("order-sound");
        audio.play().catch(e => console.log("Audio Blocked"));

        // Show Badge
        document.getElementById("live-badge-container").classList.remove("hidden");
        
        // If active view is orders, reload
        if (document.getElementById("view-orders").classList.contains("active")) {
            loadOrders();
        } else {
            Swal.fire({
                toast: true, position: 'top', icon: 'info', 
                title: `طلب جديد! طاولة ${order.tableNumber}`,
                timer: 3000
            });
        }
    });

    socket.on("order-updated", () => {
        if (document.getElementById("view-orders").classList.contains("active")) loadOrders();
    });
}

// --- Helpers ---
function toggleDarkMode() {
    document.body.classList.toggle("dark-mode");
    localStorage.setItem("theme", document.body.classList.contains("dark-mode") ? "dark" : "light");
}
function logout() {
    sessionStorage.removeItem("ownerToken");
    window.location.href = "/login";
}
function previewImage(input, id) {
    if (input.files && input.files[0]) {
        const reader = new FileReader();
        reader.onload = function(e) {
            const el = document.getElementById(id);
            el.src = e.target.result;
            el.classList.remove("hidden");
        }
        reader.readAsDataURL(input.files[0]);
    }
}

// --- Other Views (Simplified for mobile) ---
async function loadHistory() {
    const list = document.getElementById("history-list");
    const totalDisp = document.getElementById("total-sales-display");
    
    const res = await fetch(`/api/v1/orders/${restaurantId}/history`, { headers: { Authorization: `Bearer ${token}` } });
    const data = await res.json();
    
    totalDisp.innerText = (data.data.totalSales || 0).toLocaleString() + " ج.م";
    list.innerHTML = "";
    
    data.data.orders.forEach(o => {
        const date = new Date(o.createdAt).toLocaleDateString("ar-EG");
        if(o.status === "completed") {
            list.innerHTML += `
                <div class="card" style="display:flex; justify-content:space-between; align-items:center;">
                    <div>
                        <div style="font-weight:bold;">#${o.orderNum}</div>
                        <div style="font-size:12px; color:var(--text-muted)">${date}</div>
                    </div>
                    <div style="color:var(--success); font-weight:bold;">${o.totalPrice} ج.م</div>
                </div>
            `;
        }
    });
}

function setupSettings(r) {
    document.getElementById("set-orderMode").value = r.orderMode;
    document.getElementById("set-taxRate").value = r.taxRate;
    document.getElementById("set-serviceRate").value = r.serviceRate;
    document.getElementById("set-useTableNumbers").checked = r.useTableNumbers;
    document.getElementById("set-enableCoupons").checked = r.enableCoupons;
    if(r.contactInfo) document.getElementById("set-whatsapp").value = r.contactInfo.whatsapp;
}

async function saveSettings() {
    const body = {
        orderMode: document.getElementById("set-orderMode").value,
        taxRate: document.getElementById("set-taxRate").value,
        serviceRate: document.getElementById("set-serviceRate").value,
        useTableNumbers: document.getElementById("set-useTableNumbers").checked,
        enableCoupons: document.getElementById("set-enableCoupons").checked,
        contactInfo: { whatsapp: document.getElementById("set-whatsapp").value }
    };
    
    Swal.showLoading();
    await fetch(`/api/v1/restaurants/${restaurantId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(body)
    });
    Swal.fire({icon:'success', title:'تم الحفظ', timer:1500, showConfirmButton:false});
}

// Theme Library (Simplified)
function loadThemes() {
    const themes = [
        {name: 'الافتراضي', color:'#6366f1'},
        {name: 'فخامة', color:'#D4AF37'},
        {name: 'مطعم برجر', color:'#f59e0b'},
        {name: 'هيلثي', color:'#10b981'}
    ];
    const container = document.getElementById("theme-library");
    container.innerHTML = "";
    themes.forEach(t => {
        container.innerHTML += `
            <div style="background:${t.color}; height:80px; border-radius:12px; display:flex; align-items:center; justify-content:center; color:white; font-weight:bold; box-shadow:0 4px 10px rgba(0,0,0,0.1)">${t.name}</div>
        `;
    });
}