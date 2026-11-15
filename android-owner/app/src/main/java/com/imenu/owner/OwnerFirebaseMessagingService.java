package com.imenu.owner;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.util.Log;

import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;

import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

public class OwnerFirebaseMessagingService extends FirebaseMessagingService {
    private static final String TAG = "iMenuPush";
    private static final String PREFS = "owner_session";
    private static final String CHANNEL_ID = "customer_ratings";

    public static void ensureNotificationChannel(Context context) {
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        if (manager != null && manager.getNotificationChannel(CHANNEL_ID) == null) {
            manager.createNotificationChannel(new NotificationChannel(
                    CHANNEL_ID, "تقييمات العملاء", NotificationManager.IMPORTANCE_HIGH));
        }
    }

    @Override
    public void onNewToken(String deviceToken) {
        registerDeviceToken(getApplicationContext(), deviceToken);
    }

    static void registerDeviceToken(Context context, String deviceToken) {
        SharedPreferences preferences = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        String base = preferences.getString("api_base", "");
        String sessionToken = preferences.getString("token", "");
        if (base.isEmpty() || sessionToken.isEmpty() || deviceToken.isEmpty()) return;

        HttpURLConnection connection = null;
        try {
            connection = (HttpURLConnection) new URL(base + "/api/v1/owner/fcm-subscribe")
                    .openConnection();
            connection.setRequestMethod("POST");
            connection.setConnectTimeout(15000);
            connection.setReadTimeout(15000);
            connection.setDoOutput(true);
            connection.setRequestProperty("Authorization", "Bearer " + sessionToken);
            connection.setRequestProperty("Content-Type", "application/json; charset=utf-8");
            JSONObject payload = new JSONObject();
            payload.put("token", deviceToken);
            try (OutputStream output = connection.getOutputStream()) {
                output.write(payload.toString().getBytes(StandardCharsets.UTF_8));
            }

            int status = connection.getResponseCode();
            InputStream responseStream = status >= 200 && status < 300
                    ? connection.getInputStream() : connection.getErrorStream();
            StringBuilder response = new StringBuilder();
            if (responseStream != null) {
                try (BufferedReader reader = new BufferedReader(
                        new InputStreamReader(responseStream, StandardCharsets.UTF_8))) {
                    String line;
                    while ((line = reader.readLine()) != null) response.append(line);
                }
            }
            if (status < 200 || status >= 300) {
                Log.e(TAG, "FCM token registration failed (" + status + "): " + response);
                return;
            }
            preferences.edit().putString("fcm_token", deviceToken).apply();
        } catch (Exception exception) {
            Log.e(TAG, "FCM token registration failed", exception);
        } finally {
            if (connection != null) connection.disconnect();
        }
    }

    @Override
    public void onMessageReceived(RemoteMessage message) {
        ensureNotificationChannel(this);
        RemoteMessage.Notification remoteNotification = message.getNotification();
        String title = remoteNotification == null ? "" : remoteNotification.getTitle();
        String body = remoteNotification == null ? "" : remoteNotification.getBody();
        if (title == null || title.isEmpty()) title = message.getData().get("title");
        if (body == null || body.isEmpty()) body = message.getData().get("body");
        if (title == null || title.isEmpty()) title = "تقييم جديد";
        if (body == null) body = "";

        String ratingId = message.getData().get("ratingId");
        int notificationId = ratingId == null || ratingId.isEmpty() ? (int) System.currentTimeMillis()
                : ratingId.hashCode();
        Intent intent = new Intent(this, MainActivity.class);
        intent.setData(Uri.parse("imenu-owner://ratings/" + notificationId));
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent pendingIntent = PendingIntent.getActivity(
                this, notificationId, intent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        android.app.Notification notification = new android.app.Notification.Builder(this, CHANNEL_ID)
                .setSmallIcon(R.drawable.ic_notification)
                .setContentTitle(title)
                .setContentText(body)
                .setStyle(new android.app.Notification.BigTextStyle().bigText(body))
                .setContentIntent(pendingIntent)
                .setAutoCancel(true)
                .build();
        NotificationManager manager = getSystemService(NotificationManager.class);
        if (manager != null) {
            try {
                manager.notify(notificationId, notification);
            } catch (SecurityException exception) {
                Log.e(TAG, "Notification permission is not granted", exception);
            }
        }
    }
}
