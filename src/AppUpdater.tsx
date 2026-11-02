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
type AppBiometricPlugin = {
  isAvailable(): Promise<{ available: boolean }>;
  authenticate(options: { title?: string; subtitle?: string }): Promise<void>;
};
export const appBiometric = registerPlugin<AppBiometricPlugin>("AppBiometric");
export const BIOMETRIC_LOCK_STORAGE_KEY = "sajra-biometric-lock-enabled";
type AppPrintPlugin = {
  print(): Promise<void>;
};
export const appPrint = registerPlugin<AppPrintPlugin>("AppPrint");
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

export default function AppUpdaterCard({ language, isAdmin }: { language: Language; isAdmin?: boolean }) {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [apkUrl, setApkUrl] = useState("");
  const [batteryIgnoring, setBatteryIgnoring] = useState<boolean | null>(null);
  const [deliveryMessage, setDeliveryMessage] = useState("");
  const [autostartDone, setAutostartDone] = useState(() => localStorage.getItem("sajra-autostart-done") === "1");
  const [channelSoundDone, setChannelSoundDone] = useState(() => localStorage.getItem("sajra-channel-sound-done") === "1");
  const [badgeDone, setBadgeDone] = useState(() => localStorage.getItem("sajra-badge-done") === "1");
  const [biometricLockEnabled, setBiometricLockEnabled] = useState(() => localStorage.getItem(BIOMETRIC_LOCK_STORAGE_KEY) === "1");
  const [biometricMessage, setBiometricMessage] = useState("");
  const ur = language === "ur";
  const updateNotifications = useTopicNotifications(
    "sajra_updates",
    "sajra_updates",
    "Apna Sajra updates",
    "New Apna Sajra features and app updates",
    "sajra-update-notifications"
  );
  const announcementNotifications = useTopicNotifications(
    "sajra_announcements",
    "sajra_announcements",
    "Apna Sajra announcements",
    "Family announcements posted by the Apna Sajra admin",
    "sajra-announcement-notifications"
  );
  const eventNotifications = useTopicNotifications(
    "sajra_events",
    "sajra_events",
    "Apna Sajra birthdays & anniversaries",
    "Family birthdays and remembrance days",
    "sajra-event-notifications"
  );
  const adminAlertNotifications = useTopicNotifications(
    "sajra_admin_alerts",
    "sajra_admin_alerts",
    "Apna Sajra admin alerts",
    "New suggestions and guestbook messages from visitors",
    "sajra-admin-alert-notifications"
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
  async function toggleBiometricLock(checked: boolean) {
    setBiometricMessage("");
    if (checked) {
      try {
        const result = await appBiometric.isAvailable();
        if (!result.available) {
          setBiometricMessage(ur ? "اس فون پر فنگر پرنٹ/PIN سیٹ اپ نہیں ہے۔" : "No fingerprint/face/PIN is set up on this phone.");
          return;
        }
        await appBiometric.authenticate({
          title: ur ? "فنگر پرنٹ لاک آن کریں" : "Turn on fingerprint lock",
          subtitle: ur ? "تصدیق کریں کہ یہ آپ ہیں" : "Confirm it's you"
        });
      } catch {
        setBiometricMessage(ur ? "تصدیق نہیں ہو سکی۔" : "Could not verify.");
        return;
      }
    }
    setBiometricLockEnabled(checked);
    if (checked) localStorage.setItem(BIOMETRIC_LOCK_STORAGE_KEY, "1"); else localStorage.removeItem(BIOMETRIC_LOCK_STORAGE_KEY);
  }
  async function install() {
    if (!apkUrl) return;
    setBusy(true);
    try {
      const result = await updater.installApk({ url: apkUrl });
      if (result.status === "permission_required") {
        setMessage(ur ? "Android settings میں Apna Sajra کے لیے unknown apps کی اجازت دیں، پھر دوبارہ بٹن دبائیں۔" : "Allow Apna Sajra to install unknown apps in Android settings, then tap Download and install again.");
      } else {
        setDownloading(true);
        setMessage(ur ? "ڈاؤن لوڈ شروع ہو گیا ہے۔ مکمل ہونے پر Android انسٹال کی تصدیق مانگے گا۔" : "Download started. Android will ask you to confirm the installation when it finishes.");
      }
    } catch { setMessage(ur ? "ڈاؤن لوڈ شروع نہیں ہو سکا۔ دوبارہ کوشش کریں۔" : "The download could not start. Please try again."); }
    finally { setBusy(false); }
  }
  return <div className="notice" style={{ marginTop: 18 }}>
    <strong>{ur ? "ایپ اپ ڈیٹ" : "App update"}</strong>
    <p style={{ margin: "8px 0 12px" }}>{message || (ur ? "Apna Sajra کا تازہ ترین ورژن چیک کریں۔" : "Check for the latest version of Apna Sajra.")}</p>
    {apkUrl ? <button className="btn-ghost" type="button" disabled={busy || downloading} onClick={() => void install()}>{busy || downloading ? (ur ? "ڈاؤن لوڈ ہو رہا ہے…" : "Downloading…") : (ur ? "ڈاؤن لوڈ اور انسٹال کریں" : "Download and install")}</button>
      : <button className="btn-ghost" type="button" disabled={busy} onClick={() => void check()}>{busy ? (ur ? "چیک ہو رہا ہے…" : "Checking…") : (ur ? "اپ ڈیٹ چیک کریں" : "Check for updates")}</button>}
    <div style={{ borderTop: "1px solid var(--border, #ddd)", marginTop: 16, paddingTop: 14 }}>
      <strong style={{ display: "block", marginBottom: 2 }}>{ur ? "نئے فیچرز کی اطلاعات" : "New feature notifications"}</strong>
      <button
        className={`btn-ghost notif-toggle-btn${updateNotifications.enabled ? " active" : ""}`}
        type="button"
        style={{ marginTop: 10 }}
        disabled={updateNotifications.busy}
        onClick={() => void updateNotifications.toggle(ur)}
      >
        {updateNotifications.busy ? (ur ? "براہ کرم انتظار کریں…" : "Please wait…") : updateNotifications.enabled ? (ur ? "آن" : "Turn on") : (ur ? "آف" : "Turn off")}
      </button>
      {updateNotifications.message ? <small style={{ display: "block", marginTop: 8 }}>{updateNotifications.message}</small> : null}
    </div>
    <div style={{ borderTop: "1px solid var(--border, #ddd)", marginTop: 16, paddingTop: 14 }}>
      <strong style={{ display: "block", marginBottom: 2 }}>{ur ? "خاندانی اعلانات کی اطلاعات" : "Family announcement notifications"}</strong>
      <button
        className={`btn-ghost notif-toggle-btn${announcementNotifications.enabled ? " active" : ""}`}
        type="button"
        style={{ marginTop: 10 }}
        disabled={announcementNotifications.busy}
        onClick={() => void announcementNotifications.toggle(ur)}
      >
        {announcementNotifications.busy ? (ur ? "براہ کرم انتظار کریں…" : "Please wait…") : announcementNotifications.enabled ? (ur ? "آن" : "Turn on") : (ur ? "آف" : "Turn off")}
      </button>
      {announcementNotifications.message ? <small style={{ display: "block", marginTop: 8 }}>{announcementNotifications.message}</small> : null}
    </div>
    <div style={{ borderTop: "1px solid var(--border, #ddd)", marginTop: 16, paddingTop: 14 }}>
      <strong style={{ display: "block", marginBottom: 2 }}>{ur ? "سالگرہ اور یادگار دن کی اطلاعات" : "Birthday & remembrance notifications"}</strong>
      <button
        className={`btn-ghost notif-toggle-btn${eventNotifications.enabled ? " active" : ""}`}
        type="button"
        style={{ marginTop: 10 }}
        disabled={eventNotifications.busy}
        onClick={() => void eventNotifications.toggle(ur)}
      >
        {eventNotifications.busy ? (ur ? "براہ کرم انتظار کریں…" : "Please wait…") : eventNotifications.enabled ? (ur ? "آن" : "Turn on") : (ur ? "آف" : "Turn off")}
      </button>
      {eventNotifications.message ? <small style={{ display: "block", marginTop: 8 }}>{eventNotifications.message}</small> : null}
    </div>
    {isAdmin ? (
      <div style={{ borderTop: "1px solid var(--border, #ddd)", marginTop: 16, paddingTop: 14 }}>
        <strong style={{ display: "block", marginBottom: 2 }}>{ur ? "ایڈمن اطلاعات" : "Admin alerts"}</strong>
        <button
          className={`btn-ghost notif-toggle-btn${adminAlertNotifications.enabled ? " active" : ""}`}
          type="button"
          style={{ marginTop: 10 }}
          disabled={adminAlertNotifications.busy}
          onClick={() => void adminAlertNotifications.toggle(ur)}
        >
          {adminAlertNotifications.busy ? (ur ? "براہ کرم انتظار کریں…" : "Please wait…") : adminAlertNotifications.enabled ? (ur ? "آن" : "Turn on") : (ur ? "آف" : "Turn off")}
        </button>
        {adminAlertNotifications.message ? <small style={{ display: "block", marginTop: 8 }}>{adminAlertNotifications.message}</small> : null}
      </div>
    ) : null}
    <div style={{ borderTop: "1px solid var(--border, #ddd)", marginTop: 16, paddingTop: 14 }}>
      <strong>{ur ? "اطلاعات نہیں مل رہیں؟" : "Not receiving notifications?"}</strong>

      <div className="swipe-switch-row" style={{ marginTop: 12, marginBottom: 14 }}>
        <div style={{ fontWeight: 600 }}>{ur ? "1. Autostart آن کریں" : "1. Turn on Autostart"}</div>
        <SwipeSwitch checked={autostartDone} onChange={(checked) => void toggleAutostart(checked)} />
      </div>

      <div className="swipe-switch-row" style={{ marginBottom: 14 }}>
        <div style={{ fontWeight: 600 }}>{ur ? "2. بیٹری سیور کو \"No restrictions\" کریں" : "2. Set battery saver to \"No restrictions\""}</div>
        <SwipeSwitch checked={batteryIgnoring === true} onChange={(checked) => void toggleBattery(checked)} />
      </div>

      <div className="swipe-switch-row" style={{ marginBottom: 14 }}>
        <div style={{ fontWeight: 600 }}>{ur ? "3. اعلانات کی آواز چیک کریں" : "3. Check announcement sound"}</div>
        <SwipeSwitch checked={channelSoundDone} onChange={(checked) => void toggleChannelSound(checked)} />
      </div>

      <div className="swipe-switch-row">
        <div style={{ fontWeight: 600 }}>{ur ? "4. ایپ آئیکون بیج کی اجازت" : "4. App icon badge permission"}</div>
        <SwipeSwitch checked={badgeDone} onChange={(checked) => void toggleBadge(checked)} />
      </div>

      {deliveryMessage ? <small style={{ display: "block", marginTop: 8 }}>{deliveryMessage}</small> : null}
    </div>
    <div className="swipe-switch-row" style={{ borderTop: "1px solid var(--border, #ddd)", marginTop: 16, paddingTop: 14 }}>
      <strong>{ur ? "ایڈمن ڈیش بورڈ کے لیے فنگر پرنٹ لاک" : "Fingerprint lock for Admin Dashboard"}</strong>
      <SwipeSwitch checked={biometricLockEnabled} onChange={(checked) => void toggleBiometricLock(checked)} />
    </div>
    {biometricMessage ? <small style={{ display: "block", marginTop: 8 }}>{biometricMessage}</small> : null}
  </div>;
}
