package com.sajra.familytree;

import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.PowerManager;
import android.provider.Settings;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.firebase.crashlytics.FirebaseCrashlytics;
import com.google.firebase.messaging.FirebaseMessaging;

@CapacitorPlugin(name = "AppNotifications")
public class AppNotificationsPlugin extends Plugin {
    /**
     * Most crashes in this app are unhandled JS exceptions inside the WebView, not native Java
     * ones - Crashlytics only captures those automatically, so the JS side forwards window.onerror
     * / unhandledrejection here to get them into the same crash-free-users dashboard.
     */
    @PluginMethod
    public void logException(PluginCall call) {
        String message = call.getString("message", "Unknown JS error");
        String stack = call.getString("stack", "");
        FirebaseCrashlytics crashlytics = FirebaseCrashlytics.getInstance();
        crashlytics.log(stack.isEmpty() ? message : message + "\n" + stack);
        crashlytics.recordException(new Throwable(message));
        call.resolve();
    }

    /**
     * Android has no API an app can use to request exemption from OEM-specific background
     * kill rules (MIUI's "Autostart" toggle, Samsung's "Put unused apps to sleep", etc) - those
     * only have an officially documented, cross-OEM equivalent in the OS's own battery optimization
     * system, which this requests via the standard system dialog (no manual settings navigation
     * needed). It still won't stop every OEM's custom restrictions, which is why openAutostartSettings
     * below also exists as a best-effort fallback for the ones that need more than this.
     */
    @PluginMethod
    public void isIgnoringBatteryOptimizations(PluginCall call) {
        PowerManager powerManager = (PowerManager) getContext().getSystemService(Context.POWER_SERVICE);
        boolean ignoring = Build.VERSION.SDK_INT < Build.VERSION_CODES.M
            || (powerManager != null && powerManager.isIgnoringBatteryOptimizations(getContext().getPackageName()));
        JSObject result = new JSObject();
        result.put("ignoring", ignoring);
        call.resolve(result);
    }

    @PluginMethod
    public void requestIgnoreBatteryOptimizations(PluginCall call) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) { call.resolve(); return; }
        Intent intent = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS);
        intent.setData(Uri.parse("package:" + getContext().getPackageName()));
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        try {
            getContext().startActivity(intent);
            call.resolve();
        } catch (Exception e) {
            call.reject("Could not open the battery settings dialog", e);
        }
    }

    /**
     * MIUI's Autostart screen (and equivalents on a few other OEMs) has no public Android API or
     * documented intent - this is an undocumented activity name that can change between MIUI
     * versions and doesn't exist on non-Xiaomi devices, so every attempt is wrapped and a failure
     * just falls back to the app's own system settings page, where the user can find the same
     * controls manually.
     */
    @PluginMethod
    public void openAutostartSettings(PluginCall call) {
        String manufacturer = Build.MANUFACTURER == null ? "" : Build.MANUFACTURER.toLowerCase();
        Intent intent = null;
        if (manufacturer.contains("xiaomi")) {
            intent = new Intent();
            intent.setComponent(new ComponentName("com.miui.securitycenter", "com.miui.permcenter.autostart.AutoStartManagementActivity"));
        } else if (manufacturer.contains("oppo")) {
            intent = new Intent();
            intent.setComponent(new ComponentName("com.coloros.safecenter", "com.coloros.safecenter.permission.startup.StartupAppListActivity"));
        } else if (manufacturer.contains("vivo")) {
            intent = new Intent();
            intent.setComponent(new ComponentName("com.vivo.permissionmanager", "com.vivo.permissionmanager.activity.BgStartUpManagerActivity"));
        } else if (manufacturer.contains("huawei") || manufacturer.contains("honor")) {
            intent = new Intent();
            intent.setComponent(new ComponentName("com.huawei.systemmanager", "com.huawei.systemmanager.startupmgr.ui.StartupNormalAppListActivity"));
        }
        if (intent != null) {
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            try {
                getContext().startActivity(intent);
                call.resolve();
                return;
            } catch (Exception ignored) {
                // Falls through to the generic app-settings fallback below.
            }
        }
        Intent fallback = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
        fallback.setData(Uri.parse("package:" + getContext().getPackageName()));
        fallback.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        try {
            getContext().startActivity(fallback);
            call.resolve();
        } catch (Exception e) {
            call.reject("Could not open app settings", e);
        }
    }

    @PluginMethod
    public void subscribeToTopic(PluginCall call) {
        String topic = call.getString("topic");
        if (topic == null || topic.isEmpty()) { call.reject("A topic is required"); return; }
        FirebaseMessaging.getInstance().subscribeToTopic(topic).addOnCompleteListener(task -> {
            if (task.isSuccessful()) {
                call.resolve();
            } else {
                call.reject("Could not enable notifications for " + topic, task.getException());
            }
        });
    }

    @PluginMethod
    public void unsubscribeFromTopic(PluginCall call) {
        String topic = call.getString("topic");
        if (topic == null || topic.isEmpty()) { call.reject("A topic is required"); return; }
        FirebaseMessaging.getInstance().unsubscribeFromTopic(topic).addOnCompleteListener(task -> {
            if (task.isSuccessful()) {
                call.resolve();
            } else {
                call.reject("Could not disable notifications for " + topic, task.getException());
            }
        });
    }
}
