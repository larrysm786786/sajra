import type { ReactNode } from "react";

export type ActionIconName =
  | "tree"
  | "print"
  | "edit"
  | "suggest"
  | "branch"
  | "share"
  | "qr"
  | "family"
  | "copy"
  | "open"
  | "delete"
  | "leftRight"
  | "topBottom"
  | "boxes"
  | "download";

const ICON_PATHS: Record<ActionIconName, ReactNode> = {
  tree: <><path d="M12 21V5m0 4H6m6 4h6M6 9v7m12-3v3" /><circle cx="12" cy="4" r="2" /><circle cx="6" cy="18" r="2" /><circle cx="18" cy="18" r="2" /><circle cx="12" cy="13" r="2" /></>,
  print: <><path d="M7 8V3h10v5M6 18H4a2 2 0 0 1-2-2v-5a3 3 0 0 1 3-3h14a3 3 0 0 1 3 3v5a2 2 0 0 1-2 2h-2" /><path d="M7 14h10v7H7zM18 11h.01" /></>,
  edit: <><path d="m14 5 5 5M4 20l4-.8L19 8a2.8 2.8 0 0 0-4-4L4 15z" /></>,
  suggest: <><path d="M20 11.5a7.5 7.5 0 0 1-7.5 7.5H7l-4 2v-5.5A7.5 7.5 0 1 1 20 11.5Z" /><path d="M8 11h8m-4-4v8" /></>,
  branch: <><circle cx="6" cy="5" r="2" /><circle cx="18" cy="19" r="2" /><circle cx="18" cy="5" r="2" /><path d="M6 7v4a4 4 0 0 0 4 4h4a4 4 0 0 1 4 4M8 5h8" /></>,
  share: <><circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><path d="m8.7 10.6 6.6-4.2m-6.6 7 6.6 4.1" /></>,
  qr: <><path d="M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h3v3h-3zM19 14v3m-5 3h3m3-3v4" /></>,
  family: <><path d="M3 11 12 4l9 7M5 10v10h14V10M9 20v-6h6v6" /><circle cx="12" cy="9" r="1" /></>,
  copy: <><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3" /></>,
  open: <><path d="M13 4h7v7m0-7-9 9" /><path d="M18 13v5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h5" /></>,
  delete: <><path d="M4 7h16M10 11v6m4-6v6M6 7l1 14h10l1-14M9 7V4h6v3" /></>,
  leftRight: <><path d="M4 8h16m0 0-4-4m4 4-4 4M20 16H4m0 0 4-4m-4 4 4 4" /></>,
  topBottom: <><path d="M8 4v16m0-16L4 8m4-4 4 4m4 8v4m0 0 4-4m-4 4-4-4" /></>,
  boxes: <><rect x="3" y="3" width="8" height="8" rx="1" /><rect x="13" y="3" width="8" height="8" rx="1" /><rect x="3" y="13" width="8" height="8" rx="1" /><rect x="13" y="13" width="8" height="8" rx="1" /></>,
  download: <><path d="M12 3v12m0 0 5-5m-5 5-5-5M4 18v3h16v-3" /></>
};

export function IconActionButton({
  icon,
  label,
  onClick,
  className = "btn-ghost",
  pressed,
  disabled
}: {
  icon: ActionIconName;
  label: string;
  onClick: () => void;
  className?: string;
  pressed?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      className={`responsive-action-button ${className}`}
      title={label}
      aria-label={label}
      aria-pressed={pressed}
      disabled={disabled}
      onClick={onClick}
    >
      <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {ICON_PATHS[icon]}
      </svg>
      <span className="responsive-action-label">{label}</span>
    </button>
  );
}
