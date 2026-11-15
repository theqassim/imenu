package com.imenu.owner;

import android.Manifest;
import android.animation.ObjectAnimator;
import android.animation.ValueAnimator;
import android.app.Activity;
import android.app.AlertDialog;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.content.res.ColorStateList;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.Typeface;
import android.graphics.drawable.Drawable;
import android.graphics.drawable.GradientDrawable;
import android.graphics.drawable.RippleDrawable;
import android.graphics.drawable.StateListDrawable;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import android.text.Editable;
import android.text.InputType;
import android.text.Spannable;
import android.text.SpannableString;
import android.text.TextWatcher;
import android.text.style.ForegroundColorSpan;
import android.util.Log;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.view.animation.DecelerateInterpolator;
import android.widget.ArrayAdapter;
import android.widget.Button;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.ImageView;
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
    private static final String API_BASE = "https://www.imenueg.com";
    private static final long INTERNET_CHECK_INTERVAL_MS = 10_000L;
    private static final int PICK_IMAGE = 721;
    private static final int PRODUCT_BATCH_SIZE = 30;

    // ---- Design tokens -------------------------------------------------------------------
    private static final int PRIMARY = 0xFF5B3DF5;
    private static final int VIOLET = 0xFF8B5CF6;
    private static final int DEEP = 0xFF1B1062;
    private static final int GOLD = 0xFFFFB020;
    private static final int INK = 0xFF14122B;
    private static final int MUTED = 0xFF6B6A85;
    private static final int PAGE = 0xFFF4F2FC;
    private static final int LINE = 0xFFE9E6F7;
    private static final int FIELD = 0xFFF7F5FE;
    private static final int TINT = 0xFFEFEBFF;
    private static final int DANGER = 0xFFE11D48;
    private static final int DANGER_TINT = 0xFFFFE8EE;
    private static final int SUCCESS = 0xFF16A34A;
    private static final int SUCCESS_TINT = 0xFFE3F8EA;
    private static final int WARN = 0xFF8A5A00;
    private static final int WARN_TINT = 0xFFFFF1CC;
    private static final int WHITE = Color.WHITE;
    private static final int[][] AVATARS = {
            {0xFF6D4AFF, 0xFF9B7BFF}, {0xFFFF6B4A, 0xFFFFB347}, {0xFF0EA5A0, 0xFF34D3C4},
            {0xFFE0398F, 0xFFFF7BB6}, {0xFF2F6BFF, 0xFF5CA0FF}};

    private static final class SizeEditorRow {
        final LinearLayout view;
        final EditText name;
        final EditText price;
        final EditText oldPrice;

        SizeEditorRow(LinearLayout view, EditText name, EditText price, EditText oldPrice) {
            this.view = view;
            this.name = name;
            this.price = price;
            this.oldPrice = oldPrice;
        }
    }

    private final ExecutorService executor = Executors.newFixedThreadPool(4);
    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private final Runnable internetCheckRunnable = new Runnable() {
        @Override
        public void run() {
            if (!activityResumed) return;
            verifyInternetConnection();
            mainHandler.postDelayed(this, INTERNET_CHECK_INTERVAL_MS);
        }
    };
    private final List<JSONObject> categories = new ArrayList<>();
    private final List<JSONObject> products = new ArrayList<>();
    private final List<JSONObject> ratings = new ArrayList<>();
    private final Map<String, View[]> navItems = new LinkedHashMap<>();
    private final List<ObjectAnimator> skeletonAnimators = new ArrayList<>();
    private SharedPreferences preferences;
    private String apiBase = API_BASE;
    private String token = "";
    private String restaurantId = "";
    private JSONObject restaurant;
    private JSONObject siteContacts;
    private ViewGroup root;
    private LinearLayout content;
    private LinearLayout productResults;
    private TextView productResultsTitle;
    private ScrollView scroll;
    private EditText emailInput;
    private EditText passwordInput;
    private Uri selectedImage;
    private TextView selectedImageLabel;
    private AlertDialog activeDialog;
    private TextView pushChipText;
    private View pushChipDot;
    private Typeface fontRegular = Typeface.DEFAULT;
    private Typeface fontMedium = Typeface.DEFAULT;
    private Typeface fontBold = Typeface.DEFAULT_BOLD;
    private Typeface fontExtra = Typeface.DEFAULT_BOLD;
    private String activeTab = "ratings";
    private String productSearchQuery = "";
    private String selectedProductCategory = "";
    private int visibleProductCount = PRODUCT_BATCH_SIZE;
    private ConnectivityManager connectivityManager;
    private ConnectivityManager.NetworkCallback connectivityCallback;
    private AlertDialog internetDialog;
    private boolean connectivityCallbackRegistered;
    private boolean activityResumed;
    private boolean internetReady;
    private boolean internetCheckInProgress;
    private boolean appStarted;
    private boolean ratingsLoaded;
    private boolean productsLoaded;
    private boolean categoriesLoaded;
    private boolean pushClientReady;
    private boolean pushRegistrationComplete;
    private boolean pushRegistrationInProgress;
    private String pushRegistrationMessage = "";
    private long sessionGeneration;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        loadFonts();
        Window window = getWindow();
        window.setStatusBarColor(Color.TRANSPARENT);
        window.setNavigationBarColor(Color.TRANSPARENT);
        if (Build.VERSION.SDK_INT >= 29) window.setNavigationBarContrastEnforced(false);
        preferences = getSharedPreferences(PREFS, MODE_PRIVATE);
        apiBase = API_BASE;
        preferences.edit().putString("api_base", API_BASE).apply();
        token = preferences.getString("token", "");
        pushClientReady = initializeFirebase();
        OwnerFirebaseMessagingService.ensureNotificationChannel(this);
        showInternetCheckScreen();
        registerConnectivityCallback();
    }

    @Override
    protected void onDestroy() {
        stopSkeletons();
        mainHandler.removeCallbacks(internetCheckRunnable);
        if (connectivityCallbackRegistered && connectivityManager != null
                && connectivityCallback != null) {
            connectivityManager.unregisterNetworkCallback(connectivityCallback);
            connectivityCallbackRegistered = false;
        }
        internetDialog = null;
        if (isFinishing()) executor.shutdown();
        super.onDestroy();
    }

    @Override
    protected void onResume() {
        super.onResume();
        activityResumed = true;
        verifyInternetConnection();
        mainHandler.removeCallbacks(internetCheckRunnable);
        mainHandler.postDelayed(internetCheckRunnable, INTERNET_CHECK_INTERVAL_MS);
        if (internetReady && preferences != null && !token.isEmpty() && pushClientReady
                && !pushRegistrationInProgress) {
            registerForPushNotifications();
        }
    }

    @Override
    protected void onPause() {
        activityResumed = false;
        mainHandler.removeCallbacks(internetCheckRunnable);
        super.onPause();
    }

    private void showInternetCheckScreen() {
        LinearLayout screen = new LinearLayout(this);
        screen.setOrientation(LinearLayout.VERTICAL);
        screen.setGravity(Gravity.CENTER);
        screen.setPadding(dp(28), dp(28), dp(28), dp(28));
        screen.setBackgroundColor(PAGE);
        screen.setLayoutDirection(View.LAYOUT_DIRECTION_RTL);
        screen.addView(iconCircle(R.drawable.ic_link, PRIMARY, TINT, 76, 20),
                new LinearLayout.LayoutParams(dp(76), dp(76)));
        TextView title = text("iMenu Partner", 26, INK, true);
        title.setTypeface(fontExtra);
        title.setGravity(Gravity.CENTER);
        screen.addView(title, spaced(matchWrap(), 18));
        TextView status = text("جارٍ التأكد من وجود اتصال إنترنت فعّال", 14, MUTED, false);
        status.setGravity(Gravity.CENTER);
        screen.addView(status, spaced(matchWrap(), 8));
        root = screen;
        setContentView(screen);
    }

    private void registerConnectivityCallback() {
        connectivityManager = (ConnectivityManager) getSystemService(CONNECTIVITY_SERVICE);
        if (connectivityManager == null) return;
        connectivityCallback = new ConnectivityManager.NetworkCallback() {
            @Override
            public void onAvailable(Network network) {
                runOnUiThread(() -> verifyInternetConnection());
            }

            @Override
            public void onCapabilitiesChanged(Network network, NetworkCapabilities capabilities) {
                runOnUiThread(() -> verifyInternetConnection());
            }

            @Override
            public void onLost(Network network) {
                runOnUiThread(() -> verifyInternetConnection());
            }
        };
        connectivityManager.registerDefaultNetworkCallback(connectivityCallback);
        connectivityCallbackRegistered = true;
    }

    private boolean hasValidatedInternet() {
        if (connectivityManager == null) return false;
        Network activeNetwork = connectivityManager.getActiveNetwork();
        if (activeNetwork == null) return false;
        NetworkCapabilities capabilities = connectivityManager.getNetworkCapabilities(activeNetwork);
        return capabilities != null
                && capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
                && capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED);
    }

    private void verifyInternetConnection() {
        if (!activityResumed || isFinishing()) return;
        if (!hasValidatedInternet()) {
            internetReady = false;
            showInternetDialog("لم يتم تأكيد وجود إنترنت فعّال. اتصال الهاتف بالشبكة وحده لا يكفي؛ تحقق من الواي فاي أو بيانات الهاتف ثم أعد المحاولة.");
            return;
        }
        if (internetCheckInProgress) return;
        internetCheckInProgress = true;
        doAsync(this::probeInternetService, response -> {
            internetCheckInProgress = false;
            internetReady = true;
            if (!activityResumed || isFinishing()) return;
            dismissInternetDialog();
            if (!appStarted) {
                appStarted = true;
                if (token.isEmpty()) {
                    showLogin();
                } else {
                    openDashboard();
                    registerForPushNotifications();
                }
            } else if (preferences != null && !token.isEmpty() && pushClientReady
                    && !pushRegistrationInProgress) {
                registerForPushNotifications();
            }
        }, message -> {
            internetCheckInProgress = false;
            internetReady = false;
            if (!activityResumed || isFinishing()) return;
            Log.w("iMenuOwner", "Internet/service reachability check failed: " + message);
            showInternetDialog("تعذر الوصول إلى خدمة iMenu عبر الإنترنت. تأكد أن الاتصال يعمل فعليًا ثم اضغط إعادة المحاولة.");
        });
    }

    private JSONObject probeInternetService() throws Exception {
        HttpURLConnection connection = null;
        try {
            connection = (HttpURLConnection) new URL(API_BASE + "/api/v1/site/public")
                    .openConnection();
            connection.setRequestMethod("GET");
            connection.setConnectTimeout(5000);
            connection.setReadTimeout(5000);
            connection.setRequestProperty("Accept", "application/json");
            return readJsonResponse(connection);
        } finally {
            if (connection != null) connection.disconnect();
        }
    }

    private void showInternetDialog(String message) {
        if (internetDialog != null && internetDialog.isShowing()) {
            internetDialog.setMessage(message);
            return;
        }
        internetDialog = dialog()
                .setIcon(R.drawable.ic_link)
                .setTitle("الاتصال بالإنترنت مطلوب")
                .setMessage(message)
                .setCancelable(false)
                .setNegativeButton("إغلاق التطبيق", (dialog, which) -> finish())
                .setNeutralButton("إعدادات الاتصال", (dialog, which) -> openInternetSettings())
                .setPositiveButton("إعادة المحاولة", null)
                .create();
        showDialog(internetDialog);
        internetDialog.setCanceledOnTouchOutside(false);
        internetDialog.getButton(AlertDialog.BUTTON_POSITIVE)
                .setOnClickListener(view -> verifyInternetConnection());
    }

    private void dismissInternetDialog() {
        if (internetDialog == null) return;
        if (internetDialog.isShowing()) internetDialog.dismiss();
        internetDialog = null;
    }

    private void openInternetSettings() {
        Intent settingsIntent = Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q
                ? new Intent(Settings.Panel.ACTION_INTERNET_CONNECTIVITY)
                : new Intent(Settings.ACTION_WIRELESS_SETTINGS);
        try {
            startActivity(settingsIntent);
        } catch (ActivityNotFoundException | SecurityException exception) {
            Log.e("iMenuOwner", "Could not open internet settings", exception);
            toast("تعذر فتح إعدادات الاتصال");
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
                    selectedImageLabel.setTextColor(SUCCESS);
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

    // ---- Screens -------------------------------------------------------------------------

    private void showLogin() {
        pushChipText = null;
        pushChipDot = null;
        setSystemBars(false);

        FrameLayout frame = new FrameLayout(this);
        frame.setLayoutDirection(View.LAYOUT_DIRECTION_RTL);
        frame.setBackground(new GradientDrawable(GradientDrawable.Orientation.TOP_BOTTOM,
                new int[]{0xFF160B52, 0xFF4228D8, 0xFF7C4DF2}));
        View decor = new View(this) {
            private final Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);

            @Override
            protected void onDraw(Canvas canvas) {
                float w = getWidth();
                float h = getHeight();
                paint.setColor(0x16FFFFFF);
                canvas.drawCircle(w * 0.95f, h * 0.06f, w * 0.55f, paint);
                paint.setColor(0x10FFFFFF);
                canvas.drawCircle(w * 0.02f, h * 0.60f, w * 0.48f, paint);
                paint.setColor(0x22FFB020);
                canvas.drawCircle(w * 0.90f, h * 0.95f, w * 0.30f, paint);
            }
        };
        frame.addView(decor, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));

        ScrollView scroller = new ScrollView(this);
        scroller.setFillViewport(true);
        scroller.setVerticalScrollBarEnabled(false);
        LinearLayout column = new LinearLayout(this);
        column.setOrientation(LinearLayout.VERTICAL);
        column.setGravity(Gravity.CENTER);
        column.setPadding(dp(24), dp(40), dp(24), dp(28));
        scroller.addView(column, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));
        frame.addView(scroller, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));

        FrameLayout logoTile = new FrameLayout(this);
        GradientDrawable tileBg = new GradientDrawable(GradientDrawable.Orientation.TL_BR,
                new int[]{0xFFFFD36B, 0xFFFF9F1C});
        tileBg.setCornerRadius(dpf(28));
        logoTile.setBackground(tileBg);
        logoTile.setElevation(dpf(10));
        tintShadow(logoTile, 0xAA000000);
        ImageView logoStar = new ImageView(this);
        logoStar.setImageDrawable(icon(R.drawable.ic_notification, WHITE));
        logoTile.addView(logoStar, new FrameLayout.LayoutParams(dp(46), dp(46), Gravity.CENTER));
        column.addView(logoTile, new LinearLayout.LayoutParams(dp(86), dp(86)));

        TextView brand = text("iMenu Partner", 32, WHITE, true);
        brand.setTypeface(fontExtra);
        brand.setGravity(Gravity.CENTER);
        column.addView(brand, spaced(matchWrap(), 18));
        TextView hint = text("إدارة مطعمك من الموبايل", 15, 0xCCFFFFFF, false);
        hint.setGravity(Gravity.CENTER);
        column.addView(hint, spaced(matchWrap(), 6));

        LinearLayout form = new LinearLayout(this);
        form.setOrientation(LinearLayout.VERTICAL);
        form.setPadding(dp(22), dp(24), dp(22), dp(24));
        form.setBackground(round(WHITE, 28));
        form.setElevation(dpf(12));
        tintShadow(form, 0xFF000000);
        form.addView(text("تسجيل الدخول", 21, INK, true));
        form.addView(text("ادخل ببيانات حساب مالك المطعم", 13, MUTED, false), spaced(matchWrap(), 4));
        emailInput = input("name@example.com", InputType.TYPE_CLASS_TEXT
                | InputType.TYPE_TEXT_VARIATION_EMAIL_ADDRESS);
        passwordInput = input("••••••••", InputType.TYPE_CLASS_TEXT
                | InputType.TYPE_TEXT_VARIATION_PASSWORD);
        form.addView(text("البريد الإلكتروني", 12, MUTED, true), spaced(matchWrap(), 20));
        form.addView(emailInput, spaced(matchWrap(), 6));
        form.addView(text("كلمة المرور", 12, MUTED, true), spaced(matchWrap(), 14));
        form.addView(passwordInput, spaced(matchWrap(), 6));
        Button loginButton = button("تسجيل الدخول");
        form.addView(loginButton, spaced(matchWrap(), 24));
        column.addView(form, spaced(matchWrap(), 30));
        root = frame;
        setContentView(frame);

        frame.setOnApplyWindowInsetsListener((view, insets) -> {
            column.setPadding(dp(24), dp(40) + insets.getSystemWindowInsetTop(), dp(24),
                    dp(28) + insets.getSystemWindowInsetBottom());
            return insets;
        });
        frame.requestApplyInsets();

        loginButton.setOnClickListener(view -> {
            String email = emailInput.getText().toString().trim();
            String password = passwordInput.getText().toString();
            if (email.isEmpty() || password.isEmpty()) {
                toast("أدخل البريد الإلكتروني وكلمة المرور");
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
            doAsync(() -> requestJson(API_BASE, "/api/v1/users/login", "POST", null, payload),
                    result -> {
                        JSONObject user = result.optJSONObject("data") == null
                                ? null : result.optJSONObject("data").optJSONObject("user");
                        String role = user == null ? "" : user.optString("role", "");
                        if (!"owner".equals(role)) {
                            showLoginError(loginButton, "التطبيق مخصص لحساب مالك المطعم");
                            return;
                        }
                        apiBase = API_BASE;
                        token = result.optString("token", "");
                        if (token.isEmpty()) {
                            showLoginError(loginButton, "لم يصل رمز تسجيل الدخول من الموقع");
                            return;
                        }
                        preferences.edit()
                                .putString("api_base", API_BASE)
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
            loadCategories(null);
            loadProducts();
        });
    }

    private void buildShell() {
        setSystemBars(true);
        LinearLayout shell = new LinearLayout(this);
        shell.setOrientation(LinearLayout.VERTICAL);
        shell.setLayoutDirection(View.LAYOUT_DIRECTION_RTL);
        shell.setBackgroundColor(PAGE);
        root = shell;

        // Header ------------------------------------------------------------------------
        LinearLayout header = new LinearLayout(this);
        header.setOrientation(LinearLayout.VERTICAL);
        GradientDrawable headerBg = new GradientDrawable(GradientDrawable.Orientation.TL_BR,
                new int[]{DEEP, 0xFF4B2FE3, VIOLET});
        headerBg.setCornerRadii(new float[]{0, 0, 0, 0, dpf(30), dpf(30), dpf(30), dpf(30)});
        header.setBackground(headerBg);
        header.setElevation(dpf(6));
        tintShadow(header, PRIMARY);

        LinearLayout topRow = new LinearLayout(this);
        topRow.setGravity(Gravity.CENTER_VERTICAL);
        LinearLayout heading = new LinearLayout(this);
        heading.setOrientation(LinearLayout.VERTICAL);
        TextView brand = text("iMenu Partner", 12, 0xB3FFFFFF, true);
        brand.setLetterSpacing(0.08f);
        TextView restaurantName = text("مطعمي", 25, WHITE, true);
        restaurantName.setTypeface(fontExtra);
        restaurantName.setTag("restaurant_name");
        heading.addView(brand);
        heading.addView(restaurantName, spaced(matchWrap(), 2));
        topRow.addView(heading, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1));
        ImageView refresh = iconCircle(R.drawable.ic_refresh, WHITE, 0x26FFFFFF, 42, 11);
        refresh.setContentDescription("تحديث");
        ImageView logoutButton = iconCircle(R.drawable.ic_logout, WHITE, 0x26FFFFFF, 42, 11);
        logoutButton.setContentDescription("تسجيل خروج");
        topRow.addView(refresh, new LinearLayout.LayoutParams(dp(42), dp(42)));
        LinearLayout.LayoutParams logoutParams = new LinearLayout.LayoutParams(dp(42), dp(42));
        logoutParams.setMarginStart(dp(10));
        topRow.addView(logoutButton, logoutParams);
        header.addView(topRow, matchWrap());
        refresh.setOnClickListener(view -> {
            view.animate().rotationBy(360).setDuration(650).start();
            refreshData();
        });
        logoutButton.setOnClickListener(view -> confirmLogout());

        LinearLayout chip = new LinearLayout(this);
        chip.setGravity(Gravity.CENTER_VERTICAL);
        chip.setPadding(dp(12), dp(6), dp(14), dp(6));
        chip.setBackground(round(0x26FFFFFF, 20));
        pushChipDot = new View(this);
        pushChipText = text("", 11, WHITE, true);
        pushChipText.setGravity(Gravity.CENTER_VERTICAL);
        chip.addView(pushChipDot, new LinearLayout.LayoutParams(dp(8), dp(8)));
        LinearLayout.LayoutParams chipTextParams = wrapContent();
        chipTextParams.setMarginStart(dp(8));
        chip.addView(pushChipText, chipTextParams);
        header.addView(chip, spaced(wrapContent(), 14));
        updatePushChip();

        shell.addView(header, matchWrap());

        // Content -----------------------------------------------------------------------
        scroll = new ScrollView(this);
        scroll.setClipToPadding(false);
        scroll.setVerticalScrollBarEnabled(false);
        scroll.setOverScrollMode(View.OVER_SCROLL_NEVER);
        content = new LinearLayout(this);
        content.setOrientation(LinearLayout.VERTICAL);
        content.setClipChildren(false);
        content.setPadding(dp(16), dp(20), dp(16), dp(24));
        scroll.addView(content);
        shell.addView(scroll, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, 0, 1));

        // Bottom navigation -------------------------------------------------------------
        LinearLayout nav = new LinearLayout(this);
        nav.setGravity(Gravity.CENTER);
        GradientDrawable navBg = new GradientDrawable();
        navBg.setColor(WHITE);
        navBg.setCornerRadii(new float[]{dpf(26), dpf(26), dpf(26), dpf(26), 0, 0, 0, 0});
        nav.setBackground(navBg);
        nav.setElevation(dpf(16));
        tintShadow(nav, PRIMARY);
        navItems.clear();
        addNavItem(nav, "التقييمات", "ratings", R.drawable.ic_notification);
        addNavItem(nav, "المنتجات", "products", R.drawable.ic_restaurant);
        addNavItem(nav, "الأقسام", "categories", R.drawable.ic_apps);
        addNavItem(nav, "التواصل", "contact", R.drawable.ic_headset);
        shell.addView(nav, matchWrap());
        updateNav();

        setContentView(shell);
        shell.setOnApplyWindowInsetsListener((view, insets) -> {
            header.setPadding(dp(20), dp(14) + insets.getSystemWindowInsetTop(), dp(20), dp(22));
            nav.setPadding(dp(10), dp(8), dp(10), dp(8) + insets.getSystemWindowInsetBottom());
            return insets;
        });
        shell.requestApplyInsets();
        renderTab(true);
    }

    private void addNavItem(LinearLayout nav, String label, String tab, int iconRes) {
        LinearLayout item = new LinearLayout(this);
        item.setOrientation(LinearLayout.VERTICAL);
        item.setGravity(Gravity.CENTER_HORIZONTAL);
        item.setPadding(0, dp(4), 0, dp(2));
        item.setBackground(new RippleDrawable(ColorStateList.valueOf(0x225B3DF5), null,
                round(Color.BLACK, 16)));
        FrameLayout pill = new FrameLayout(this);
        ImageView glyph = new ImageView(this);
        glyph.setImageResource(iconRes);
        pill.addView(glyph, new FrameLayout.LayoutParams(dp(22), dp(22), Gravity.CENTER));
        item.addView(pill, new LinearLayout.LayoutParams(dp(60), dp(32)));
        TextView caption = text(label, 11, MUTED, false);
        caption.setGravity(Gravity.CENTER);
        item.addView(caption, spaced(matchWrap(), 3));
        nav.addView(item, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1));
        navItems.put(tab, new View[]{pill, glyph, caption});
        item.setOnClickListener(view -> {
            if (tab.equals(activeTab)) return;
            activeTab = tab;
            updateNav();
            if (scroll != null) scroll.scrollTo(0, 0);
            renderTab(true);
        });
    }

    private void updateNav() {
        for (Map.Entry<String, View[]> entry : navItems.entrySet()) {
            boolean selected = entry.getKey().equals(activeTab);
            View[] views = entry.getValue();
            views[0].setBackground(selected ? round(TINT, 16) : null);
            ((ImageView) views[1]).setImageTintList(ColorStateList.valueOf(selected ? PRIMARY : MUTED));
            TextView caption = (TextView) views[2];
            caption.setTextColor(selected ? PRIMARY : MUTED);
            caption.setTypeface(selected ? fontBold : fontMedium);
        }
    }

    private void updatePushChip() {
        if (pushChipText == null || pushChipDot == null) return;
        String label;
        int dot;
        if (!pushClientReady) {
            label = "الإشعارات غير مفعّلة";
            dot = 0xFFFB7185;
        } else if (pushRegistrationComplete) {
            label = "الإشعارات مفعّلة";
            dot = 0xFF34D399;
        } else if (!pushRegistrationMessage.isEmpty()) {
            label = "تعذر تفعيل الإشعارات";
            dot = 0xFFFB7185;
        } else {
            label = "جارٍ تفعيل الإشعارات";
            dot = 0xFFFBBF24;
        }
        pushChipText.setText(label);
        GradientDrawable circle = new GradientDrawable();
        circle.setShape(GradientDrawable.OVAL);
        circle.setColor(dot);
        pushChipDot.setBackground(circle);
    }

    private void renderTab() {
        renderTab(false);
    }

    private void renderTab(boolean animate) {
        if (content == null) return;
        stopSkeletons();
        content.removeAllViews();
        productResults = null;
        productResultsTitle = null;
        if ("ratings".equals(activeTab)) renderRatings();
        else if ("products".equals(activeTab)) renderProducts();
        else if ("categories".equals(activeTab)) renderCategories();
        else renderContact();
        if (animate) animateContent();
    }

    private void animateContent() {
        for (int i = 0; i < content.getChildCount(); i++) {
            View child = content.getChildAt(i);
            child.setAlpha(0f);
            child.setTranslationY(dp(16));
            child.animate().alpha(1f).translationY(0f)
                    .setStartDelay(Math.min(i, 9) * 45L).setDuration(340)
                    .setInterpolator(new DecelerateInterpolator(1.6f)).start();
        }
    }

    // ---- Ratings -------------------------------------------------------------------------

    private void renderRatings() {
        if (!ratingsLoaded) {
            addSkeletons(new int[]{150, 112, 112, 112});
            return;
        }
        boolean hasBanner = false;
        if (!pushClientReady) {
            content.addView(banner("الإشعار الفوري غير مفعّل: يلزم إعداد Firebase للتطبيق والسيرفر."),
                    matchWrap());
            hasBanner = true;
        } else if (!pushRegistrationComplete && !pushRegistrationMessage.isEmpty()) {
            content.addView(banner("تعذر تفعيل الإشعارات الفورية: " + pushRegistrationMessage),
                    matchWrap());
            hasBanner = true;
        }
        double average = 0;
        int[] counts = new int[6];
        for (JSONObject rating : ratings) {
            average += rating.optDouble("stars", 0);
            int value = Math.max(0, Math.min(5, rating.optInt("stars", 0)));
            counts[value]++;
        }
        if (!ratings.isEmpty()) average /= ratings.size();

        LinearLayout summary = card();
        summary.setOrientation(LinearLayout.HORIZONTAL);
        summary.setGravity(Gravity.CENTER_VERTICAL);
        summary.setPadding(dp(20), dp(20), dp(20), dp(20));
        LinearLayout scoreBox = new LinearLayout(this);
        scoreBox.setOrientation(LinearLayout.VERTICAL);
        scoreBox.setGravity(Gravity.CENTER_HORIZONTAL);
        TextView score = text(String.format(Locale.US, "%.1f", average), 44, INK, true);
        score.setTypeface(fontExtra);
        score.setGravity(Gravity.CENTER);
        scoreBox.addView(score);
        TextView averageStars = stars((int) Math.round(average), 16);
        averageStars.setGravity(Gravity.CENTER);
        scoreBox.addView(averageStars, spaced(matchWrap(), 2));
        TextView count = text(ratings.size() + " تقييم", 12, MUTED, false);
        count.setGravity(Gravity.CENTER);
        scoreBox.addView(count, spaced(matchWrap(), 6));
        summary.addView(scoreBox, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT));
        View divider = new View(this);
        divider.setBackgroundColor(LINE);
        LinearLayout.LayoutParams dividerParams = new LinearLayout.LayoutParams(dp(1), dp(88));
        dividerParams.setMarginStart(dp(18));
        dividerParams.setMarginEnd(dp(18));
        summary.addView(divider, dividerParams);
        LinearLayout bars = new LinearLayout(this);
        bars.setOrientation(LinearLayout.VERTICAL);
        for (int star = 5; star >= 1; star--) {
            bars.addView(barRow(star, counts[star], ratings.size()), spaced(matchWrap(), star == 5 ? 0 : 7));
        }
        summary.addView(bars, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1));
        content.addView(summary, spaced(matchWrap(), hasBanner ? 14 : 0));
        content.addView(sectionTitle("آخر تقييمات العملاء"), spaced(matchWrap(), 24));

        if (ratings.isEmpty()) {
            content.addView(emptyState("لا توجد تقييمات حتى الآن", R.drawable.ic_notification),
                    spaced(matchWrap(), 12));
            return;
        }
        for (JSONObject rating : ratings) {
            LinearLayout item = card();
            String name = rating.optString("customerName", "عميل");
            LinearLayout top = new LinearLayout(this);
            top.setGravity(Gravity.CENTER_VERTICAL);
            top.addView(avatar(name, 46, true), new LinearLayout.LayoutParams(dp(46), dp(46)));
            LinearLayout who = new LinearLayout(this);
            who.setOrientation(LinearLayout.VERTICAL);
            who.addView(text(name, 16, INK, true));
            String created = rating.optString("createdAt", "");
            if (created.length() >= 10 && created.charAt(4) == '-') {
                who.addView(text(created.substring(0, 10), 11, MUTED, false), spaced(matchWrap(), 1));
            }
            LinearLayout.LayoutParams whoParams = new LinearLayout.LayoutParams(
                    0, ViewGroup.LayoutParams.WRAP_CONTENT, 1);
            whoParams.setMarginStart(dp(12));
            top.addView(who, whoParams);
            top.addView(stars(rating.optInt("stars", 0), 15), wrapContent());
            item.addView(top, matchWrap());

            String comment = rating.optString("comment", "");
            TextView commentView = text(comment.isEmpty() ? "بدون تعليق" : comment, 14,
                    comment.isEmpty() ? 0xFF9A98B5 : INK, false);
            commentView.setLineSpacing(0, 1.15f);
            commentView.setPadding(dp(14), dp(12), dp(14), dp(12));
            commentView.setBackground(round(FIELD, 14));
            item.addView(commentView, spaced(matchWrap(), 12));

            String phone = rating.optString("customerPhone", "");
            String ratingId = rating.optString("_id", "");
            if (!comment.trim().isEmpty() && !ratingId.isEmpty()) {
                boolean commentVisible = rating.optBoolean("isCommentVisible", true);
                TextView visibility = chip(
                        commentVisible ? "إخفاء التعليق من الموقع" : "إظهار التعليق على الموقع",
                        commentVisible ? WARN_TINT : SUCCESS_TINT,
                        commentVisible ? WARN : SUCCESS);
                visibility.setContentDescription(commentVisible
                        ? "التعليق ظاهر على الموقع. اضغط لإخفائه"
                        : "التعليق مخفي من الموقع. اضغط لإظهاره");
                visibility.setBackground(new RippleDrawable(
                        ColorStateList.valueOf(0x22000000),
                        round(commentVisible ? WARN_TINT : SUCCESS_TINT, 11),
                        round(Color.BLACK, 11)));
                visibility.setOnClickListener(view -> updateRatingCommentVisibility(
                        rating, !commentVisible, visibility));
                item.addView(visibility, spaced(wrapContent(), 10));
            }
            if (!phone.isEmpty() || !ratingId.isEmpty()) {
                LinearLayout actions = new LinearLayout(this);
                actions.setGravity(Gravity.CENTER_VERTICAL);
                if (!phone.isEmpty()) {
                    LinearLayout phonePill = pill(R.drawable.ic_phone, phone, PRIMARY, TINT);
                    actions.addView(phonePill, wrapContent());
                    phonePill.setOnClickListener(view -> openUrl("tel:" + phone));
                }
                actions.addView(new View(this), new LinearLayout.LayoutParams(0, 1, 1));
                if (!ratingId.isEmpty()) {
                    ImageView delete = iconCircle(R.drawable.ic_delete, DANGER, DANGER_TINT, 40, 10);
                    delete.setContentDescription("حذف التقييم");
                    actions.addView(delete, new LinearLayout.LayoutParams(dp(40), dp(40)));
                    delete.setOnClickListener(view -> confirmDeleteRating(rating, ratingId));
                }
                item.addView(actions, spaced(matchWrap(), 12));
            }
            content.addView(item, spaced(matchWrap(), 12));
        }
    }

    private View barRow(int star, int count, int total) {
        LinearLayout row = new LinearLayout(this);
        row.setGravity(Gravity.CENTER_VERTICAL);
        TextView label = text(String.valueOf(star), 12, MUTED, true);
        row.addView(label, new LinearLayout.LayoutParams(dp(14), ViewGroup.LayoutParams.WRAP_CONTENT));
        LinearLayout track = new LinearLayout(this);
        track.setBackground(round(0xFFEFEDF8, 4));
        track.setClipToOutline(true);
        if (count > 0) {
            View fill = new View(this);
            fill.setBackground(round(GOLD, 4));
            track.addView(fill, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.MATCH_PARENT, count));
        }
        if (total - count > 0) {
            track.addView(new View(this), new LinearLayout.LayoutParams(
                    0, ViewGroup.LayoutParams.MATCH_PARENT, total - count));
        }
        LinearLayout.LayoutParams trackParams = new LinearLayout.LayoutParams(0, dp(8), 1);
        trackParams.setMarginStart(dp(8));
        trackParams.setMarginEnd(dp(8));
        row.addView(track, trackParams);
        TextView number = text(String.valueOf(count), 11, MUTED, false);
        number.setGravity(Gravity.CENTER);
        row.addView(number, new LinearLayout.LayoutParams(dp(22), ViewGroup.LayoutParams.WRAP_CONTENT));
        return row;
    }

    private void confirmDeleteRating(JSONObject rating, String ratingId) {
        showDialog(dialog()
                .setTitle("حذف التقييم")
                .setMessage("هل تريد حذف هذا التقييم؟ لا يمكن التراجع عن هذا الإجراء.")
                .setNegativeButton("إلغاء", null)
                .setPositiveButton("حذف", (dialog, which) -> doAsync(
                        () -> requestJson(apiBase, "/api/v1/ratings/" + Uri.encode(ratingId),
                                "DELETE", token, null),
                        response -> {
                            ratings.remove(rating);
                            if ("ratings".equals(activeTab)) renderTab();
                            toast(response.optString("message", "تم حذف التقييم"));
                        }, this::toast))
                .create());
    }

    private void updateRatingCommentVisibility(JSONObject rating, boolean isVisible, View action) {
        String ratingId = rating.optString("_id", "");
        if (ratingId.isEmpty()) {
            toast("تعذر تحديد التقييم");
            return;
        }
        action.setEnabled(false);
        action.setAlpha(0.55f);
        doAsync(() -> {
            JSONObject payload = new JSONObject();
            payload.put("isCommentVisible", isVisible);
            return requestJson(apiBase,
                    "/api/v1/ratings/" + Uri.encode(ratingId) + "/comment-visibility",
                    "PATCH", token, payload);
        }, response -> {
            try {
                rating.put("isCommentVisible", isVisible);
            } catch (Exception exception) {
                Log.e("iMenuOwner", "Could not update comment visibility locally", exception);
            }
            if ("ratings".equals(activeTab)) renderTab();
            toast(isVisible ? "تم إظهار التعليق على الموقع" : "تم إخفاء التعليق من الموقع");
        }, message -> {
            action.setEnabled(true);
            action.setAlpha(1f);
            toast(message);
        });
    }

    private void confirmLogout() {
        showDialog(dialog()
                .setTitle("تسجيل الخروج")
                .setMessage("هل تريد تسجيل الخروج من حساب المالك؟")
                .setNegativeButton("إلغاء", null)
                .setPositiveButton("تسجيل خروج", (dialog, which) -> logout())
                .create());
    }

    // ---- Products / categories -----------------------------------------------------------

    private void renderProducts() {
        Button add = iconButton("إضافة منتج", R.drawable.ic_add);
        content.addView(add, matchWrap());
        add.setOnClickListener(view -> showAddProductDialog());
        if (!productsLoaded) {
            content.addView(new View(this), new LinearLayout.LayoutParams(1, dp(18)));
            addSkeletons(new int[]{104, 104, 104});
            return;
        }

        if (!selectedProductCategory.isEmpty()) {
            LinearLayout categoryFilter = new LinearLayout(this);
            categoryFilter.setGravity(Gravity.CENTER_VERTICAL);
            TextView label = text("القسم: " + selectedProductCategory, 13, MUTED, true);
            categoryFilter.addView(label, new LinearLayout.LayoutParams(
                    0, ViewGroup.LayoutParams.WRAP_CONTENT, 1));
            LinearLayout clearFilter = pill(R.drawable.ic_apps, "كل المنتجات", PRIMARY, TINT);
            clearFilter.setOnClickListener(view -> {
                selectedProductCategory = "";
                visibleProductCount = PRODUCT_BATCH_SIZE;
                renderTab();
            });
            categoryFilter.addView(clearFilter, wrapContent());
            content.addView(categoryFilter, spaced(matchWrap(), 14));
        }

        EditText search = input("ابحث باسم المنتج أو القسم", InputType.TYPE_CLASS_TEXT);
        content.addView(search, spaced(matchWrap(), 14));
        search.setText(productSearchQuery);
        productResultsTitle = text("", 18, INK, true);
        productResultsTitle.setTypeface(fontExtra);
        content.addView(productResultsTitle, spaced(matchWrap(), 20));
        productResults = new LinearLayout(this);
        productResults.setOrientation(LinearLayout.VERTICAL);
        content.addView(productResults, matchWrap());
        search.addTextChangedListener(new TextWatcher() {
            @Override
            public void beforeTextChanged(CharSequence value, int start, int count, int after) {}

            @Override
            public void onTextChanged(CharSequence value, int start, int before, int count) {
                productSearchQuery = value.toString();
                visibleProductCount = PRODUCT_BATCH_SIZE;
                renderProductItems();
            }

            @Override
            public void afterTextChanged(Editable value) {}
        });
        renderProductItems();
    }

    private void renderProductItems() {
        if (productResults == null || productResultsTitle == null) return;
        productResults.removeAllViews();
        String query = productSearchQuery.trim().toLowerCase(Locale.ROOT);
        List<JSONObject> filteredProducts = new ArrayList<>();
        for (JSONObject product : products) {
            String category = product.optString("category", "").trim();
            if (!selectedProductCategory.isEmpty()
                    && !selectedProductCategory.equalsIgnoreCase(category)) continue;
            if (!matchesProductSearch(product, category, query)) continue;
            filteredProducts.add(product);
        }

        String heading = selectedProductCategory.isEmpty()
                ? "منتجات المنيو" : "منتجات قسم " + selectedProductCategory;
        productResultsTitle.setText(heading + " (" + filteredProducts.size() + ")");
        if (filteredProducts.isEmpty()) {
            String message = query.isEmpty()
                    ? (products.isEmpty() ? "لا توجد منتجات" : "لا توجد منتجات في هذا القسم")
                    : "لا توجد منتجات مطابقة لبحثك";
            productResults.addView(emptyState(message, R.drawable.ic_restaurant), matchWrap());
            return;
        }

        int shownCount = Math.min(visibleProductCount, filteredProducts.size());
        for (int productIndex = 0; productIndex < shownCount; productIndex++) {
            JSONObject product = filteredProducts.get(productIndex);
            LinearLayout item = card();
            String name = productDisplayName(product);
            JSONArray sizes = product.optJSONArray("sizes");
            String priceValue = product.optString("price", "0");
            if (sizes != null && sizes.length() > 0) {
                JSONObject firstSize = sizes.optJSONObject(0);
                if (firstSize != null) priceValue = firstSize.optString("price", priceValue);
            }
            LinearLayout row = new LinearLayout(this);
            row.setGravity(Gravity.CENTER_VERTICAL);
            row.addView(avatar(name, 54, false), new LinearLayout.LayoutParams(dp(54), dp(54)));
            LinearLayout info = new LinearLayout(this);
            info.setOrientation(LinearLayout.VERTICAL);
            info.addView(text(name, 16, INK, true));
            if (!product.optString("category", "").isEmpty()) {
                info.addView(chip(product.optString("category"), TINT, PRIMARY),
                        spaced(wrapContent(), 6));
            }
            LinearLayout.LayoutParams infoParams = new LinearLayout.LayoutParams(
                    0, ViewGroup.LayoutParams.WRAP_CONTENT, 1);
            infoParams.setMarginStart(dp(12));
            infoParams.setMarginEnd(dp(8));
            row.addView(info, infoParams);
            LinearLayout priceBox = new LinearLayout(this);
            priceBox.setOrientation(LinearLayout.VERTICAL);
            priceBox.setGravity(Gravity.CENTER_HORIZONTAL);
            if (sizes != null && sizes.length() > 1) {
                TextView from = text("يبدأ من", 10, MUTED, false);
                from.setGravity(Gravity.CENTER);
                priceBox.addView(from);
            }
            TextView price = text(priceValue, 21, PRIMARY, true);
            price.setTypeface(fontExtra);
            price.setGravity(Gravity.CENTER);
            TextView currency = text("ج.م", 11, MUTED, true);
            currency.setGravity(Gravity.CENTER);
            priceBox.addView(price);
            priceBox.addView(currency);
            row.addView(priceBox, wrapContent());
            item.addView(row, matchWrap());

            LinearLayout edit = pill(R.drawable.ic_edit, "تعديل المنتج", PRIMARY, TINT);
            item.addView(edit, spaced(wrapContent(), 14));
            edit.setOnClickListener(view -> showProductEditorDialog(product));

            boolean isAvailable = product.optBoolean("isAvailable", true);
            int actionColor = isAvailable ? DANGER : SUCCESS;
            int actionBackground = isAvailable ? DANGER_TINT : SUCCESS_TINT;
            TextView availability = chip(
                    isAvailable ? "إخفاء من المنيو" : "إظهار في المنيو",
                    actionBackground, actionColor);
            availability.setContentDescription(isAvailable
                    ? "المنتج ظاهر. اضغط لإخفائه من المنيو"
                    : "المنتج مخفي. اضغط لإظهاره في المنيو");
            availability.setBackground(new RippleDrawable(
                    ColorStateList.valueOf(0x22000000),
                    round(actionBackground, 11), round(Color.BLACK, 11)));
            availability.setOnClickListener(view ->
                    updateProductAvailability(product, !isAvailable, availability));
            item.addView(availability, spaced(wrapContent(), 8));

            LinearLayout delete = pill(R.drawable.ic_delete, "حذف المنتج", DANGER, DANGER_TINT);
            item.addView(delete, spaced(wrapContent(), 8));
            delete.setOnClickListener(view -> confirmDeleteProduct(product));
            productResults.addView(item, spaced(matchWrap(), 12));
        }

        if (shownCount < filteredProducts.size()) {
            int remaining = filteredProducts.size() - shownCount;
            TextView more = chip("عرض المزيد من المنتجات (" + remaining + ")", TINT, PRIMARY);
            more.setGravity(Gravity.CENTER);
            more.setBackground(new RippleDrawable(
                    ColorStateList.valueOf(0x22000000), round(TINT, 12), round(Color.BLACK, 12)));
            more.setOnClickListener(view -> {
                visibleProductCount = Math.min(
                        visibleProductCount + PRODUCT_BATCH_SIZE, filteredProducts.size());
                renderProductItems();
            });
            productResults.addView(more, spaced(matchWrap(), 12));
        }
    }

    private boolean matchesProductSearch(JSONObject product, String category, String query) {
        if (query.isEmpty()) return true;
        JSONObject name = product.optJSONObject("name");
        String arabicName = name == null
                ? product.optString("name", "") : name.optString("ar", "");
        String englishName = name == null ? "" : name.optString("en", "");
        return arabicName.toLowerCase(Locale.ROOT).contains(query)
                || englishName.toLowerCase(Locale.ROOT).contains(query)
                || category.toLowerCase(Locale.ROOT).contains(query);
    }

    private String productDisplayName(JSONObject product) {
        JSONObject name = product.optJSONObject("name");
        return name == null ? product.optString("name", "منتج")
                : name.optString("ar", name.optString("en", "منتج"));
    }

    private void updateProductAvailability(JSONObject product, boolean isAvailable, View action) {
        String productId = product.optString("_id", "");
        if (productId.isEmpty()) {
            toast("تعذر تحديد المنتج");
            return;
        }
        action.setEnabled(false);
        action.setAlpha(0.55f);
        doAsync(() -> {
            JSONObject payload = new JSONObject();
            payload.put("isAvailable", isAvailable);
            return requestJson(apiBase, "/api/v1/products/" + Uri.encode(productId),
                    "PATCH", token, payload);
        }, response -> {
            JSONObject data = response.optJSONObject("data");
            JSONObject updatedProduct = data == null ? null : data.optJSONObject("product");
            boolean found = false;
            if (updatedProduct != null) {
                for (int i = 0; i < products.size(); i++) {
                    if (productId.equals(products.get(i).optString("_id", ""))) {
                        products.set(i, updatedProduct);
                        found = true;
                        break;
                    }
                }
            }
            if (!found) {
                loadProducts();
            } else if ("products".equals(activeTab)) {
                renderTab();
            }
            toast(isAvailable ? "تم إظهار المنتج في المنيو" : "تم إخفاء المنتج من المنيو");
        }, message -> {
            action.setEnabled(true);
            action.setAlpha(1f);
            toast(message);
        });
    }

    private void renderCategories() {
        Button add = iconButton("إضافة قسم", R.drawable.ic_add);
        content.addView(add, matchWrap());
        add.setOnClickListener(view -> showAddCategoryDialog());
        if (!categoriesLoaded) {
            content.addView(new View(this), new LinearLayout.LayoutParams(1, dp(18)));
            addSkeletons(new int[]{82, 82, 82});
            return;
        }
        content.addView(sectionTitle("أقسام المنيو (" + categories.size() + ")"),
                spaced(matchWrap(), 24));
        if (categories.isEmpty()) {
            content.addView(emptyState("لا توجد أقسام", R.drawable.ic_apps), spaced(matchWrap(), 12));
            return;
        }
        for (JSONObject category : categories) {
            LinearLayout item = card();
            item.setOrientation(LinearLayout.HORIZONTAL);
            item.setGravity(Gravity.CENTER_VERTICAL);
            item.addView(iconCircle(R.drawable.ic_apps, PRIMARY, TINT, 48, 12),
                    new LinearLayout.LayoutParams(dp(48), dp(48)));
            LinearLayout info = new LinearLayout(this);
            info.setOrientation(LinearLayout.VERTICAL);
            String categoryName = category.optString("name", "").trim();
            info.addView(text(categoryName.isEmpty() ? "قسم" : categoryName, 16, INK, true));
            LinearLayout.LayoutParams infoParams = new LinearLayout.LayoutParams(
                    0, ViewGroup.LayoutParams.WRAP_CONTENT, 1);
            infoParams.setMarginStart(dp(14));
            item.addView(info, infoParams);
            item.addView(chip(category.optInt("productCount", 0) + " منتج", TINT, PRIMARY), wrapContent());
            item.setOnClickListener(view -> {
                if (categoryName.isEmpty()) {
                    toast("اسم القسم غير متوفر");
                    return;
                }
                selectedProductCategory = categoryName;
                productSearchQuery = "";
                visibleProductCount = PRODUCT_BATCH_SIZE;
                activeTab = "products";
                updateNav();
                if (scroll != null) scroll.scrollTo(0, 0);
                renderTab(true);
            });
            content.addView(item, spaced(matchWrap(), 12));
        }
    }

    // ---- Contact -------------------------------------------------------------------------

    private void renderContact() {
        LinearLayout hero = new LinearLayout(this);
        hero.setOrientation(LinearLayout.VERTICAL);
        hero.setPadding(dp(20), dp(20), dp(20), dp(20));
        GradientDrawable heroBg = new GradientDrawable(GradientDrawable.Orientation.TL_BR,
                new int[]{0xFF2A1A9A, PRIMARY, VIOLET});
        heroBg.setCornerRadius(dpf(22));
        hero.setBackground(heroBg);
        hero.setElevation(dpf(6));
        tintShadow(hero, PRIMARY);
        TextView heroTitle = text("فريق الدعم الفني بجانبك", 18, WHITE, true);
        heroTitle.setTypeface(fontExtra);
        hero.addView(heroTitle);
        hero.addView(text("تواصل معنا في أي وقت لو احتجت مساعدة في حسابك أو منيو مطعمك.", 13,
                0xCCFFFFFF, false), spaced(matchWrap(), 6));
        content.addView(hero, matchWrap());

        content.addView(sectionTitle("تواصل مع الدعم الفني"), spaced(matchWrap(), 24));
        boolean hasContact = false;
        JSONArray phones = siteContacts == null ? null : siteContacts.optJSONArray("phones");
        if (phones != null) {
            for (int i = 0; i < phones.length(); i++) {
                JSONObject phone = phones.optJSONObject(i);
                if (phone == null) continue;
                String number = phone.optString("number", "");
                if (number.isEmpty()) continue;
                hasContact = true;
                addContactCard(R.drawable.ic_phone, SUCCESS, SUCCESS_TINT,
                        phone.optString("label", "اتصال بالدعم الفني"), number, "tel:" + number);
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
                addContactCard(R.drawable.ic_chat, 0xFF1FAF5A, SUCCESS_TINT,
                        phone.optString("label", "واتساب الدعم الفني"), number,
                        "https://wa.me/" + number.replaceAll("[^0-9]", ""));
            }
        }
        if (!hasContact) {
            content.addView(emptyState(
                    "بيانات الدعم الفني غير متاحة حالياً. يرجى إضافتها من إعدادات الموقع.",
                    R.drawable.ic_headset), spaced(matchWrap(), 12));
        }

        String facebook = siteContacts == null ? "" : siteContacts.optString("facebook", "");
        JSONObject restaurantLinks = restaurant == null ? null : restaurant.optJSONObject("socialLinks");
        if (facebook.isEmpty() && restaurantLinks != null) {
            facebook = restaurantLinks.optString("facebook", "");
        }
        content.addView(sectionTitle("صفحة فيسبوك"), spaced(matchWrap(), 24));
        if (!facebook.isEmpty()) {
            addContactCard(R.drawable.ic_link, 0xFF1877F2, 0xFFE6F0FF, "فتح صفحة فيسبوك",
                    facebook, validWebUrl(facebook));
        } else {
            content.addView(emptyState("رابط صفحة فيسبوك غير مسجل في إعدادات الموقع.", R.drawable.ic_link),
                    spaced(matchWrap(), 12));
        }

        JSONObject contactInfo = restaurant == null ? null : restaurant.optJSONObject("contactInfo");
        String restaurantPhone = contactInfo == null ? "" : contactInfo.optString("phone", "");
        String whatsapp = contactInfo == null ? "" : contactInfo.optString("whatsapp", "");
        if (!restaurantPhone.isEmpty() || !whatsapp.isEmpty()) {
            content.addView(sectionTitle("بيانات مطعمك"), spaced(matchWrap(), 24));
            if (!restaurantPhone.isEmpty()) {
                addContactCard(R.drawable.ic_phone, PRIMARY, TINT, "الاتصال بالمطعم",
                        restaurantPhone, "tel:" + restaurantPhone);
            }
            if (!whatsapp.isEmpty()) {
                addContactCard(R.drawable.ic_chat, PRIMARY, TINT, "واتساب المطعم", whatsapp,
                        "https://wa.me/" + whatsapp.replaceAll("[^0-9]", ""));
            }
        }
    }

    private void addContactCard(int iconRes, int iconColor, int iconBg, String title, String value,
                                String link) {
        LinearLayout item = card();
        item.setOrientation(LinearLayout.HORIZONTAL);
        item.setGravity(Gravity.CENTER_VERTICAL);
        item.addView(iconCircle(iconRes, iconColor, iconBg, 46, 12),
                new LinearLayout.LayoutParams(dp(46), dp(46)));
        LinearLayout info = new LinearLayout(this);
        info.setOrientation(LinearLayout.VERTICAL);
        info.addView(text(title, 15, INK, true));
        info.addView(text(value, 13, MUTED, false), spaced(matchWrap(), 3));
        LinearLayout.LayoutParams infoParams = new LinearLayout.LayoutParams(
                0, ViewGroup.LayoutParams.WRAP_CONTENT, 1);
        infoParams.setMarginStart(dp(14));
        item.addView(info, infoParams);
        ImageView chevron = new ImageView(this);
        chevron.setImageDrawable(icon(R.drawable.ic_chevron, 0xFFB5B2CE));
        item.addView(chevron, new LinearLayout.LayoutParams(dp(22), dp(22)));
        makePressable(item, WHITE, LINE, 20);
        item.setOnClickListener(view -> openUrl(link));
        content.addView(item, spaced(matchWrap(), 12));
    }

    // ---- Data ----------------------------------------------------------------------------

    private void fetchRestaurant(Runnable after) {
        doAsync(() -> requestJson(apiBase, "/api/v1/restaurants/my-restaurant", "GET", token, null),
                response -> {
                    JSONObject data = response.optJSONObject("data");
                    restaurant = data == null ? null : data.optJSONObject("restaurant");
                    if (restaurant == null) {
                        toast("تعذر العثور على بيانات المطعم");
                        markAllLoaded();
                        return;
                    }
                    restaurantId = restaurant.optString("_id", "");
                    TextView name = root.findViewWithTag("restaurant_name");
                    if (name != null) name.setText(restaurant.optString("restaurantName", "مطعمي"));
                    after.run();
                }, message -> {
                    toast(message);
                    if (message.contains("401") || message.contains("403")) logout();
                    else markAllLoaded();
                });
    }

    private void markAllLoaded() {
        ratingsLoaded = true;
        productsLoaded = true;
        categoriesLoaded = true;
        renderTab();
    }

    private void loadRatings() {
        doAsync(() -> requestJson(apiBase, "/api/v1/ratings/list", "GET", token, null), response -> {
            boolean first = !ratingsLoaded;
            ratings.clear();
            JSONArray list = response.optJSONObject("data") == null ? null
                    : response.optJSONObject("data").optJSONArray("ratings");
            if (list != null) {
                for (int i = 0; i < list.length(); i++) {
                    JSONObject rating = list.optJSONObject(i);
                    if (rating != null) ratings.add(rating);
                }
            }
            ratingsLoaded = true;
            if ("ratings".equals(activeTab)) renderTab(first);
        }, message -> {
            toast(message);
            ratingsLoaded = true;
            if ("ratings".equals(activeTab)) renderTab();
        });
    }

    private void loadCategories(Runnable after) {
        if (restaurantId.isEmpty()) return;
        doAsync(() -> requestJson(apiBase, "/api/v1/categories/" + restaurantId, "GET", token, null),
                response -> {
                    boolean first = !categoriesLoaded;
                    categories.clear();
                    JSONObject data = response.optJSONObject("data");
                    JSONArray list = data == null ? null : data.optJSONArray("categories");
                    if (list != null) {
                        for (int i = 0; i < list.length(); i++) {
                            JSONObject category = list.optJSONObject(i);
                            if (category != null) categories.add(category);
                        }
                    }
                    categoriesLoaded = true;
                    if ("categories".equals(activeTab)) renderTab(first);
                    else if ("products".equals(activeTab)) renderTab();
                    if (after != null) after.run();
                }, message -> {
                    toast(message);
                    categoriesLoaded = true;
                    if ("categories".equals(activeTab)) renderTab();
                });
    }

    private void loadProducts() {
        if (restaurantId.isEmpty()) return;
        doAsync(() -> requestJson(apiBase,
                "/api/v1/products/restaurant/" + restaurantId + "?compact=true",
                "GET", token, null), response -> {
            boolean first = !productsLoaded;
            products.clear();
            JSONObject data = response.optJSONObject("data");
            JSONArray list = data == null ? null : data.optJSONArray("products");
            if (list != null) {
                for (int i = 0; i < list.length(); i++) {
                    JSONObject product = list.optJSONObject(i);
                    if (product != null) products.add(product);
                }
            }
            productsLoaded = true;
            if ("products".equals(activeTab)) renderTab(first);
        }, message -> {
            toast(message);
            productsLoaded = true;
            if ("products".equals(activeTab)) renderTab();
        });
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
        loadCategories(null);
        loadProducts();
        loadContacts();
        toast("جاري تحديث البيانات");
    }

    // ---- Dialogs -------------------------------------------------------------------------

    private AlertDialog.Builder dialog() {
        return new AlertDialog.Builder(this, R.style.AppDialog);
    }

    private void showDialog(AlertDialog dialog) {
        dialog.show();
        Window window = dialog.getWindow();
        if (window != null) window.getDecorView().setLayoutDirection(View.LAYOUT_DIRECTION_RTL);
    }

    private void showProductEditorDialog(JSONObject product) {
        String productId = product.optString("_id", "");
        if (productId.isEmpty()) {
            toast("تعذر تحديد المنتج");
            return;
        }
        LinearLayout form = dialogForm();
        EditText name = input("اسم المنتج", InputType.TYPE_CLASS_TEXT);
        name.setText(productDisplayName(product));
        form.addView(text("اسم المنتج", 13, MUTED, true));
        form.addView(name, spaced(matchWrap(), 6));

        EditText basePrice = input("السعر بالجنيه", InputType.TYPE_CLASS_NUMBER
                | InputType.TYPE_NUMBER_FLAG_DECIMAL);
        basePrice.setText(product.optString("price", ""));
        LinearLayout basePriceBlock = new LinearLayout(this);
        basePriceBlock.setOrientation(LinearLayout.VERTICAL);
        basePriceBlock.addView(text("السعر الأساسي", 13, MUTED, true));
        basePriceBlock.addView(basePrice, spaced(matchWrap(), 6));
        form.addView(basePriceBlock, spaced(matchWrap(), 14));

        List<SizeEditorRow> sizeRows = new ArrayList<>();
        LinearLayout sizesContainer = new LinearLayout(this);
        sizesContainer.setOrientation(LinearLayout.VERTICAL);
        form.addView(sectionTitle("أحجام المنتج"), spaced(matchWrap(), 16));
        form.addView(sizesContainer, spaced(matchWrap(), 8));
        Button addSize = smallButton("إضافة حجم", R.drawable.ic_add);
        form.addView(addSize, spaced(wrapContent(), 8));
        addSize.setOnClickListener(view ->
                addSizeEditorRow(sizesContainer, sizeRows, null, basePriceBlock));

        JSONArray existingSizes = product.optJSONArray("sizes");
        if (existingSizes != null) {
            for (int i = 0; i < existingSizes.length(); i++) {
                JSONObject size = existingSizes.optJSONObject(i);
                if (size != null) addSizeEditorRow(sizesContainer, sizeRows, size, basePriceBlock);
            }
        }

        ScrollView scrollForm = new ScrollView(this);
        scrollForm.setFillViewport(false);
        scrollForm.addView(form);
        activeDialog = dialog()
                .setTitle("تعديل المنتج")
                .setView(scrollForm)
                .setNegativeButton("إلغاء", null)
                .setPositiveButton("حفظ", null)
                .create();
        activeDialog.setOnShowListener(dialog -> activeDialog.getButton(AlertDialog.BUTTON_POSITIVE)
                .setOnClickListener(view -> {
                    try {
                        String productName = name.getText().toString().trim();
                        if (productName.isEmpty()) {
                            toast("اكتب اسم المنتج");
                            return;
                        }
                        JSONObject currentName = product.optJSONObject("name");
                        JSONObject updatedName = currentName == null
                                ? new JSONObject() : new JSONObject(currentName.toString());
                        updatedName.put("ar", productName);
                        if (currentName == null
                                || updatedName.optString("en", "").trim().isEmpty()) {
                            updatedName.put("en", productName);
                        }
                        Map<String, String> fields = new LinkedHashMap<>();
                        fields.put("name", updatedName.toString());
                        appendProductPriceFields(fields, basePrice, sizeRows, false);
                        activeDialog.dismiss();
                        updateMultipart("/api/v1/products/" + Uri.encode(productId),
                                "PATCH", fields, null, this::loadProducts);
                    } catch (Exception exception) {
                        toast(exception.getMessage());
                    }
                }));
        showDialog(activeDialog);
    }

    private void addSizeEditorRow(LinearLayout container, List<SizeEditorRow> sizeRows,
                                  JSONObject existingSize, View basePriceBlock) {
        LinearLayout row = new LinearLayout(this);
        row.setOrientation(LinearLayout.VERTICAL);
        row.setPadding(dp(10), dp(10), dp(10), dp(10));
        row.setBackground(round(FIELD, 16));

        LinearLayout heading = new LinearLayout(this);
        heading.setGravity(Gravity.CENTER_VERTICAL);
        EditText sizeName = input("اسم الحجم، مثلاً صغير أو كبير", InputType.TYPE_CLASS_TEXT);
        Button remove = smallButton("حذف الحجم", R.drawable.ic_delete);
        heading.addView(sizeName, new LinearLayout.LayoutParams(
                0, ViewGroup.LayoutParams.WRAP_CONTENT, 1));
        heading.addView(remove, spaced(wrapContent(), 8));
        row.addView(heading);

        LinearLayout prices = new LinearLayout(this);
        prices.setGravity(Gravity.CENTER_VERTICAL);
        EditText price = input("السعر", InputType.TYPE_CLASS_NUMBER
                | InputType.TYPE_NUMBER_FLAG_DECIMAL);
        EditText oldPrice = input("السعر القديم (اختياري)", InputType.TYPE_CLASS_NUMBER
                | InputType.TYPE_NUMBER_FLAG_DECIMAL);
        prices.addView(price, new LinearLayout.LayoutParams(
                0, ViewGroup.LayoutParams.WRAP_CONTENT, 1));
        LinearLayout.LayoutParams oldPriceParams = new LinearLayout.LayoutParams(
                0, ViewGroup.LayoutParams.WRAP_CONTENT, 1);
        oldPriceParams.setMarginStart(dp(8));
        prices.addView(oldPrice, oldPriceParams);
        row.addView(prices, spaced(matchWrap(), 8));

        if (existingSize != null) {
            sizeName.setText(existingSize.optString("name", ""));
            price.setText(existingSize.optString("price", ""));
            if (existingSize.optDouble("oldPrice", 0) > 0) {
                oldPrice.setText(existingSize.optString("oldPrice", ""));
            }
        }

        SizeEditorRow fields = new SizeEditorRow(row, sizeName, price, oldPrice);
        sizeRows.add(fields);
        container.addView(row, spaced(matchWrap(), 8));
        basePriceBlock.setVisibility(View.GONE);
        remove.setOnClickListener(view -> {
            sizeRows.remove(fields);
            container.removeView(fields.view);
            basePriceBlock.setVisibility(sizeRows.isEmpty() ? View.VISIBLE : View.GONE);
        });
    }

    private JSONArray buildProductSizes(List<SizeEditorRow> sizeRows) throws Exception {
        JSONArray sizes = new JSONArray();
        for (SizeEditorRow row : sizeRows) {
            String name = row.name.getText().toString().trim();
            if (name.isEmpty()) throw new Exception("اكتب اسم كل حجم");
            double price = Double.parseDouble(requirePrice(row.price));
            double oldPrice = optionalOldPrice(row.oldPrice, price);
            JSONObject size = new JSONObject();
            size.put("name", name);
            size.put("price", price);
            size.put("oldPrice", oldPrice);
            sizes.put(size);
        }
        return sizes;
    }

    private double optionalOldPrice(EditText field, double currentPrice) throws Exception {
        String value = field.getText().toString().trim();
        if (value.isEmpty()) return 0;
        try {
            double oldPrice = Double.parseDouble(value);
            if (!Double.isFinite(oldPrice) || oldPrice < 0) throw new NumberFormatException();
            return oldPrice > currentPrice ? oldPrice : 0;
        } catch (NumberFormatException exception) {
            throw new Exception("أدخل السعر القديم بشكل صحيح أو اتركه فارغاً");
        }
    }

    private void appendProductPriceFields(Map<String, String> fields, EditText basePrice,
                                         List<SizeEditorRow> sizeRows,
                                         boolean includeOldPriceForSingle) throws Exception {
        JSONArray sizes = buildProductSizes(sizeRows);
        if (sizes.length() == 0) {
            fields.put("price", requirePrice(basePrice));
            fields.put("sizes", "[]");
            if (includeOldPriceForSingle) fields.put("oldPrice", "0");
            return;
        }
        JSONObject firstSize = sizes.getJSONObject(0);
        fields.put("price", firstSize.optString("price"));
        fields.put("oldPrice", firstSize.optString("oldPrice", "0"));
        fields.put("sizes", sizes.toString());
    }

    private void confirmDeleteProduct(JSONObject product) {
        String productId = product.optString("_id", "");
        if (productId.isEmpty()) {
            toast("تعذر تحديد المنتج");
            return;
        }
        String name = productDisplayName(product);
        showDialog(dialog()
                .setTitle("حذف المنتج")
                .setMessage("هل تريد حذف \"" + name + "\"؟ لا يمكن التراجع عن هذا الإجراء.")
                .setNegativeButton("إلغاء", null)
                .setPositiveButton("حذف المنتج", (dialog, which) -> doAsync(
                        () -> requestJson(apiBase, "/api/v1/products/" + Uri.encode(productId),
                                "DELETE", token, null),
                        response -> {
                            products.remove(product);
                            renderTab();
                            loadCategories(null);
                            toast("تم حذف المنتج");
                        }, this::toast))
                .create());
    }

    private void showAddCategoryDialog() {
        selectedImage = null;
        LinearLayout form = dialogForm();
        EditText name = input("اسم القسم", InputType.TYPE_CLASS_TEXT);
        form.addView(name);
        Button imageButton = smallButton("اختيار صورة للقسم", R.drawable.ic_image);
        form.addView(imageButton, spaced(wrapContent(), 14));
        selectedImageLabel = text("", 12, MUTED, false);
        form.addView(selectedImageLabel, spaced(matchWrap(), 6));
        imageButton.setOnClickListener(view -> pickImage());
        activeDialog = dialog()
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
        showDialog(activeDialog);
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
        LinearLayout basePriceBlock = new LinearLayout(this);
        basePriceBlock.setOrientation(LinearLayout.VERTICAL);
        basePriceBlock.addView(text("السعر الأساسي", 13, MUTED, true));
        basePriceBlock.addView(price, spaced(matchWrap(), 6));
        List<SizeEditorRow> sizeRows = new ArrayList<>();
        LinearLayout sizesContainer = new LinearLayout(this);
        sizesContainer.setOrientation(LinearLayout.VERTICAL);
        Spinner categorySpinner = new Spinner(this);
        categorySpinner.setBackgroundResource(R.drawable.bg_spinner);
        categorySpinner.setPadding(dp(12), dp(10), dp(12), dp(10));
        List<String> categoryNames = new ArrayList<>();
        for (JSONObject category : categories) categoryNames.add(category.optString("name", ""));
        categorySpinner.setAdapter(new ArrayAdapter<>(this,
                android.R.layout.simple_spinner_dropdown_item, categoryNames));
        form.addView(name);
        form.addView(description, spaced(matchWrap(), 10));
        form.addView(basePriceBlock, spaced(matchWrap(), 10));
        form.addView(sectionTitle("أحجام المنتج (اختياري)"), spaced(matchWrap(), 14));
        form.addView(sizesContainer, spaced(matchWrap(), 8));
        Button addSize = smallButton("إضافة حجم", R.drawable.ic_add);
        form.addView(addSize, spaced(wrapContent(), 8));
        addSize.setOnClickListener(view ->
                addSizeEditorRow(sizesContainer, sizeRows, null, basePriceBlock));
        form.addView(text("القسم", 13, MUTED, true), spaced(matchWrap(), 14));
        form.addView(categorySpinner, spaced(matchWrap(), 6));
        Button imageButton = smallButton("اختيار صورة للمنتج", R.drawable.ic_image);
        form.addView(imageButton, spaced(wrapContent(), 14));
        selectedImageLabel = text("", 12, MUTED, false);
        form.addView(selectedImageLabel, spaced(matchWrap(), 6));
        imageButton.setOnClickListener(view -> pickImage());

        ScrollView scrollForm = new ScrollView(this);
        scrollForm.setFillViewport(false);
        scrollForm.addView(form);
        activeDialog = dialog()
                .setTitle("إضافة منتج جديد")
                .setView(scrollForm)
                .setNegativeButton("إلغاء", null)
                .setPositiveButton("إضافة", null)
                .create();
        activeDialog.setOnShowListener(dialog -> activeDialog.getButton(AlertDialog.BUTTON_POSITIVE)
                .setOnClickListener(view -> {
                    String productName = name.getText().toString().trim();
            if (productName.isEmpty()) {
                toast("اكتب اسم المنتج");
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
                    try {
                        appendProductPriceFields(fields, price, sizeRows, true);
                    } catch (Exception exception) {
                        toast(exception.getMessage());
                        return;
                    }
                    Uri image = selectedImage;
                    activeDialog.dismiss();
                    selectedImage = null;
                    updateMultipart("/api/v1/products", "POST", fields, image, () -> {
                        loadProducts();
                        loadCategories(null);
                    });
                }));
        showDialog(activeDialog);
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

    // ---- Push ----------------------------------------------------------------------------

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
        updatePushChip();
        FirebaseMessaging.getInstance().getToken().addOnCompleteListener(task -> {
            if (!task.isSuccessful() || task.getResult() == null) {
                pushRegistrationInProgress = false;
                pushRegistrationMessage = "تعذر الحصول على رمز Firebase لهذا الجهاز";
                Log.e("iMenuOwner", "Could not obtain an FCM registration token", task.getException());
                updatePushChip();
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
                        updatePushChip();
                        if ("ratings".equals(activeTab)) renderTab();
                    }, message -> {
                        pushRegistrationInProgress = false;
                        pushRegistrationMessage = message;
                        Log.e("iMenuOwner", "Could not register this device for push: " + message);
                        updatePushChip();
                        if ("ratings".equals(activeTab)) renderTab();
                    });
        });
    }

    private void logout() {
        sessionGeneration++;
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
        preferences.edit().remove("token").remove("fcm_token").remove("api_base").apply();
        token = "";
        restaurant = null;
        siteContacts = null;
        restaurantId = "";
        ratings.clear();
        products.clear();
        categories.clear();
        productSearchQuery = "";
        selectedProductCategory = "";
        visibleProductCount = PRODUCT_BATCH_SIZE;
        ratingsLoaded = false;
        productsLoaded = false;
        categoriesLoaded = false;
        pushRegistrationComplete = false;
        activeTab = "ratings";
        content = null;
        showLogin();
    }

    // ---- Networking (unchanged) ----------------------------------------------------------

    private void doAsync(Callable<JSONObject> work, Consumer<JSONObject> success,
                        Consumer<String> failure) {
        long requestGeneration = sessionGeneration;
        executor.execute(() -> {
            try {
                JSONObject response = work.call();
                runOnUiThread(() -> {
                    if (requestGeneration == sessionGeneration) success.accept(response);
                });
            } catch (Exception exception) {
                String message = exception.getMessage() == null
                        ? "تعذر الاتصال بالموقع" : exception.getMessage();
                runOnUiThread(() -> {
                    if (requestGeneration == sessionGeneration) failure.accept(message);
                });
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

    // ---- UI kit --------------------------------------------------------------------------

    private void loadFonts() {
        try {
            fontRegular = getResources().getFont(R.font.tajawal_regular);
            fontMedium = getResources().getFont(R.font.tajawal_medium);
            fontBold = getResources().getFont(R.font.tajawal_bold);
            fontExtra = getResources().getFont(R.font.tajawal_extrabold);
        } catch (RuntimeException exception) {
            Log.e("iMenuOwner", "Could not load Tajawal fonts", exception);
        }
    }

    private void setSystemBars(boolean lightNavigationIcons) {
        int flags = View.SYSTEM_UI_FLAG_LAYOUT_STABLE | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION;
        if (lightNavigationIcons && Build.VERSION.SDK_INT >= 26) {
            flags |= View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR;
        }
        getWindow().getDecorView().setSystemUiVisibility(flags);
    }

    private GradientDrawable round(int color, float radiusDp) {
        GradientDrawable drawable = new GradientDrawable();
        drawable.setColor(color);
        drawable.setCornerRadius(dpf(radiusDp));
        return drawable;
    }

    private Drawable icon(int resource, int color) {
        Drawable drawable = getDrawable(resource).mutate();
        drawable.setTint(color);
        return drawable;
    }

    private void tintShadow(View view, int color) {
        if (Build.VERSION.SDK_INT >= 28) {
            view.setOutlineAmbientShadowColor(color);
            view.setOutlineSpotShadowColor(color);
        }
    }

    private void makePressable(View view, int fill, int stroke, float radiusDp) {
        GradientDrawable background = round(fill, radiusDp);
        if (stroke != 0) background.setStroke(dp(1), stroke);
        view.setBackground(new RippleDrawable(ColorStateList.valueOf(0x225B3DF5), background,
                round(Color.BLACK, radiusDp)));
        view.setClickable(true);
    }

    private LinearLayout card() {
        LinearLayout card = new LinearLayout(this);
        card.setOrientation(LinearLayout.VERTICAL);
        card.setPadding(dp(16), dp(16), dp(16), dp(16));
        GradientDrawable background = round(WHITE, 22);
        background.setStroke(dp(1), LINE);
        card.setBackground(background);
        card.setElevation(dpf(3));
        tintShadow(card, 0xFF5B3DF5);
        return card;
    }

    private LinearLayout dialogForm() {
        LinearLayout form = new LinearLayout(this);
        form.setOrientation(LinearLayout.VERTICAL);
        form.setPadding(dp(22), dp(10), dp(22), dp(6));
        form.setLayoutDirection(View.LAYOUT_DIRECTION_RTL);
        return form;
    }

    private EditText input(String hint, int inputType) {
        EditText edit = new EditText(this);
        edit.setSingleLine(inputType != (InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_MULTI_LINE));
        edit.setHint(hint);
        edit.setInputType(inputType);
        edit.setTextSize(15);
        edit.setTypeface(fontMedium);
        edit.setTextColor(INK);
        edit.setHintTextColor(0xFF9A98B5);
        edit.setPadding(dp(14), dp(13), dp(14), dp(13));
        edit.setGravity(Gravity.START | Gravity.CENTER_VERTICAL);
        StateListDrawable background = new StateListDrawable();
        background.addState(new int[]{android.R.attr.state_focused}, fieldBackground(PRIMARY, 2));
        background.addState(new int[]{}, fieldBackground(LINE, 1));
        edit.setBackground(background);
        edit.setLayoutDirection(View.LAYOUT_DIRECTION_RTL);
        return edit;
    }

    private GradientDrawable fieldBackground(int stroke, int widthDp) {
        GradientDrawable drawable = round(FIELD, 14);
        drawable.setStroke(dp(widthDp), stroke);
        return drawable;
    }

    private TextView text(String value, int size, int color, boolean bold) {
        TextView text = new TextView(this);
        text.setText(value);
        text.setTextSize(size);
        text.setTextColor(color);
        text.setTypeface(bold ? fontBold : fontRegular);
        text.setGravity(Gravity.START);
        text.setLayoutDirection(View.LAYOUT_DIRECTION_RTL);
        return text;
    }

    private TextView stars(int filled, int sizeSp) {
        int count = Math.max(0, Math.min(5, filled));
        SpannableString value = new SpannableString("★★★★★");
        if (count > 0) {
            value.setSpan(new ForegroundColorSpan(GOLD), 0, count, Spannable.SPAN_EXCLUSIVE_EXCLUSIVE);
        }
        if (count < 5) {
            value.setSpan(new ForegroundColorSpan(0xFFDDD9EE), count, 5, Spannable.SPAN_EXCLUSIVE_EXCLUSIVE);
        }
        TextView view = new TextView(this);
        view.setText(value);
        view.setTextSize(sizeSp);
        view.setLetterSpacing(0.08f);
        view.setLayoutDirection(View.LAYOUT_DIRECTION_RTL);
        return view;
    }

    private View sectionTitle(String value) {
        LinearLayout row = new LinearLayout(this);
        row.setGravity(Gravity.CENTER_VERTICAL);
        View accent = new View(this);
        GradientDrawable accentBg = new GradientDrawable(GradientDrawable.Orientation.TOP_BOTTOM,
                new int[]{VIOLET, PRIMARY});
        accentBg.setCornerRadius(dpf(3));
        accent.setBackground(accentBg);
        row.addView(accent, new LinearLayout.LayoutParams(dp(5), dp(22)));
        TextView title = text(value, 18, INK, true);
        title.setTypeface(fontExtra);
        LinearLayout.LayoutParams titleParams = wrapContent();
        titleParams.setMarginStart(dp(10));
        row.addView(title, titleParams);
        return row;
    }

    private View emptyState(String value, int iconRes) {
        LinearLayout box = new LinearLayout(this);
        box.setOrientation(LinearLayout.VERTICAL);
        box.setGravity(Gravity.CENTER);
        box.setPadding(dp(20), dp(30), dp(20), dp(30));
        GradientDrawable background = round(WHITE, 22);
        background.setStroke(dp(1), LINE);
        box.setBackground(background);
        box.addView(iconCircle(iconRes, PRIMARY, TINT, 60, 16), new LinearLayout.LayoutParams(dp(60), dp(60)));
        TextView message = text(value, 14, MUTED, false);
        message.setGravity(Gravity.CENTER);
        message.setLineSpacing(0, 1.15f);
        box.addView(message, spaced(matchWrap(), 14));
        return box;
    }

    private View banner(String value) {
        LinearLayout box = new LinearLayout(this);
        box.setGravity(Gravity.CENTER_VERTICAL);
        box.setPadding(dp(14), dp(12), dp(14), dp(12));
        box.setBackground(round(WARN_TINT, 16));
        TextView message = text(value, 13, WARN, true);
        message.setLineSpacing(0, 1.15f);
        box.addView(message, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1));
        return box;
    }

    private TextView chip(String value, int background, int color) {
        TextView chip = text(value, 11, color, true);
        chip.setGravity(Gravity.CENTER);
        chip.setPadding(dp(10), dp(4), dp(10), dp(4));
        chip.setBackground(round(background, 11));
        return chip;
    }

    private LinearLayout pill(int iconRes, String label, int color, int background) {
        LinearLayout pill = new LinearLayout(this);
        pill.setGravity(Gravity.CENTER_VERTICAL);
        pill.setPadding(dp(12), dp(8), dp(14), dp(8));
        makePressable(pill, background, 0, 14);
        ImageView glyph = new ImageView(this);
        glyph.setImageDrawable(icon(iconRes, color));
        pill.addView(glyph, new LinearLayout.LayoutParams(dp(16), dp(16)));
        TextView caption = text(label, 13, color, true);
        LinearLayout.LayoutParams captionParams = wrapContent();
        captionParams.setMarginStart(dp(8));
        pill.addView(caption, captionParams);
        return pill;
    }

    private ImageView iconCircle(int iconRes, int tint, int background, int sizeDp, int paddingDp) {
        ImageView view = new ImageView(this);
        view.setImageDrawable(icon(iconRes, tint));
        view.setScaleType(ImageView.ScaleType.FIT_CENTER);
        view.setPadding(dp(paddingDp), dp(paddingDp), dp(paddingDp), dp(paddingDp));
        GradientDrawable circle = new GradientDrawable();
        circle.setShape(GradientDrawable.OVAL);
        circle.setColor(background);
        GradientDrawable mask = new GradientDrawable();
        mask.setShape(GradientDrawable.OVAL);
        mask.setColor(Color.BLACK);
        view.setBackground(new RippleDrawable(ColorStateList.valueOf(0x33FFFFFF), circle, mask));
        return view;
    }

    private TextView avatar(String name, int sizeDp, boolean circle) {
        String trimmed = name == null ? "" : name.trim();
        String initial = trimmed.isEmpty() ? "؟"
                : trimmed.substring(0, trimmed.offsetByCodePoints(0, 1)).toUpperCase(Locale.ROOT);
        int[] colors = AVATARS[Math.abs(trimmed.hashCode() % AVATARS.length)];
        GradientDrawable background = new GradientDrawable(GradientDrawable.Orientation.TL_BR, colors);
        if (circle) background.setShape(GradientDrawable.OVAL);
        else background.setCornerRadius(dpf(sizeDp * 0.32f));
        TextView view = text(initial, sizeDp >= 50 ? 22 : 19, WHITE, true);
        view.setTypeface(fontExtra);
        view.setGravity(Gravity.CENTER);
        view.setBackground(background);
        return view;
    }

    private Button newButton(String value, int textColor, int textSize) {
        Button button = new Button(this) {
            @Override
            public void setEnabled(boolean enabled) {
                super.setEnabled(enabled);
                setAlpha(enabled ? 1f : 0.65f);
            }
        };
        button.setText(value);
        button.setTextColor(textColor);
        button.setTextSize(textSize);
        button.setTypeface(fontBold);
        button.setAllCaps(false);
        button.setStateListAnimator(null);
        button.setMinHeight(0);
        button.setMinimumHeight(0);
        button.setMinWidth(0);
        button.setMinimumWidth(0);
        return button;
    }

    private Button button(String value) {
        Button button = newButton(value, WHITE, 16);
        button.setPadding(dp(20), dp(15), dp(20), dp(15));
        GradientDrawable background = new GradientDrawable(GradientDrawable.Orientation.LEFT_RIGHT,
                new int[]{PRIMARY, VIOLET});
        background.setCornerRadius(dpf(18));
        button.setBackground(new RippleDrawable(ColorStateList.valueOf(0x44FFFFFF), background,
                round(Color.BLACK, 18)));
        button.setElevation(dpf(5));
        tintShadow(button, PRIMARY);
        return button;
    }

    private Button iconButton(String value, int iconRes) {
        Button button = button(value);
        Drawable glyph = icon(iconRes, WHITE);
        glyph.setBounds(0, 0, dp(20), dp(20));
        button.setCompoundDrawablesRelative(glyph, null, null, null);
        button.setCompoundDrawablePadding(dp(8));
        return button;
    }

    private Button smallButton(String value, int iconRes) {
        Button button = newButton(value, PRIMARY, 13);
        button.setPadding(dp(14), dp(9), dp(16), dp(9));
        button.setBackground(new RippleDrawable(ColorStateList.valueOf(0x225B3DF5), round(TINT, 14),
                round(Color.BLACK, 14)));
        Drawable glyph = icon(iconRes, PRIMARY);
        glyph.setBounds(0, 0, dp(18), dp(18));
        button.setCompoundDrawablesRelative(glyph, null, null, null);
        button.setCompoundDrawablePadding(dp(8));
        return button;
    }

    private void addSkeletons(int[] heightsDp) {
        for (int height : heightsDp) {
            View block = new View(this);
            block.setBackground(round(0xFFE6E2F6, 22));
            LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT, dp(height));
            params.topMargin = content.getChildCount() == 0 ? 0 : dp(12);
            content.addView(block, params);
            ObjectAnimator pulse = ObjectAnimator.ofFloat(block, View.ALPHA, 0.45f, 1f);
            pulse.setDuration(750);
            pulse.setRepeatMode(ValueAnimator.REVERSE);
            pulse.setRepeatCount(ValueAnimator.INFINITE);
            pulse.start();
            skeletonAnimators.add(pulse);
        }
    }

    private void stopSkeletons() {
        for (ObjectAnimator animator : skeletonAnimators) animator.cancel();
        skeletonAnimators.clear();
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

    private float dpf(float value) {
        return value * getResources().getDisplayMetrics().density;
    }

    private void toast(String message) {
        runOnUiThread(() -> Toast.makeText(this, message, Toast.LENGTH_LONG).show());
    }
}