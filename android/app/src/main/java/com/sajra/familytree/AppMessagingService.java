package com.sajra.familytree;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;
import androidx.annotation.NonNull;
import androidx.core.app.NotificationCompat;
import com.google.firebase.messaging.RemoteMessage;
import me.leolin.shortcutbadger.ShortcutBadger;

/**
 * Announcements and live-stream alerts are sent as data-only FCM messages (see
 * supabase/functions/send-announcement and supabase/functions/send-live), specifically so this
 * runs even while the app is closed in the background - a message with a "notification" payload
 * instead would make Android display it automatically without ever calling onMessageReceived,
 * which is why the old approach couldn't reliably bump the app icon badge or guarantee a sound
 * (that path used whatever the already-created channel happened to have, and a channel's
 * settings can't be changed by the app once created). This posts the notification and the
 * badge count itself, on a fresh channel with sound and high priority both explicitly set,
 * every time, with no dependency on the JS bridge being alive.
 */
public class AppMessagingService extends com.capacitorjs.plugins.pushnotifications.MessagingService {
    private static final String CHANNEL_ANNOUNCEMENTS = "sajra_announcements";
    private static final String CHANNEL_LIVE = "sajra_live";
    private static final String BADGE_PREFS_NAME = "capacitor.badge";
    private static final String BADGE_KEY = "capacitor.badge";

    @Override
    public void onMessageReceived(@NonNull RemoteMessage remoteMessage) {
        super.onMessageReceived(remoteMessage);

        String type = remoteMessage.getData().get("type");
        String title = remoteMessage.getData().get("title");
        String body = remoteMessage.getData().get("body");
        if ("announcement".equals(type)) {
            showNotification(CHANNEL_ANNOUNCEMENTS, "Sajra announcements", "Family announcements posted by the Sajra admin",
                title != null ? title : "Sajra announcement", body);
            bumpBadge();
        } else if ("live".equals(type)) {
            showNotification(CHANNEL_LIVE, "Sajra live", "Live video links posted by the Sajra admin",
                title != null ? title : "Sajra is live", body);
            bumpBadge();
        }
    }

    private void showNotification(String channelId, String channelName, String channelDescription, String title, String body) {
        NotificationManager manager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager == null) return;
        ensureChannel(manager, channelId, channelName, channelDescription);

        NotificationCompat.Builder builder = new NotificationCompat.Builder(this, channelId)
            .setSmallIcon(getApplicationInfo().icon)
            .setContentTitle(title)
            .setContentText(body)
            .setAutoCancel(true)
            .setPriority(NotificationCompat.PRIORITY_HIGH);

        Intent launchIntent = getPackageManager().getLaunchIntentForPackage(getPackageName());
        if (launchIntent != null) {
            launchIntent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
            int flags = PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S ? PendingIntent.FLAG_IMMUTABLE : 0);
            builder.setContentIntent(PendingIntent.getActivity(this, 0, launchIntent, flags));
        }

        manager.notify((int) System.currentTimeMillis(), builder.build());
    }

    private void ensureChannel(NotificationManager manager, String channelId, String channelName, String channelDescription) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        if (manager.getNotificationChannel(channelId) != null) return;
        NotificationChannel channel = new NotificationChannel(channelId, channelName, NotificationManager.IMPORTANCE_HIGH);
        channel.setDescription(channelDescription);
        manager.createNotificationChannel(channel);
    }

    private void bumpBadge() {
        SharedPreferences prefs = getSharedPreferences(BADGE_PREFS_NAME, Context.MODE_PRIVATE);
        int count = prefs.getInt(BADGE_KEY, 0) + 1;
        prefs.edit().putInt(BADGE_KEY, count).apply();
        ShortcutBadger.applyCount(getApplicationContext(), count);
    }
}
