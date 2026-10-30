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
  isIgnoringBatteryOptimizations(): Promise<{ ignoring: boolean }>;
  requestIgnoreBatteryOptimizations(): Promise<void>;
  openAutostartSettings(): Promise<void>;
  openChannelNotificationSettings(options: { channelId: string }): Promise<void>;
  openAppNotificationSettings(): Promise<void>;
  logException(options: { message: string; stack?: string }): Promise<void>;
};
export const appNotifications = registerPlugin<AppNotificationsPlugin>("AppNotifications");
const releasesUrl = "https://api.github.com/repos/larrysm786786/sajra/releases/latest";

function SwipeSwitch({ checked, onChange, disabled }: { checked: boolean; onChange: (checked: boolean) => void; disabled?: boolean }) {
  return <label className="swipe-switch">
    <input type="checkbox" checked={checked} disabled={disabled} onChange={(event) => onChange(event.target.checked)} />
    <span className="swipe-switch-track" />
  </label>;
}

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
  const [batteryIgnoring, setBatteryIgnoring] = useState<boolean | null>(null);
  const [deliveryMessage, setDeliveryMessage] = useState("");
  const [autostartDone, setAutostartDone] = useState(() => localStorage.getItem("sajra-autostart-done") === "1");
  const [channelSoundDone, setChannelSoundDone] = useState(() => localStorage.getItem("sajra-channel-sound-done") === "1");
  const [badgeDone, setBadgeDone] = useState(() => localStorage.getItem("sajra-badge-done") === "1");
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
  useEffect(() => {
    void appNotifications.isIgnoringBatteryOptimizations().then((result) => setBatteryIgnoring(result.ignoring)).catch(() => {});
  }, []);
  async function toggleBattery(checked: boolean) {
    if (!checked) return;
    try {
      await appNotifications.requestIgnoreBatteryOptimizations();
      window.setTimeout(() => {
        void appNotifications.isIgnoringBatteryOptimizations().then((result) => setBatteryIgnoring(result.ignoring)).catch(() => {});
      }, 1500);
    } catch {
      setDeliveryMessage(ur ? "بیٹری کی ترتیبات نہیں کھل سکیں۔" : "Could not open the battery settings.");
    }
  }
  async function toggleAutostart(checked: boolean) {
    setAutostartDone(checked);
    if (checked) localStorage.setItem("sajra-autostart-done", "1"); else localStorage.removeItem("sajra-autostart-done");
    if (!checked) return;
    try {
      await appNotifications.openAutostartSettings();
    } catch {
      setDeliveryMessage(ur ? "ترتیبات نہیں کھل سکیں۔" : "Could not open settings.");
    }
  }
  async function toggleChannelSound(checked: boolean) {
    setChannelSoundDone(checked);
    if (checked) localStorage.setItem("sajra-channel-sound-done", "1"); else localStorage.removeItem("sajra-channel-sound-done");
    if (!checked) return;
    try {
      await appNotifications.openChannelNotificationSettings({ channelId: "sajra_announcements" });
    } catch {
      setDeliveryMessage(ur ? "ترتیبات نہیں کھل سکیں۔" : "Could not open settings.");
    }
  }
  async function toggleBadge(checked: boolean) {
    setBadgeDone(checked);
    if (checked) localStorage.setItem("sajra-badge-done", "1"); else localStorage.removeItem("sajra-badge-done");
    if (!checked) return;
    try {
      await appNotifications.openAppNotificationSettings();
    } catch {
      setDeliveryMessage(ur ? "ترتیبات نہیں کھل سکیں۔" : "Could not open settings.");
    }
  }
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
      <button
        className={`btn-ghost notif-toggle-btn${updateNotifications.enabled ? " active" : ""}`}
        type="button"
        disabled={updateNotifications.busy}
        onClick={() => void updateNotifications.toggle(ur)}
      >
        {updateNotifications.busy ? (ur ? "براہ کرم انتظار کریں…" : "Please wait…") : updateNotifications.enabled ? (ur ? "آن" : "Turn on") : (ur ? "آف" : "Turn off")}
      </button>
      {updateNotifications.message ? <small style={{ display: "block", marginTop: 8 }}>{updateNotifications.message}</small> : null}
    </div>
    <div style={{ borderTop: "1px solid var(--border, #ddd)", marginTop: 16, paddingTop: 14 }}>
      <strong>{ur ? "خاندانی اعلانات کی اطلاعات" : "Family announcement notifications"}</strong>
      <p style={{ margin: "6px 0 10px" }}>{ur ? "ایڈمن کوئی اعلان پوسٹ کرے تو اطلاع حاصل کریں۔" : "Get a notification when the admin posts a family announcement."}</p>
      <button
        className={`btn-ghost notif-toggle-btn${announcementNotifications.enabled ? " active" : ""}`}
        type="button"
        disabled={announcementNotifications.busy}
        onClick={() => void announcementNotifications.toggle(ur)}
      >
        {announcementNotifications.busy ? (ur ? "براہ کرم انتظار کریں…" : "Please wait…") : announcementNotifications.enabled ? (ur ? "آن" : "Turn on") : (ur ? "آف" : "Turn off")}
      </button>
      {announcementNotifications.message ? <small style={{ display: "block", marginTop: 8 }}>{announcementNotifications.message}</small> : null}
    </div>
    <div style={{ borderTop: "1px solid var(--border, #ddd)", marginTop: 16, paddingTop: 14 }}>
      <strong>{ur ? "اطلاعات نہیں مل رہیں؟" : "Not receiving notifications?"}</strong>
      <p style={{ margin: "6px 0 12px" }}>{ur ? "کچھ فون کمپنیاں (جیسے Xiaomi، Oppo، Vivo، Huawei) بند ایپس کو اطلاعات بھیجنے سے روک دیتی ہیں۔ نیچے دی گئی چاروں ترتیبات چیک کریں۔" : "Some phone brands (Xiaomi, Oppo, Vivo, Huawei) block closed apps from receiving notifications. Check all four settings below."}</p>

      <div className="swipe-switch-row" style={{ marginBottom: 14 }}>
        <div>
          <div style={{ fontWeight: 600, marginBottom: 2 }}>{ur ? "1. Autostart آن کریں" : "1. Turn on Autostart"}</div>
          <p style={{ margin: 0, fontSize: 13, opacity: 0.85 }}>{ur ? "MIUI نئی ایپس کے لیے یہ بند رکھتا ہے، جس سے بیک گراؤنڈ میں پیغام نہیں پہنچتا۔" : "MIUI keeps this off for new apps by default, which blocks background messages."}</p>
        </div>
        <SwipeSwitch checked={autostartDone} onChange={(checked) => void toggleAutostart(checked)} />
      </div>

      <div className="swipe-switch-row" style={{ marginBottom: 14 }}>
        <div>
          <div style={{ fontWeight: 600, marginBottom: 2 }}>{ur ? "2. بیٹری سیور کو \"No restrictions\" کریں" : "2. Set battery saver to \"No restrictions\""}</div>
          <p style={{ margin: 0, fontSize: 13, opacity: 0.85 }}>
            {batteryIgnoring === true ? (ur ? "اجازت مل چکی ہے۔" : "Already allowed.") : (ur ? "\"Save battery\" کی بجائے \"No restrictions\" چنیں۔" : "Choose \"No restrictions\" instead of \"Save battery\".")}
          </p>
        </div>
        <SwipeSwitch checked={batteryIgnoring === true} onChange={(checked) => void toggleBattery(checked)} />
      </div>

      <div className="swipe-switch-row" style={{ marginBottom: 14 }}>
        <div>
          <div style={{ fontWeight: 600, marginBottom: 2 }}>{ur ? "3. اعلانات کی آواز چیک کریں" : "3. Check announcement sound"}</div>
          <p style={{ margin: 0, fontSize: 13, opacity: 0.85 }}>{ur ? "\"Sajra announcements\" چینل میں Sound آن ہونا چاہیے۔" : "The \"Sajra announcements\" channel should have Sound turned on."}</p>
        </div>
        <SwipeSwitch checked={channelSoundDone} onChange={(checked) => void toggleChannelSound(checked)} />
      </div>

      <div className="swipe-switch-row" style={{ marginBottom: 4 }}>
        <div>
          <div style={{ fontWeight: 600, marginBottom: 2 }}>{ur ? "4. ایپ آئیکون بیج کی اجازت" : "4. App icon badge permission"}</div>
          <p style={{ margin: 0, fontSize: 13, opacity: 0.85 }}>{ur ? "یہاں Sajra کے لیے بیج (badge) آن ہونا چاہیے۔" : "The app icon badge should be allowed for Sajra here."}</p>
        </div>
        <SwipeSwitch checked={badgeDone} onChange={(checked) => void toggleBadge(checked)} />
      </div>

      <small style={{ display: "block", marginTop: 4, opacity: 0.7 }}>{ur ? "سوئچ آن کرنے پر متعلقہ ترتیبات کھلیں گی - Android خود یہ اسٹیٹس نہیں بتا سکتا، اس لیے یہ صرف آپ کی اپنی یاد دہانی کے لیے ہے۔" : "Turning a switch on opens the matching settings screen - Android has no way to report these back automatically, so this is just your own reminder of what's been checked."}</small>
      {deliveryMessage ? <small style={{ display: "block", marginTop: 8 }}>{deliveryMessage}</small> : null}
    </div>
    <small style={{ display: "block", marginTop: 10 }}>{ur ? "انسٹال کرنے کی آخری اجازت Android دے گا۔" : "Android asks you to confirm before installing an update."}</small>
  </div>;
}
