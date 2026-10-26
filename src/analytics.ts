import { Capacitor } from "@capacitor/core";
import { FirebaseAnalytics } from "@capacitor-community/firebase-analytics";

const MEASUREMENT_ID = "G-X1D6FER0H3";

declare global {
  interface Window {
    dataLayer?: unknown[][];
    gtag?: (...args: unknown[]) => void;
  }
}

export function initializeWebAnalytics(): void {
  if (Capacitor.isNativePlatform() || !MEASUREMENT_ID || window.gtag) return;

  window.dataLayer = window.dataLayer ?? [];
  window.gtag = (...args: unknown[]) => window.dataLayer?.push(args);
  window.gtag("js", new Date());
  window.gtag("config", MEASUREMENT_ID, { send_page_view: false });

  const script = document.createElement("script");
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${MEASUREMENT_ID}`;
  document.head.appendChild(script);
}

const PAGE_TITLES: Record<string, string> = {
  home: "Home",
  tree: "Family tree",
  gallery: "Gallery",
  about: "About Sajra",
  guide: "Guide",
  roots: "Founding branches",
  calendar: "Family calendar",
  admin: "Admin",
  member: "Member profile",
  branch: "Family branch"
};

export function trackWebPageView(page: string): void {
  if (Capacitor.isNativePlatform() || !window.gtag) return;

  const safePage = PAGE_TITLES[page] ? page : "home";
  const pagePath = `/${safePage}`;
  window.gtag("event", "page_view", {
    page_title: PAGE_TITLES[safePage],
    page_location: `${window.location.origin}${window.location.pathname}#${pagePath}`,
    page_path: pagePath
  });
}

export function trackNativeScreenView(page: string): void {
  if (!Capacitor.isNativePlatform()) return;

  const safePage = PAGE_TITLES[page] ? page : "home";
  void FirebaseAnalytics.setScreenName({
    screenName: PAGE_TITLES[safePage],
    nameOverride: "Sajra"
  }).catch(() => {});
}