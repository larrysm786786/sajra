import { useEffect, useState } from "react";
import { Capacitor, registerPlugin } from "@capacitor/core";
import type { PluginListenerHandle } from "@capacitor/core";
import { PushNotifications } from "@capacitor/push-notifications";
import type { Language } from "./types";
type UpdaterPlugin = {
  getAppInfo(): Promise<{ version: string; versionCode: number }>;
  installApk(options: { url: string }): Promise<{ status: "downloading" | "permission_required" }>;
  addListener(eventName: "downloadComplete", listener: (data: { status: "ready" | "failed" }) => void): Promise<PluginListenerHandle>;
};
const updater = registerPlugin<UpdaterPlugin>("AppUpdater");
type AppNotificationsPlugin = {
  subscribeToTopic(options: { topic: string }): Promise<void>;
  unsubscribeFromTopic(options: { topic: string }): Promise<void>;
};
const appNotifications = registerPlugin<AppNotificationsPlugin>("AppNotifications");
const releasesUrl = "https://api.github.com/repos/larrysm786786/sajra/releases/latest";

/** One on/off toggle for one FCM topic - used separately for app-update and announcement notifications, so turning one on doesn't mean the other. */
function useTopicNotifications(topic: string, channelId: string, channelName: string, channelDescription: string, storageKey: string) {
  const [enabled, setEnabled] = useState(() => localStorage.getItem(storageKey) === "enabled");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function toggle(ur: boolean) {
    setBusy(true);
    setMessage("");
    try {
      if (enabled) {
        await appNotifications.unsubscribeFromTopic({ topic });
        localStorage.removeItem(storageKey);
        setEnabled(false);
        setMessage(ur ? "اطلاعات بند کر دی گئی ہیں۔" : "Notifications are off.");
      } else {
        let permission = await PushNotifications.checkPermissions();
        if (permission.receive !== "granted") permission = await PushNotifications.requestPermissions();
        if (permission.receive !== "granted") {
          setMessage(ur ? "اطلاعات کے لیے Android کی اجازت ضروری ہے۔" : "Allow notifications in Android settings to turn this on.");
          return;
        }
        await PushNotifications.createChannel({ id: channelId, name: channelName, description: channelDescription, importance: 4 });
        await PushNotifications.register();
        await appNotifications.subscribeToTopic({ topic });
        localStorage.setItem(storageKey, "enabled");
        setEnabled(true);
        setMessage(ur ? "اطلاعات آن ہیں۔" : "Notifications are on.");
      }
    } catch {
      setMessage(ur ? "اطلاعات کی ترتیب مکمل نہیں ہو سکی۔ دوبارہ کوشش کریں۔" : "Could not update notification settings. Please try again.");
    } finally {
      setBusy(false);
    }
  }
  return { enabled, busy, message, toggle };
}

