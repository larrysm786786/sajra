package com.sajra.familytree;

import android.content.Context;
import android.print.PrintAttributes;
import android.print.PrintManager;
import android.webkit.WebView;
import androidx.fragment.app.FragmentActivity;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * A bare window.print() call (what the web build uses) does nothing inside a Capacitor Android
 * WebView by default - there's no print service wired up unless the app does it itself. This
 * hands the current WebView's own print-document-adapter (which renders exactly what's on
 * screen, respecting the page's existing @media print styles) to Android's native print dialog.
 */
@CapacitorPlugin(name = "AppPrint")
public class AppPrintPlugin extends Plugin {
    @PluginMethod
    public void print(PluginCall call) {
        FragmentActivity activity = (FragmentActivity) getActivity();
        if (activity == null) { call.reject("No activity available."); return; }

        activity.runOnUiThread(() -> {
            try {
                WebView webView = (WebView) getBridge().getWebView();
                PrintManager printManager = (PrintManager) activity.getSystemService(Context.PRINT_SERVICE);
                String jobName = getContext().getApplicationInfo().loadLabel(getContext().getPackageManager()) + " Document";
                printManager.print(jobName, webView.createPrintDocumentAdapter(jobName), new PrintAttributes.Builder().build());
                call.resolve();
            } catch (Exception e) {
                call.reject("Could not open the print dialog", e);
            }
        });
    }
}
