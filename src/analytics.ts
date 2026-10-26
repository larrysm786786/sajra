import { Capacitor } from "@capacitor/core";

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
  admin: "Admin"
};

export function trackWebPageView(page: string): void {
  if (Capacitor.isNativePlatform() || !window.gtag) return;

  const safePage = page === "member" || page === "branch" ? page : (PAGE_TITLES[page] ? page : "home");
  const pagePath = `/${safePage}`;
  window.gtag("event", "page_view", {
    page_title: safePage === "member" ? "Member profile" : safePage === "branch" ? "Family branch" : PAGE_TITLES[safePage],
    page_location: `${window.location.origin}${window.location.pathname}#${pagePath}`,
    page_path: pagePath
  });
}