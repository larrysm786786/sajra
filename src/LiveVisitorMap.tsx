import React from "react";

interface CountryActivity {
  country: string;
  activeUsers: number;
}

// Country centroids are intentionally approximate: GA4 reports country-level
// aggregates here, never a visitor's precise location.
const CENTROIDS: Record<string, [number, number]> = {
  "United States": [-98, 39], "United Kingdom": [-3, 55], India: [79, 22], Pakistan: [69, 30],
  Canada: [-106, 57], Australia: [134, -25], Germany: [10, 51], France: [2, 46],
  "Saudi Arabia": [45, 24], "United Arab Emirates": [54, 24], Bangladesh: [90, 24],
  Indonesia: [117, -2], Malaysia: [102, 4], Turkey: [35, 39], Egypt: [30, 27],
  Nigeria: [8, 9], "South Africa": [24, -29], Brazil: [-52, -10], Mexico: [-102, 23],
  Japan: [138, 37], China: [104, 35], "Sri Lanka": [81, 7], Nepal: [84, 28],
  Afghanistan: [66, 34], Iraq: [44, 33], Iran: [53, 32], Italy: [12, 42],
  Spain: [-4, 40], Netherlands: [5, 52], Russia: [90, 60],
};

interface Props {
  countries: CountryActivity[];
  loading: boolean;
  error: string;
  activeNow: number;
  onRefresh: () => void;
}

export default function LiveVisitorMap({ countries, loading, error, activeNow, onRefresh }: Props) {
  const maxUsers = Math.max(1, ...countries.map((item) => item.activeUsers));
  const mapped = countries.flatMap((item) => {
    const center = CENTROIDS[item.country];
    if (!center) return [];
    return [{ ...item, x: ((center[0] + 180) / 360) * 1000, y: ((90 - center[1]) / 180) * 500 }];
  });

  return <section className="card live-visitor-card" aria-label="Live visitors map">
    <div className="live-visitor-heading">
      <div><span className="live-indicator" /> <strong>Live visitors by country</strong><small>Approximate locations · updated every minute</small></div>
      <button className="btn-ghost live-refresh" type="button" onClick={onRefresh} disabled={loading}>{loading ? "Updating…" : "Refresh"}</button>
    </div>
    {error ? <div className="notice danger">{error}</div> : null}
    <div className="live-map-wrap">
      <svg className="live-world-map" viewBox="0 0 1000 500" role="img" aria-label={`${activeNow} active visitors displayed by country`}>
        <path className="live-map-land" d="M74 115 108 83 163 68 205 79 230 102 218 126 190 134 178 157 146 164 134 191 113 191 98 165 76 151ZM218 202 247 211 266 238 273 275 259 318 245 351 228 338 222 302 209 278 205 244ZM340 100 372 82 414 85 431 100 457 96 484 109 521 94 554 104 576 93 621 99 651 113 688 106 723 118 746 139 777 148 808 171 792 188 766 183 743 201 718 195 701 216 677 213 658 230 632 223 613 241 588 230 565 240 539 225 516 236 491 223 467 236 447 216 424 225 401 208 374 217 354 198 330 203 318 181 329 157ZM430 220 458 227 472 250 468 278 450 296 435 276 423 252ZM499 244 531 238 555 248 574 270 564 296 540 308 519 291 508 270ZM644 265 676 255 702 266 713 289 693 306 665 300 646 283ZM750 314 791 302 833 311 866 330 852 350 817 354 783 343 759 332Z" />
        {mapped.map((point) => {
          const radius = 5 + (point.activeUsers / maxUsers) * 9;
          return <g key={point.country} className="live-map-point" transform={`translate(${point.x},${point.y})`}>
            <circle className="live-map-pulse" r={radius + 8} />
            <circle className="live-map-dot" r={radius} />
            <title>{point.country}: {point.activeUsers} active</title>
          </g>;
        })}
      </svg>
      {!loading && !countries.length && !error ? <div className="live-map-empty">No active visitor locations reported right now.</div> : null}
    </div>
    {countries.length ? <div className="live-country-list">{countries.slice(0, 8).map((item) => <div key={item.country}><span>{item.country}</span><strong>{item.activeUsers}</strong></div>)}</div> : null}
    <small className="live-map-note">Google Analytics reports approximate country totals for active users. Individual locations are not shown.</small>
  </section>;
}
