package com.sajra.familytree;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.firebase.messaging.FirebaseMessaging;

@CapacitorPlugin(name = "AppNotifications")
public class AppNotificationsPlugin extends Plugin {
    @PluginMethod
    public void subscribeToUpdates(PluginCall call) {
        FirebaseMessaging.getInstance().subscribeToTopic("sajra_updates").addOnCompleteListener(task -> {
            if (task.isSuccessful()) {
                call.resolve();
            } else {
                call.reject("Could not enable Sajra update notifications", task.getException());
            }
        });
    }

    @PluginMethod
    public void unsubscribeFromUpdates(PluginCall call) {
        FirebaseMessaging.getInstance().unsubscribeFromTopic("sajra_updates").addOnCompleteListener(task -> {
            if (task.isSuccessful()) {
                call.resolve();
            } else {
                call.reject("Could not disable Sajra update notifications", task.getException());
            }
        });
    }
}
