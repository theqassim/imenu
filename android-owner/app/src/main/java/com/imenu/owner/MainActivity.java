package com.imenu.owner;

import android.Manifest;
import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.text.InputType;
import android.util.Log;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.widget.ArrayAdapter;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.Spinner;
import android.widget.TextView;
import android.widget.Toast;

import com.google.firebase.FirebaseApp;
import com.google.firebase.FirebaseOptions;
import com.google.firebase.messaging.FirebaseMessaging;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.DataOutputStream;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.function.Consumer;

public class MainActivity extends Activity {
    private static final String PREFS = "owner_session";
    private static final int PICK_IMAGE = 721;
    private static final int PURPLE = Color.rgb(67, 56, 202);
    private static final int INK = Color.rgb(28, 35, 54);
    private static final int MUTED = Color.rgb(111, 121, 142);
    private static final int PAGE = Color.rgb(245, 246, 250);
    private static final int WHITE = Color.WHITE;

    private final ExecutorService executor = Executors.newSingleThreadExecutor();
    private final List<JSONObject> categories = new ArrayList<>();
    private final List<JSONObject> products = new ArrayList<>();
    private final List<JSONObject> ratings = new ArrayList<>();
    private SharedPreferences preferences;
    private String apiBase = "";
    private String token = "";
    private String restaurantId = "";
    private JSONObject restaurant;
    private JSONObject siteContacts;
    private LinearLayout root;
    private LinearLayout content;
    private EditText serverInput;
    private EditText emailInput;
    private EditText passwordInput;
    private Uri selectedImage;
    private TextView selectedImageLabel;
    private AlertDialog activeDialog;
    private String activeTab = "ratings";
    private boolean pushClientReady;
    private boolean pushRegistrationComplete;
    private boolean pushRegistrationInProgress;
    private String pushRegistrationMessage = "";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().setStatusBarColor(WHITE);
        getWindow().setNavigationBarColor(WHITE);
        preferences = getSharedPreferences(PREFS, MODE_PRIVATE);
        apiBase = preferences.getString("api_base", "");
        token = preferences.getString("token", "");
        pushClientReady = initializeFirebase();
        OwnerFirebaseMessagingService.ensureNotificationChannel(this);
        if (token.isEmpty()) showLogin();
        else {
            openDashboard();
            registerForPushNotifications();
        }
    }

    @Override
    protected void onDestroy() {
        super.onDestroy();
        if (isFinishing()) executor.shutdown();
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (preferences != null && !token.isEmpty() && pushClientReady
                && !pushRegistrationInProgress) {
            registerForPushNotifications();
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == PICK_IMAGE && resultCode == RESULT_OK && data != null) {
            selectedImage = data.getData();
            if (selectedImage != null) {
                try {
                    getContentResolver().takePersistableUriPermission(
                            selectedImage, Intent.FLAG_GRANT_READ_URI_PERMISSION);
                } catch (SecurityException ignored) {
                    // The picker may return a temporary grant; the upload happens immediately.
                }
                if (selectedImageLabel != null) {
                    selectedImageLabel.setText("تم اختيار صورة");
                    selectedImageLabel.setVisibility(View.VISIBLE);
                }
            }
        }
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == 1001 && (grantResults.length == 0
                || grantResults[0] != PackageManager.PERMISSION_GRANTED)) {
            toast("فعّل إذن الإشعارات من إعدادات الهاتف لاستلام تقييمات العملاء");
        }
    }

    private void showLogin() {
        root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setGravity(Gravity.CENTER);
        root.setPadding(dp(24), dp(28), dp(24), dp(28));
        root.setLayoutDirection(View.LAYOUT_DIRECTION_RTL);
        root.setBackgroundColor(PAGE);

        TextView logo = text("iMenu Partner", 30, PURPLE, true);
        logo.setGravity(Gravity.CENTER);
        root.addView(logo, matchWrap());
        TextView hint = text("إدارة مطعمك من الموبايل", 15, MUTED, false);
        hint.setGravity(Gravity.CENTER);
        hint.setPadding(0, dp(8), 0, dp(24));
        root.addView(hint, matchWrap());

        LinearLayout form = card();
        serverInput = input("رابط الموقع (مثال: https://example.com)", InputType.TYPE_CLASS_TEXT
                | InputType.TYPE_TEXT_VARIATION_URI);
        serverInput.setText(apiBase);
        emailInput = input("البريد الإلكتروني", InputType.TYPE_CLASS_TEXT
                | InputType.TYPE_TEXT_VARIATION_EMAIL_ADDRESS);
        passwordInput = input("كلمة المرور", InputType.TYPE_CLASS_TEXT
                | InputType.TYPE_TEXT_VARIATION_PASSWORD);
        form.addView(serverInput, matchWrap());
        form.addView(emailInput, spaced(matchWrap(), 12));
        form.addView(passwordInput, spaced(matchWrap(), 12));
        Button loginButton = button("تسجيل الدخول");
        form.addView(loginButton, spaced(matchWrap(), 18));
        root.addView(form, matchWrap());
        setContentView(root);

        loginButton.setOnClickListener(view -> {
            String base = normalizeBase(serverInput.getText().toString());
            String email = emailInput.getText().toString().trim();
            String password = passwordInput.getText().toString();
            if (base.isEmpty() || email.isEmpty() || password.isEmpty()) {
                toast("أدخل رابط الموقع والبريد وكلمة المرور");
                return;
            }
            loginButton.setEnabled(false);
            loginButton.setText("جاري تسجيل الدخول...");
            JSONObject payload = new JSONObject();
            try {
                payload.put("email", email);
                payload.put("password", password);
            } catch (Exception exception) {
                showLoginError(loginButton, exception.getMessage());
                return;
            }
            doAsync(() -> requestJson(base, "/api/v1/users/login", "POST", null, payload),
                    result -> {
                        JSONObject user = result.optJSONObject("data") == null
                                ? null : result.optJSONObject("data").optJSONObject("user");
                        String role = user == null ? "" : user.optString("role", "");
                        if (!"owner".equals(role)) {
                            showLoginError(loginButton, "التطبيق مخصص لحساب مالك المطعم");
                            return;
                        }
                        apiBase = base;
                        token = result.optString("token", "");
                        if (token.isEmpty()) {
                            showLoginError(loginButton, "لم يصل رمز تسجيل الدخول من الموقع");
                            return;
                        }
                        preferences.edit()
                                .putString("api_base", apiBase)
                                .putString("token", token)
                                .apply();
                        if (Build.VERSION.SDK_INT >= 33
                                && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)
                                != PackageManager.PERMISSION_GRANTED) {
                            requestPermissions(
                                    new String[]{Manifest.permission.POST_NOTIFICATIONS}, 1001);
                        }
                        registerForPushNotifications();
                        openDashboard();
                    }, message -> showLoginError(loginButton, message));
        });
    }

    private void showLoginError(Button loginButton, String message) {
        runOnUiThread(() -> {
            loginButton.setEnabled(true);
            loginButton.setText("تسجيل الدخول");
            toast(message);
        });
    }

    private void openDashboard() {
        buildShell();
        fetchRestaurant(() -> {
            loadContacts();
            loadRatings();
            loadCategories(() -> loadProducts());
        });
    }

    private void buildShell() {
        root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setLayoutDirection(View.LAYOUT_DIRECTION_RTL);
        root.setBackgroundColor(PAGE);

        LinearLayout header = new LinearLayout(this);
        header.setGravity(Gravity.CENTER_VERTICAL);
        header.setPadding(dp(18), dp(14), dp(18), dp(14));
        header.setBackgroundColor(WHITE);
        LinearLayout heading = new LinearLayout(this);
        heading.setOrientation(LinearLayout.VERTICAL);
        TextView title = text("iMenu Partner", 20, INK, true);
        TextView subtitle = text("إدارة مطعمك", 12, MUTED, false);
        heading.addView(title);
        heading.addView(subtitle);
        header.addView(heading, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1));
        Button refresh = smallButton("تحديث");
        header.addView(refresh);
        refresh.setOnClickListener(view -> refreshData());
        root.addView(header, matchWrap());

        TextView restaurantName = text("", 15, WHITE, true);
        restaurantName.setGravity(Gravity.CENTER_VERTICAL);
        restaurantName.setPadding(dp(18), dp(12), dp(18), dp(12));
        restaurantName.setBackgroundColor(PURPLE);
        restaurantName.setTag("restaurant_name");
        root.addView(restaurantName, matchWrap());

        LinearLayout nav = new LinearLayout(this);
        nav.setGravity(Gravity.CENTER);
        nav.setPadding(dp(8), dp(8), dp(8), dp(8));
        nav.setBackgroundColor(WHITE);
        addTabButton(nav, "التقييمات", "ratings");
        addTabButton(nav, "المنتجات", "products");
        addTabButton(nav, "الأقسام", "categories");
        addTabButton(nav, "التواصل", "contact");
        root.addView(nav, matchWrap());

        ScrollView scroll = new ScrollView(this);
        content = new LinearLayout(this);
        content.setOrientation(LinearLayout.VERTICAL);
        content.setPadding(dp(16), dp(16), dp(16), dp(20));
        scroll.addView(content);
        root.addView(scroll, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, 0, 1));
        setContentView(root);
        renderTab();
    }

    private void addTabButton(LinearLayout nav, String label, String tab) {
        Button button = new Button(this);
        button.setText(label);
        button.setTextSize(12);
        button.setAllCaps(false);
        button.setTextColor(tab.equals(activeTab) ? PURPLE : MUTED);
        button.setBackgroundTintList(android.content.res.ColorStateList.valueOf(WHITE));
        nav.addView(button, new LinearLayout.LayoutParams(0, dp(44), 1));
        button.setOnClickListener(view -> {
            activeTab = tab;
            renderTab();
        });
    }

    private void renderTab() {
        if (content == null) return;
        content.removeAllViews();
        if ("ratings".equals(activeTab)) renderRatings();
        else if ("products".equals(activeTab)) renderProducts();
        else if ("categories".equals(activeTab)) renderCategories();
        else renderContact();
    }

    private void renderRatings() {
        if (!pushClientReady) {
            content.addView(emptyState(
                    "الإشعار الفوري غير مفعّل: يلزم إعداد Firebase للتطبيق والسيرفر."),
                    spaced(matchWrap(), 0));
        } else if (!pushRegistrationComplete) {
            content.addView(emptyState(
                    pushRegistrationMessage.isEmpty()
                            ? "جارٍ تفعيل إشعارات التقييمات على هذا الجهاز."
                            : "تعذر تفعيل الإشعارات الفورية: " + pushRegistrationMessage),
                    spaced(matchWrap(), 0));
        }
        double average = 0;
        for (JSONObject rating : ratings) average += rating.optDouble("stars", 0);
        if (!ratings.isEmpty()) average /= ratings.size();

        LinearLayout summary = card();
        TextView score = text(String.format(Locale.getDefault(), "%.1f ★", average),
                28, PURPLE, true);
        TextView count = text("إجمالي التقييمات: " + ratings.size(), 14, MUTED, false);
        summary.addView(score);
        summary.addView(count, spaced(matchWrap(), 4));
        content.addView(summary, matchWrap());
        content.addView(sectionTitle("آخر تقييمات العملاء"), spaced(matchWrap(), 18));

        if (ratings.isEmpty()) {
            content.addView(emptyState("لا توجد تقييمات حتى الآن"), matchWrap());
            return;
        }
        for (JSONObject rating : ratings) {
            LinearLayout item = card();
            String name = rating.optString("customerName", "عميل");
            String stars = "★".repeat(Math.max(0, Math.min(5, rating.optInt("stars", 0))));
            item.addView(text(name + "   " + stars, 16, INK, true));
            String comment = rating.optString("comment", "");
            item.addView(text(comment.isEmpty() ? "بدون تعليق" : comment, 14, MUTED, false),
                    spaced(matchWrap(), 8));
            String phone = rating.optString("customerPhone", "");
            if (!phone.isEmpty()) {
                TextView phoneView = text(phone, 13, PURPLE, false);
                item.addView(phoneView, spaced(matchWrap(), 5));
                phoneView.setOnClickListener(view -> openUrl("tel:" + phone));
            }
            content.addView(item, spaced(matchWrap(), 10));
        }
    }

    private void renderProducts() {
        Button add = button("+ إضافة منتج");
        content.addView(add, matchWrap());
        add.setOnClickListener(view -> showAddProductDialog());
        content.addView(sectionTitle("منتجات المنيو (" + products.size() + ")"),
                spaced(matchWrap(), 18));
        if (products.isEmpty()) {
            content.addView(emptyState("لا توجد منتجات"), matchWrap());
            return;
        }
        for (JSONObject product : products) {
            LinearLayout item = card();
            JSONObject nameObject = product.optJSONObject("name");
            String name = nameObject == null ? product.optString("name", "منتج")
                    : nameObject.optString("ar", nameObject.optString("en", "منتج"));
            JSONArray sizes = product.optJSONArray("sizes");
            String priceText = product.optString("price", "0") + " ج.م";
            if (sizes != null && sizes.length() > 0) {
                JSONObject firstSize = sizes.optJSONObject(0);
                if (firstSize != null) priceText = firstSize.optString("price", priceText) + " ج.م";
            }
            TextView title = text(name, 16, INK, true);
            TextView price = text(priceText + "  ·  " + product.optString("category", ""), 14, MUTED, false);
            item.addView(title);
            item.addView(price, spaced(matchWrap(), 6));
            Button edit = smallButton("تعديل السعر");
            item.addView(edit, spaced(wrapContent(), 12));
            edit.setOnClickListener(view -> showPriceDialog(product));
            content.addView(item, spaced(matchWrap(), 10));
        }
    }

    private void renderCategories() {
        Button add = button("+ إضافة قسم");
        content.addView(add, matchWrap());
        add.setOnClickListener(view -> showAddCategoryDialog());
        content.addView(sectionTitle("أقسام المنيو (" + categories.size() + ")"),
                spaced(matchWrap(), 18));
        if (categories.isEmpty()) {
            content.addView(emptyState("لا توجد أقسام"), matchWrap());
            return;
        }
        for (JSONObject category : categories) {
            LinearLayout item = card();
            item.addView(text(category.optString("name", "قسم"), 16, INK, true));
            item.addView(text(category.optInt("productCount", 0) + " منتج", 13, MUTED, false),
                    spaced(matchWrap(), 6));
            content.addView(item, spaced(matchWrap(), 10));
        }
    }

    private void renderContact() {
        content.addView(sectionTitle("تواصل مع الدعم الفني"), matchWrap());
        boolean hasContact = false;
        JSONArray phones = siteContacts == null ? null : siteContacts.optJSONArray("phones");
        if (phones != null) {
            for (int i = 0; i < phones.length(); i++) {
                JSONObject phone = phones.optJSONObject(i);
                if (phone == null) continue;
                String number = phone.optString("number", "");
                if (number.isEmpty()) continue;
                hasContact = true;
                addContactCard(phone.optString("label", "اتصال بالدعم الفني"),
                        number, "tel:" + number);
            }
        }
        JSONArray whatsapps = siteContacts == null ? null : siteContacts.optJSONArray("whatsapps");
        if (whatsapps != null) {
            for (int i = 0; i < whatsapps.length(); i++) {
                JSONObject phone = whatsapps.optJSONObject(i);
                if (phone == null) continue;
                String number = phone.optString("number", "");
                if (number.isEmpty()) continue;
                hasContact = true;
                addContactCard(phone.optString("label", "واتساب الدعم الفني"),
                        number, "https://wa.me/" + number.replaceAll("[^0-9]", ""));
            }
        }
        if (!hasContact) {
            content.addView(emptyState("بيانات الدعم الفني غير متاحة حالياً. يرجى إضافتها من إعدادات الموقع."),
                    spaced(matchWrap(), 10));
        }

        String facebook = siteContacts == null ? "" : siteContacts.optString("facebook", "");
        JSONObject restaurantLinks = restaurant == null ? null : restaurant.optJSONObject("socialLinks");
        if (facebook.isEmpty() && restaurantLinks != null) {
            facebook = restaurantLinks.optString("facebook", "");
        }
        content.addView(sectionTitle("صفحة فيسبوك"), spaced(matchWrap(), 20));
        if (!facebook.isEmpty()) {
            addContactCard("فتح صفحة فيسبوك", facebook, validWebUrl(facebook));
        } else {
            content.addView(emptyState("رابط صفحة فيسبوك غير مسجل في إعدادات الموقع."),
                    spaced(matchWrap(), 10));
        }

        JSONObject contactInfo = restaurant == null ? null : restaurant.optJSONObject("contactInfo");
        String restaurantPhone = contactInfo == null ? "" : contactInfo.optString("phone", "");
        String whatsapp = contactInfo == null ? "" : contactInfo.optString("whatsapp", "");
        if (!restaurantPhone.isEmpty() || !whatsapp.isEmpty()) {
            content.addView(sectionTitle("بيانات مطعمك"), spaced(matchWrap(), 20));
            if (!restaurantPhone.isEmpty()) addContactCard("الاتصال بالمطعم", restaurantPhone, "tel:" + restaurantPhone);
            if (!whatsapp.isEmpty()) {
                addContactCard("واتساب المطعم", whatsapp,
                        "https://wa.me/" + whatsapp.replaceAll("[^0-9]", ""));
            }
        }
    }

    private void addContactCard(String title, String value, String link) {
        LinearLayout item = card();
        item.addView(text(title, 15, INK, true));
        item.addView(text(value, 13, MUTED, false), spaced(matchWrap(), 5));
        item.setOnClickListener(view -> openUrl(link));
        content.addView(item, spaced(matchWrap(), 10));
    }

    private void fetchRestaurant(Runnable after) {
        doAsync(() -> requestJson(apiBase, "/api/v1/restaurants/my-restaurant", "GET", token, null),
                response -> {
                    JSONObject data = response.optJSONObject("data");
                    restaurant = data == null ? null : data.optJSONObject("restaurant");
                    if (restaurant == null) {
                        toast("تعذر العثور على بيانات المطعم");
                        return;
                    }
                    restaurantId = restaurant.optString("_id", "");
                    TextView name = root.findViewWithTag("restaurant_name");
                    if (name != null) name.setText(restaurant.optString("restaurantName", "مطعمي"));
                    after.run();
                }, message -> {
                    toast(message);
                    if (message.contains("401") || message.contains("403")) logout();
                });
    }

    private void loadRatings() {
        doAsync(() -> requestJson(apiBase, "/api/v1/ratings/list", "GET", token, null), response -> {
            ratings.clear();
            JSONArray list = response.optJSONObject("data") == null ? null
                    : response.optJSONObject("data").optJSONArray("ratings");
            if (list != null) {
                for (int i = 0; i < list.length(); i++) {
                    JSONObject rating = list.optJSONObject(i);
                    if (rating != null) ratings.add(rating);
                }
            }
            if ("ratings".equals(activeTab)) renderTab();
        }, message -> toast(message));
    }

    private void loadCategories(Runnable after) {
        if (restaurantId.isEmpty()) return;
        doAsync(() -> requestJson(apiBase, "/api/v1/categories/" + restaurantId, "GET", token, null),
                response -> {
                    categories.clear();
                    JSONObject data = response.optJSONObject("data");
                    JSONArray list = data == null ? null : data.optJSONArray("categories");
                    if (list != null) {
                        for (int i = 0; i < list.length(); i++) {
                            JSONObject category = list.optJSONObject(i);
                            if (category != null) categories.add(category);
                        }
                    }
                    if ("categories".equals(activeTab) || "products".equals(activeTab)) renderTab();
                    if (after != null) after.run();
                }, message -> toast(message));
    }

    private void loadProducts() {
        if (restaurantId.isEmpty()) return;
        doAsync(() -> requestJson(apiBase, "/api/v1/products/restaurant/" + restaurantId,
                "GET", token, null), response -> {
            products.clear();
            JSONObject data = response.optJSONObject("data");
            JSONArray list = data == null ? null : data.optJSONArray("products");
            if (list != null) {
                for (int i = 0; i < list.length(); i++) {
                    JSONObject product = list.optJSONObject(i);
                    if (product != null) products.add(product);
                }
            }
            if ("products".equals(activeTab)) renderTab();
        }, message -> toast(message));
    }

    private void loadContacts() {
        doAsync(() -> requestJson(apiBase, "/api/v1/site/public", "GET", null, null),
                response -> {
                    JSONObject data = response.optJSONObject("data");
                    siteContacts = data == null ? null : data.optJSONObject("contacts");
                    if ("contact".equals(activeTab)) renderTab();
                }, message -> {
                    siteContacts = null;
                    if ("contact".equals(activeTab)) renderTab();
                });
    }

    private void refreshData() {
        if (restaurantId.isEmpty()) return;
        loadRatings();
        loadCategories(this::loadProducts);
        loadContacts();
        toast("جاري تحديث البيانات");
    }

    private void showPriceDialog(JSONObject product) {
        JSONArray sizes = product.optJSONArray("sizes");
        List<EditText> priceFields = new ArrayList<>();
        LinearLayout form = dialogForm();
        if (sizes != null && sizes.length() > 0) {
            for (int i = 0; i < sizes.length(); i++) {
                JSONObject size = sizes.optJSONObject(i);
                String sizeName = size == null ? "الحجم " + (i + 1)
                        : size.optString("name", "الحجم " + (i + 1));
                form.addView(text("سعر " + sizeName, 13, MUTED, true));
                EditText price = input("السعر بالجنيه", InputType.TYPE_CLASS_NUMBER
                        | InputType.TYPE_NUMBER_FLAG_DECIMAL);
                if (size != null) price.setText(size.optString("price", ""));
                form.addView(price, spaced(matchWrap(), 5));
                priceFields.add(price);
            }
        } else {
            form.addView(text("السعر بالجنيه", 13, MUTED, true));
            EditText price = input("السعر بالجنيه", InputType.TYPE_CLASS_NUMBER
                    | InputType.TYPE_NUMBER_FLAG_DECIMAL);
            price.setText(product.optString("price", ""));
            form.addView(price, spaced(matchWrap(), 5));
            priceFields.add(price);
        }

        new AlertDialog.Builder(this)
                .setTitle("تعديل سعر المنتج")
                .setView(form)
                .setNegativeButton("إلغاء", null)
                .setPositiveButton("حفظ", (dialog, which) -> {
                    try {
                        Map<String, String> fields = new LinkedHashMap<>();
                        String firstPrice = requirePrice(priceFields.get(0));
                        fields.put("price", firstPrice);
                        if (sizes != null && sizes.length() > 0) {
                            for (int i = 0; i < sizes.length(); i++) {
                                JSONObject size = sizes.optJSONObject(i);
                                if (size != null) size.put("price", requirePrice(priceFields.get(i)));
                            }
                            fields.put("sizes", sizes.toString());
                        }
                        updateMultipart("/api/v1/products/" + product.optString("_id"),
                                "PATCH", fields, null, this::loadProducts);
                    } catch (Exception exception) {
                        toast(exception.getMessage());
                    }
                }).show();
    }

    private void showAddCategoryDialog() {
        selectedImage = null;
        LinearLayout form = dialogForm();
        EditText name = input("اسم القسم", InputType.TYPE_CLASS_TEXT);
        form.addView(name);
        Button imageButton = smallButton("اختيار صورة للقسم");
        form.addView(imageButton, spaced(matchWrap(), 12));
        selectedImageLabel = text("", 12, MUTED, false);
        form.addView(selectedImageLabel, spaced(matchWrap(), 4));
        imageButton.setOnClickListener(view -> pickImage());
        activeDialog = new AlertDialog.Builder(this)
                .setTitle("إضافة قسم جديد")
                .setView(form)
                .setNegativeButton("إلغاء", null)
                .setPositiveButton("إضافة", null)
                .create();
        activeDialog.setOnShowListener(dialog -> activeDialog.getButton(AlertDialog.BUTTON_POSITIVE)
                .setOnClickListener(view -> {
                    String categoryName = name.getText().toString().trim();
                    if (categoryName.isEmpty()) {
                        toast("اكتب اسم القسم");
                        return;
                    }
                    Map<String, String> fields = new LinkedHashMap<>();
                    fields.put("name", categoryName);
                    fields.put("restaurantId", restaurantId);
                    Uri image = selectedImage;
                    activeDialog.dismiss();
                    selectedImage = null;
                    updateMultipart("/api/v1/categories", "POST", fields, image,
                            () -> loadCategories(null));
                }));
        activeDialog.show();
    }

    private void showAddProductDialog() {
        if (categories.isEmpty()) {
            toast("أضف قسماً أولاً قبل إضافة منتج");
            return;
        }
        selectedImage = null;
        LinearLayout form = dialogForm();
        EditText name = input("اسم المنتج", InputType.TYPE_CLASS_TEXT);
        EditText description = input("وصف المنتج (اختياري)", InputType.TYPE_CLASS_TEXT
                | InputType.TYPE_TEXT_FLAG_MULTI_LINE);
        EditText price = input("السعر بالجنيه", InputType.TYPE_CLASS_NUMBER
                | InputType.TYPE_NUMBER_FLAG_DECIMAL);
        Spinner categorySpinner = new Spinner(this);
        List<String> categoryNames = new ArrayList<>();
        for (JSONObject category : categories) categoryNames.add(category.optString("name", ""));
        categorySpinner.setAdapter(new ArrayAdapter<>(this,
                android.R.layout.simple_spinner_dropdown_item, categoryNames));
        form.addView(name);
        form.addView(description, spaced(matchWrap(), 8));
        form.addView(price, spaced(matchWrap(), 8));
        form.addView(text("القسم", 13, MUTED, true), spaced(matchWrap(), 10));
        form.addView(categorySpinner, spaced(matchWrap(), 2));
        Button imageButton = smallButton("اختيار صورة للمنتج");
        form.addView(imageButton, spaced(matchWrap(), 10));
        selectedImageLabel = text("", 12, MUTED, false);
        form.addView(selectedImageLabel, spaced(matchWrap(), 4));
        imageButton.setOnClickListener(view -> pickImage());

        activeDialog = new AlertDialog.Builder(this)
                .setTitle("إضافة منتج جديد")
                .setView(form)
                .setNegativeButton("إلغاء", null)
                .setPositiveButton("إضافة", null)
                .create();
        activeDialog.setOnShowListener(dialog -> activeDialog.getButton(AlertDialog.BUTTON_POSITIVE)
                .setOnClickListener(view -> {
                    String productName = name.getText().toString().trim();
                    String productPrice = price.getText().toString().trim();
                    if (productName.isEmpty() || productPrice.isEmpty()) {
                        toast("اكتب اسم المنتج والسعر");
                        return;
                    }
                    try {
                        double numericPrice = Double.parseDouble(productPrice);
                        if (!Double.isFinite(numericPrice) || numericPrice <= 0) {
                            toast("أدخل سعراً صحيحاً");
                            return;
                        }
                    } catch (NumberFormatException exception) {
                        toast("أدخل سعراً صحيحاً");
                        return;
                    }
                    JSONObject localizedName = new JSONObject();
                    JSONObject localizedDescription = new JSONObject();
                    try {
                        localizedName.put("ar", productName);
                        localizedName.put("en", productName);
                        localizedDescription.put("ar", description.getText().toString().trim());
                        localizedDescription.put("en", "");
                    } catch (Exception exception) {
                        toast(exception.getMessage());
                        return;
                    }
                    Map<String, String> fields = new LinkedHashMap<>();
                    fields.put("restaurantId", restaurantId);
                    fields.put("category", categoryNames.get(categorySpinner.getSelectedItemPosition()));
                    fields.put("name", localizedName.toString());
                    fields.put("description", localizedDescription.toString());
                    fields.put("price", productPrice);
                    fields.put("sizes", "[]");
                    fields.put("oldPrice", "0");
                    Uri image = selectedImage;
                    activeDialog.dismiss();
                    selectedImage = null;
                    updateMultipart("/api/v1/products", "POST", fields, image, () -> {
                        loadProducts();
                        loadCategories(null);
                    });
                }));
        activeDialog.show();
    }

    private void pickImage() {
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType("image/*");
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION);
        startActivityForResult(intent, PICK_IMAGE);
    }

    private void updateMultipart(String path, String method, Map<String, String> fields,
                                 Uri image, Runnable done) {
        doAsync(() -> requestMultipart(apiBase, path, method, token, fields, image),
                response -> {
                    toast("تم الحفظ ومزامنة المنيو");
                    if (done != null) done.run();
                }, message -> toast(message));
    }

    private boolean initializeFirebase() {
        if (BuildConfig.FIREBASE_API_KEY.isEmpty() || BuildConfig.FIREBASE_APP_ID.isEmpty()
                || BuildConfig.FIREBASE_PROJECT_ID.isEmpty() || BuildConfig.FIREBASE_SENDER_ID.isEmpty()) {
            return false;
        }
        try {
            if (!FirebaseApp.getApps(this).isEmpty()) return true;
            FirebaseOptions options = new FirebaseOptions.Builder()
                    .setApiKey(BuildConfig.FIREBASE_API_KEY)
                    .setApplicationId(BuildConfig.FIREBASE_APP_ID)
                    .setProjectId(BuildConfig.FIREBASE_PROJECT_ID)
                    .setGcmSenderId(BuildConfig.FIREBASE_SENDER_ID)
                    .build();
            return FirebaseApp.initializeApp(this, options) != null;
        } catch (RuntimeException exception) {
            Log.e("iMenuOwner", "Firebase initialization failed", exception);
            return false;
        }
    }

    private void registerForPushNotifications() {
        if (!pushClientReady || token.isEmpty() || pushRegistrationInProgress) return;
        pushRegistrationInProgress = true;
        pushRegistrationMessage = "";
        FirebaseMessaging.getInstance().getToken().addOnCompleteListener(task -> {
            if (!task.isSuccessful() || task.getResult() == null) {
                pushRegistrationInProgress = false;
                pushRegistrationMessage = "تعذر الحصول على رمز Firebase لهذا الجهاز";
                Log.e("iMenuOwner", "Could not obtain an FCM registration token", task.getException());
                if ("ratings".equals(activeTab)) renderTab();
                return;
            }
            String deviceToken = task.getResult();
            JSONObject payload = new JSONObject();
            try {
                payload.put("token", deviceToken);
            } catch (Exception exception) {
                Log.e("iMenuOwner", "Could not prepare FCM registration request", exception);
                return;
            }
            String base = apiBase;
            String sessionToken = token;
            doAsync(() -> requestJson(base, "/api/v1/owner/fcm-subscribe",
                            "POST", sessionToken, payload),
                    response -> {
                        pushRegistrationInProgress = false;
                        if (!sessionToken.equals(token)) return;
                        preferences.edit().putString("fcm_token", deviceToken).apply();
                        pushRegistrationComplete = true;
                        pushRegistrationMessage = "";
                        if ("ratings".equals(activeTab)) renderTab();
                    }, message -> {
                        pushRegistrationInProgress = false;
                        pushRegistrationMessage = message;
                        Log.e("iMenuOwner", "Could not register this device for push: " + message);
                        if ("ratings".equals(activeTab)) renderTab();
                    });
        });
    }

    private void logout() {
        String oldToken = token;
        String deviceToken = preferences.getString("fcm_token", "");
        if (!oldToken.isEmpty() && !deviceToken.isEmpty()) {
            JSONObject payload = new JSONObject();
            try {
                payload.put("token", deviceToken);
                String base = apiBase;
                doAsync(() -> requestJson(base, "/api/v1/owner/fcm-unsubscribe",
                                "POST", oldToken, payload),
                        response -> {}, message -> Log.e("iMenuOwner", "Could not unregister FCM token: " + message));
            } catch (Exception exception) {
                Log.e("iMenuOwner", "Could not prepare FCM unregistration request", exception);
            }
        }
        preferences.edit().remove("token").remove("fcm_token").apply();
        token = "";
        restaurant = null;
        restaurantId = "";
        pushRegistrationComplete = false;
        showLogin();
    }

    private void doAsync(Callable<JSONObject> work, Consumer<JSONObject> success,
                        Consumer<String> failure) {
        executor.execute(() -> {
            try {
                JSONObject response = work.call();
                runOnUiThread(() -> success.accept(response));
            } catch (Exception exception) {
                String message = exception.getMessage() == null
                        ? "تعذر الاتصال بالموقع" : exception.getMessage();
                runOnUiThread(() -> failure.accept(message));
            }
        });
    }

    private JSONObject requestJson(String base, String path, String method, String auth,
                                   JSONObject body) throws Exception {
        HttpURLConnection connection = null;
        try {
            connection = (HttpURLConnection) new URL(base + path).openConnection();
            connection.setRequestMethod(method);
            connection.setConnectTimeout(20000);
            connection.setReadTimeout(20000);
            connection.setRequestProperty("Accept", "application/json");
            if (auth != null && !auth.isEmpty()) {
                connection.setRequestProperty("Authorization", "Bearer " + auth);
            }
            if (body != null) {
                connection.setDoOutput(true);
                connection.setRequestProperty("Content-Type", "application/json; charset=utf-8");
                try (DataOutputStream output = new DataOutputStream(connection.getOutputStream())) {
                    output.write(body.toString().getBytes(StandardCharsets.UTF_8));
                }
            }
            return readJsonResponse(connection);
        } finally {
            if (connection != null) connection.disconnect();
        }
    }

    private JSONObject requestMultipart(String base, String path, String method, String auth,
                                        Map<String, String> fields, Uri image) throws Exception {
        HttpURLConnection connection = null;
        String boundary = "iMenu-" + UUID.randomUUID();
        try {
            connection = (HttpURLConnection) new URL(base + path).openConnection();
            connection.setRequestMethod(method);
            connection.setConnectTimeout(30000);
            connection.setReadTimeout(60000);
            connection.setDoOutput(true);
            connection.setRequestProperty("Accept", "application/json");
            connection.setRequestProperty("Content-Type", "multipart/form-data; boundary=" + boundary);
            if (auth != null && !auth.isEmpty()) {
                connection.setRequestProperty("Authorization", "Bearer " + auth);
            }
            try (DataOutputStream output = new DataOutputStream(connection.getOutputStream())) {
                for (Map.Entry<String, String> field : fields.entrySet()) {
                    writeFormField(output, boundary, field.getKey(), field.getValue());
                }
                if (image != null) writeImagePart(output, boundary, image);
                output.writeBytes("--" + boundary + "--\r\n");
                output.flush();
            }
            return readJsonResponse(connection);
        } finally {
            if (connection != null) connection.disconnect();
        }
    }

    private JSONObject readJsonResponse(HttpURLConnection connection) throws Exception {
        int status = connection.getResponseCode();
        InputStream stream = status >= 200 && status < 300
                ? connection.getInputStream() : connection.getErrorStream();
        StringBuilder text = new StringBuilder();
        if (stream != null) {
            try (BufferedReader reader = new BufferedReader(
                    new InputStreamReader(stream, StandardCharsets.UTF_8))) {
                String line;
                while ((line = reader.readLine()) != null) text.append(line);
            }
        }
        JSONObject response;
        try {
            response = text.length() == 0 ? new JSONObject() : new JSONObject(text.toString());
        } catch (Exception exception) {
            throw new Exception("رد غير مفهوم من الموقع (" + status + ")");
        }
        if (status < 200 || status >= 300) {
            String message = response.optString("message", "خطأ من الموقع");
            throw new Exception(message + " (" + status + ")");
        }
        if ("fail".equals(response.optString("status"))) {
            throw new Exception(response.optString("message", "تعذر تنفيذ الطلب"));
        }
        return response;
    }

    private void writeFormField(DataOutputStream output, String boundary,
                                String name, String value) throws Exception {
        output.writeBytes("--" + boundary + "\r\n");
        output.writeBytes("Content-Disposition: form-data; name=\"" + name + "\"\r\n");
        output.writeBytes("Content-Type: text/plain; charset=UTF-8\r\n\r\n");
        output.write(value.getBytes(StandardCharsets.UTF_8));
        output.writeBytes("\r\n");
    }

    private void writeImagePart(DataOutputStream output, String boundary, Uri uri) throws Exception {
        String mime = getContentResolver().getType(uri);
        if (mime == null || !mime.startsWith("image/")) mime = "image/jpeg";
        output.writeBytes("--" + boundary + "\r\n");
        output.writeBytes("Content-Disposition: form-data; name=\"image\"; filename=\"upload-image\"\r\n");
        output.writeBytes("Content-Type: " + mime + "\r\n\r\n");
        try (InputStream input = getContentResolver().openInputStream(uri)) {
            if (input == null) throw new Exception("تعذر قراءة الصورة المختارة");
            byte[] buffer = new byte[8192];
            int count;
            while ((count = input.read(buffer)) != -1) output.write(buffer, 0, count);
        }
        output.writeBytes("\r\n");
    }

    private void openUrl(String link) {
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(link)));
        } catch (Exception exception) {
            toast("لا يوجد تطبيق لفتح هذا الرابط");
        }
    }

    private String normalizeBase(String value) {
        String base = value == null ? "" : value.trim();
        while (base.endsWith("/")) base = base.substring(0, base.length() - 1);
        if (!base.startsWith("https://")) return "";
        return base;
    }

    private String validWebUrl(String value) {
        String link = value.trim();
        if (link.startsWith("https://") || link.startsWith("http://")) return link;
        return "https://" + link;
    }

    private String requirePrice(EditText field) throws Exception {
        String value = field.getText().toString().trim();
        try {
            double number = Double.parseDouble(value);
            if (Double.isFinite(number) && number > 0) return value;
        } catch (NumberFormatException ignored) {
            // Report the same validation message for empty and malformed values.
        }
        throw new Exception("أدخل سعراً صحيحاً أكبر من صفر");
    }

    private LinearLayout card() {
        LinearLayout card = new LinearLayout(this);
        card.setOrientation(LinearLayout.VERTICAL);
        card.setPadding(dp(16), dp(15), dp(16), dp(15));
        card.setBackgroundColor(WHITE);
        return card;
    }

    private LinearLayout dialogForm() {
        LinearLayout form = new LinearLayout(this);
        form.setOrientation(LinearLayout.VERTICAL);
        form.setPadding(dp(20), dp(8), dp(20), dp(8));
        form.setLayoutDirection(View.LAYOUT_DIRECTION_RTL);
        return form;
    }

    private EditText input(String hint, int inputType) {
        EditText edit = new EditText(this);
        edit.setSingleLine(inputType != (InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_MULTI_LINE));
        edit.setHint(hint);
        edit.setInputType(inputType);
        edit.setTextSize(15);
        edit.setTextColor(INK);
        edit.setPadding(dp(12), dp(10), dp(12), dp(10));
        edit.setBackgroundTintList(android.content.res.ColorStateList.valueOf(Color.rgb(205, 210, 222)));
        edit.setLayoutDirection(View.LAYOUT_DIRECTION_RTL);
        return edit;
    }

    private TextView text(String value, int size, int color, boolean bold) {
        TextView text = new TextView(this);
        text.setText(value);
        text.setTextSize(size);
        text.setTextColor(color);
        if (bold) text.setTypeface(null, android.graphics.Typeface.BOLD);
        text.setGravity(Gravity.END);
        text.setLayoutDirection(View.LAYOUT_DIRECTION_RTL);
        return text;
    }

    private TextView sectionTitle(String value) {
        return text(value, 18, INK, true);
    }

    private TextView emptyState(String value) {
        TextView empty = text(value, 14, MUTED, false);
        empty.setGravity(Gravity.CENTER);
        empty.setPadding(dp(18), dp(28), dp(18), dp(28));
        empty.setBackgroundColor(WHITE);
        return empty;
    }

    private Button button(String value) {
        Button button = new Button(this);
        button.setText(value);
        button.setTextColor(WHITE);
        button.setTextSize(15);
        button.setAllCaps(false);
        button.setBackgroundTintList(android.content.res.ColorStateList.valueOf(PURPLE));
        return button;
    }

    private Button smallButton(String value) {
        Button button = new Button(this);
        button.setText(value);
        button.setTextColor(PURPLE);
        button.setTextSize(12);
        button.setAllCaps(false);
        button.setBackgroundTintList(android.content.res.ColorStateList.valueOf(
                Color.rgb(238, 237, 255)));
        return button;
    }

    private LinearLayout.LayoutParams matchWrap() {
        return new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
    }

    private LinearLayout.LayoutParams wrapContent() {
        return new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
    }

    private LinearLayout.LayoutParams spaced(LinearLayout.LayoutParams params, int topDp) {
        params.topMargin = dp(topDp);
        return params;
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }

    private void toast(String message) {
        runOnUiThread(() -> Toast.makeText(this, message, Toast.LENGTH_LONG).show());
    }
}
