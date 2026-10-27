package com.sajra.familytree;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.firebase.messaging.FirebaseMessaging;

@CapacitorPlugin(name = "AppNotifications")
public class AppNotificationsPlugin extends Plugin {
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