export default function AppUpdaterCard({ language }: { language: Language }) {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [apkUrl, setApkUrl] = useState("");
  const ur = language === "ur";
  const updateNotifications = useTopicNotifications(
    "sajra_updates",
    "sajra_updates",
    "Sajra updates",
    "New Sajra features and app updates",
    "sajra-update-notifications"
  );
  const announcementNotifications = useTopicNotifications(
    "sajra_announcements",
    "sajra_announcements",
    "Sajra announcements",
    "Family announcements posted by the Sajra admin",
    "sajra-announcement-notifications"
  );
  if (!Capacitor.isNativePlatform()) return null;
  async function check() {
    setBusy(true); setApkUrl("");
    try {
      const [app, response] = await Promise.all([updater.getAppInfo(), fetch(releasesUrl, { headers: { Accept: "application/vnd.github+json" } })]);
      if (!response.ok) throw new Error("Release lookup failed");
      const release = await response.json() as { tag_name?: string; assets?: Array<{ name?: string; browser_download_url?: string }> };
      const code = Number(release.tag_name?.match(/v\d+\.\d+\.(\d+)/)?.[1] ?? 0);
      const apk = release.assets?.find((asset) => asset.name === "Sajra.apk");
      if (code > app.versionCode && apk?.browser_download_url) {
        setApkUrl(apk.browser_download_url);
        setMessage(ur ? `نیا ورژن ${release.tag_name} دستیاب ہے۔` : `Version ${release.tag_name} is available.`);
      } else setMessage(ur ? `آپ کا ایپ تازہ ترین ہے (${app.version})۔` : `You’re up to date (version ${app.version}).`);
    } catch { setMessage(ur ? "اپ ڈیٹ چیک نہیں ہو سکی۔ انٹرنیٹ چیک کر کے دوبارہ کوشش کریں۔" : "Could not check for updates. Check your internet and try again."); }
    finally { setBusy(false); }
  }
  useEffect(() => {
    const listenerPromise = updater.addListener("downloadComplete", (data) => {
      setDownloading(false);
      setMessage(data.status === "ready"
        ? (ur ? "ڈاؤن لوڈ مکمل۔ انسٹال کی تصدیق کریں۔" : "Download finished. Confirm the install.")
        : (ur ? "ڈاؤن لوڈ مکمل نہیں ہو سکا۔ دوبارہ کوشش کریں۔" : "The download didn't finish. Please try again."));
    });
    return () => { void listenerPromise.then((listener) => listener.remove()); };
  }, [ur]);
  async function install() {
    if (!apkUrl) return;
    setBusy(true);
    try {
      const result = await updater.installApk({ url: apkUrl });
      if (result.status === "permission_required") {
        setMessage(ur ? "Android settings میں Sajra کے لیے unknown apps کی اجازت دیں، پھر دوبارہ بٹن دبائیں۔" : "Allow Sajra to install unknown apps in Android settings, then tap Download and install again.");
      } else {
        setDownloading(true);
        setMessage(ur ? "ڈاؤن لوڈ شروع ہو گیا ہے۔ مکمل ہونے پر Android انسٹال کی تصدیق مانگے گا۔" : "Download started. Android will ask you to confirm the installation when it finishes.");
      }
    } catch { setMessage(ur ? "ڈاؤن لوڈ شروع نہیں ہو سکا۔ دوبارہ کوشش کریں۔" : "The download could not start. Please try again."); }
    finally { setBusy(false); }
  }
  return <div className="notice" style={{ marginTop: 18 }}>
    <strong>{ur ? "ایپ اپ ڈیٹ" : "App update"}</strong>
    <p style={{ margin: "8px 0 12px" }}>{message || (ur ? "Sajra کا تازہ ترین ورژن چیک کریں۔" : "Check for the latest version of Sajra.")}</p>
    {apkUrl ? <button className="btn-ghost" type="button" disabled={busy || downloading} onClick={() => void install()}>{busy || downloading ? (ur ? "ڈاؤن لوڈ ہو رہا ہے…" : "Downloading…") : (ur ? "ڈاؤن لوڈ اور انسٹال کریں" : "Download and install")}</button>
      : <button className="btn-ghost" type="button" disabled={busy} onClick={() => void check()}>{busy ? (ur ? "چیک ہو رہا ہے…" : "Checking…") : (ur ? "اپ ڈیٹ چیک کریں" : "Check for updates")}</button>}
    <div style={{ borderTop: "1px solid var(--border, #ddd)", marginTop: 16, paddingTop: 14 }}>
      <strong>{ur ? "نئے فیچرز کی اطلاعات" : "New feature notifications"}</strong>
      <p style={{ margin: "6px 0 10px" }}>{ur ? "Sajra میں نیا فیچر یا ایپ اپ ڈیٹ آنے پر اطلاع حاصل کریں۔" : "Get a notification when Sajra releases a new feature or app update."}</p>
      <button className="btn-ghost" type="button" disabled={updateNotifications.busy} onClick={() => void updateNotifications.toggle(ur)}>
        {updateNotifications.busy ? (ur ? "براہ کرم انتظار کریں…" : "Please wait…") : updateNotifications.enabled ? (ur ? "اطلاعات بند کریں" : "Turn off notifications") : (ur ? "اطلاعات آن کریں" : "Turn on notifications")}
      </button>
      {updateNotifications.message ? <small style={{ display: "block", marginTop: 8 }}>{updateNotifications.message}</small> : null}
    </div>
    <div style={{ borderTop: "1px solid var(--border, #ddd)", marginTop: 16, paddingTop: 14 }}>
      <strong>{ur ? "خاندانی اعلانات کی اطلاعات" : "Family announcement notifications"}</strong>
      <p style={{ margin: "6px 0 10px" }}>{ur ? "ایڈمن کوئی اعلان پوسٹ کرے تو اطلاع حاصل کریں۔" : "Get a notification when the admin posts a family announcement."}</p>
      <button className="btn-ghost" type="button" disabled={announcementNotifications.busy} onClick={() => void announcementNotifications.toggle(ur)}>
        {announcementNotifications.busy ? (ur ? "براہ کرم انتظار کریں…" : "Please wait…") : announcementNotifications.enabled ? (ur ? "اطلاعات بند کریں" : "Turn off notifications") : (ur ? "اطلاعات آن کریں" : "Turn on notifications")}
      </button>
      {announcementNotifications.message ? <small style={{ display: "block", marginTop: 8 }}>{announcementNotifications.message}</small> : null}
    </div>
    <small style={{ display: "block", marginTop: 10 }}>{ur ? "انسٹال کرنے کی آخری اجازت Android دے گا۔" : "Android asks you to confirm before installing an update."}</small>
  </div>;
}
