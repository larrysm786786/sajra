package com.sajra.familytree;
import android.app.DownloadManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.PackageInfo;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.Settings;
import androidx.core.content.ContextCompat;
import androidx.core.content.FileProvider;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
@CapacitorPlugin(name = "AppUpdater")
public class AppUpdaterPlugin extends Plugin {
    private BroadcastReceiver downloadReceiver;
    @PluginMethod public void getAppInfo(PluginCall call) {
        try {
            PackageInfo info = getContext().getPackageManager().getPackageInfo(getContext().getPackageName(), 0);
            JSObject result = new JSObject();
            result.put("version", info.versionName == null ? "1.0" : info.versionName);
            result.put("versionCode", Build.VERSION.SDK_INT >= Build.VERSION_CODES.P ? info.getLongVersionCode() : info.versionCode);
            call.resolve(result);
        } catch (Exception e) { call.reject("Could not read app version", e); }
    }
    @PluginMethod public void installApk(PluginCall call) {
        String url = call.getString("url");
        if (url == null || !url.startsWith("https://")) { call.reject("Secure APK link required"); return; }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && !getContext().getPackageManager().canRequestPackageInstalls()) {
            getActivity().startActivity(new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + getContext().getPackageName())));
            JSObject result = new JSObject(); result.put("status", "permission_required"); call.resolve(result); return;
        }
        try {
            File dir = getContext().getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS);
            if (dir == null) { call.reject("App storage unavailable"); return; }
            File apk = new File(dir, "sajra-update.apk"); if (apk.exists()) apk.delete();
            DownloadManager manager = (DownloadManager) getContext().getSystemService(Context.DOWNLOAD_SERVICE);
            DownloadManager.Request request = new DownloadManager.Request(Uri.parse(url));
            request.setTitle("Sajra app update"); request.setDescription("Downloading the latest Sajra version");
            request.setDestinationInExternalFilesDir(getContext(), Environment.DIRECTORY_DOWNLOADS, "sajra-update.apk");
            request.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
            long id = manager.enqueue(request);
            if (downloadReceiver != null) { try { getContext().unregisterReceiver(downloadReceiver); } catch (Exception ignored) {} }
            downloadReceiver = new BroadcastReceiver() {
                @Override public void onReceive(Context context, Intent intent) {
                    if (intent.getLongExtra(DownloadManager.EXTRA_DOWNLOAD_ID, -1) != id) return;
                    try (android.database.Cursor cursor = manager.query(new DownloadManager.Query().setFilterById(id))) {
                        if (cursor == null || !cursor.moveToFirst() || cursor.getInt(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_STATUS)) != DownloadManager.STATUS_SUCCESSFUL || !apk.isFile()) return;
                        Uri uri = FileProvider.getUriForFile(context, context.getPackageName() + ".fileprovider", apk);
                        Intent installer = new Intent(Intent.ACTION_VIEW);
                        installer.setDataAndType(uri, "application/vnd.android.package-archive");
                        installer.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_GRANT_READ_URI_PERMISSION);
                        context.startActivity(installer);
                    } catch (Exception ignored) { /* Android installer handles final approval. */ }
                    finally { try { context.unregisterReceiver(this); } catch (Exception ignored) {} downloadReceiver = null; }
                }
            };
            ContextCompat.registerReceiver(getContext(), downloadReceiver, new IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE), ContextCompat.RECEIVER_NOT_EXPORTED);
            JSObject result = new JSObject(); result.put("status", "downloading"); call.resolve(result);
        } catch (Exception e) { call.reject("Could not start APK download", e); }
    }
}
