import { useState } from "react";
import { Capacitor, registerPlugin } from "@capacitor/core";
import type { Language } from "./types";
type UpdaterPlugin = {
  getAppInfo(): Promise<{ version: string; versionCode: number }>;
  installApk(options: { url: string }): Promise<{ status: "downloading" | "permission_required" }>;
};
const updater = registerPlugin<UpdaterPlugin>("AppUpdater");
const releasesUrl = "https://api.github.com/repos/larrysm786786/sajra/releases/latest";
export default function AppUpdaterCard({ language }: { language: Language }) {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [apkUrl, setApkUrl] = useState("");
  const ur = language === "ur";
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
  async function install() {
    if (!apkUrl) return;
    setBusy(true);
    try {
      const result = await updater.installApk({ url: apkUrl });
      setMessage(result.status === "permission_required"
        ? (ur ? "Android settings میں Sajra کے لیے unknown apps کی اجازت دیں، پھر دوبارہ بٹن دبائیں۔" : "Allow Sajra to install unknown apps in Android settings, then tap Download and install again.")
        : (ur ? "ڈاؤن لوڈ شروع ہو گیا ہے۔ مکمل ہونے پر Android انسٹال کی تصدیق مانگے گا۔" : "Download started. Android will ask you to confirm the installation when it finishes."));
    } catch { setMessage(ur ? "ڈاؤن لوڈ شروع نہیں ہو سکا۔ دوبارہ کوشش کریں۔" : "The download could not start. Please try again."); }
    finally { setBusy(false); }
  }
  return <div className="notice" style={{ marginTop: 18 }}>
    <strong>{ur ? "ایپ اپ ڈیٹ" : "App update"}</strong>
    <p style={{ margin: "8px 0 12px" }}>{message || (ur ? "Sajra کا تازہ ترین ورژن چیک کریں۔" : "Check for the latest version of Sajra.")}</p>
    {apkUrl ? <button className="btn-ghost" type="button" disabled={busy} onClick={() => void install()}>{ur ? "ڈاؤن لوڈ اور انسٹال کریں" : "Download and install"}</button>
      : <button className="btn-ghost" type="button" disabled={busy} onClick={() => void check()}>{busy ? (ur ? "چیک ہو رہا ہے…" : "Checking…") : (ur ? "اپ ڈیٹ چیک کریں" : "Check for updates")}</button>}
    <small style={{ display: "block", marginTop: 10 }}>{ur ? "انسٹال کرنے کی آخری اجازت Android دے گا۔" : "Android asks you to confirm before installing an update."}</small>
  </div>;
}
