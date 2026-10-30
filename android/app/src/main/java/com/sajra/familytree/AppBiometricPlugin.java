package com.sajra.familytree;

import androidx.biometric.BiometricManager;
import androidx.biometric.BiometricPrompt;
import androidx.core.content.ContextCompat;
import androidx.fragment.app.FragmentActivity;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Gates the Admin Dashboard behind the device's own fingerprint/face/PIN prompt, on top of the
 * normal email+password (and optional 2FA) login - a locally-set preference (see the "Require
 * fingerprint for Admin Dashboard" toggle in Settings), not something synced to other devices.
 * Allows DEVICE_CREDENTIAL (PIN/pattern/password) as a fallback since not every phone has
 * fingerprint/face hardware set up.
 */
@CapacitorPlugin(name = "AppBiometric")
public class AppBiometricPlugin extends Plugin {
    private static final int ALLOWED_AUTHENTICATORS = BiometricManager.Authenticators.BIOMETRIC_WEAK | BiometricManager.Authenticators.DEVICE_CREDENTIAL;

    @PluginMethod
    public void isAvailable(PluginCall call) {
        BiometricManager manager = BiometricManager.from(getContext());
        int result = manager.canAuthenticate(ALLOWED_AUTHENTICATORS);
        JSObject response = new JSObject();
        response.put("available", result == BiometricManager.BIOMETRIC_SUCCESS);
        call.resolve(response);
    }

    @PluginMethod
    public void authenticate(PluginCall call) {
        FragmentActivity activity = (FragmentActivity) getActivity();
        if (activity == null) { call.reject("No activity available."); return; }
        String title = call.getString("title", "Unlock Sajra");
        String subtitle = call.getString("subtitle", "Confirm it's you to continue");

        activity.runOnUiThread(() -> {
            BiometricPrompt.PromptInfo promptInfo = new BiometricPrompt.PromptInfo.Builder()
                .setTitle(title)
                .setSubtitle(subtitle)
                .setAllowedAuthenticators(ALLOWED_AUTHENTICATORS)
                .build();

            BiometricPrompt prompt = new BiometricPrompt(activity, ContextCompat.getMainExecutor(getContext()), new BiometricPrompt.AuthenticationCallback() {
                @Override
                public void onAuthenticationSucceeded(BiometricPrompt.AuthenticationResult result) {
                    call.resolve();
                }

                @Override
                public void onAuthenticationError(int errorCode, CharSequence errString) {
                    call.reject(errString.toString());
                }

                @Override
                public void onAuthenticationFailed() {
                    // One failed attempt (e.g. wrong finger) - the prompt keeps retrying on its own;
                    // only onAuthenticationError ends it (cancel, lockout, etc).
                }
            });
            prompt.authenticate(promptInfo);
        });
    }
}
