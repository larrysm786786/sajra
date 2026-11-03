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
 *
 * An empty PrintAttributes.Builder().build() (no media size/resolution/margins set) is a
 * well-documented cause of the WebView print adapter silently writing a 0-byte PDF when "Save as
 * PDF" is picked - leaving every field unset instead of defaulting sensibly. Explicitly set
 * A4 + a real resolution + no margins, which is the standard workaround other WebView-based print
 * implementations (e.g. Cordova's own printer plugin) use for this exact bug.
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
                PrintAttributes attributes = new PrintAttributes.Builder()
                    .setMediaSize(PrintAttributes.MediaSize.ISO_A4)
                    .setResolution(new PrintAttributes.Resolution("pdf", "pdf", 300, 300))
                    .setMinMargins(PrintAttributes.Margins.NO_MARGINS)
                    .build();
                printManager.print(jobName, webView.createPrintDocumentAdapter(jobName), attributes);
                call.resolve();
            } catch (Exception e) {
                call.reject("Could not open the print dialog", e);
            }
        });
    }
}
