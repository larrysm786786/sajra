import React, { useRef, useState } from "react";
import { WORLD_COUNTRIES } from "./worldMapData";

interface CountryActivity { country: string; activeUsers: number; }
interface Point { x: number; y: number; }
interface PanStart { point: Point; view: [number, number]; }

const COUNTRY_ALIASES: Record<string, string> = {
  "united states": "united states of america",
  "tanzania": "united republic of tanzania",
  "türkiye": "turkey",
};

function normalizeCountry(name: string): string {
  const normalized = name.trim().toLocaleLowerCase();
  return COUNTRY_ALIASES[normalized] ?? normalized;
}

interface Props {
  countries: CountryActivity[];
  loading: boolean;
  error: string;
  onRefresh: () => void;
}

export default function LiveVisitorMap({ countries, loading, error, onRefresh }: Props) {
  const [zoom, setZoom] = useState(1);
  const [view, setView] = useState<[number, number]>([0, 0]);
  const pointersRef = useRef(new Map<number, Point>());
  const panStartRef = useRef<PanStart | null>(null);
  const pinchStartRef = useRef<{ distance: number; zoom: number } | null>(null);
  const maxUsers = Math.max(1, ...countries.map((item) => item.activeUsers));
  const activityByCountry = new Map(countries.map((item) => [normalizeCountry(item.country), item]));
  const viewWidth = 1000 / zoom;
  const viewHeight = 500 / zoom;

  function clampView(next: [number, number], nextZoom = zoom): [number, number] {
    const width = 1000 / nextZoom;
    const height = 500 / nextZoom;
    return [Math.max(0, Math.min(1000 - width, next[0])), Math.max(0, Math.min(500 - height, next[1]))];
  }
  function setZoomAround(next: number) {
    const bounded = Math.max(1, Math.min(6, next));
    const oldCenter: [number, number] = [view[0] + viewWidth / 2, view[1] + viewHeight / 2];
    const width = 1000 / bounded;
    const height = 500 / bounded;
    setView(clampView([oldCenter[0] - width / 2, oldCenter[1] - height / 2], bounded));
    setZoom(bounded);
  }
  function onPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    event.currentTarget.setPointerCapture(event.pointerId);
    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointersRef.current.size === 1) panStartRef.current = { point: { x: event.clientX, y: event.clientY }, view };
    if (pointersRef.current.size === 2) {
      const [a, b] = [...pointersRef.current.values()];
      pinchStartRef.current = { distance: Math.hypot(a.x - b.x, a.y - b.y), zoom };
      panStartRef.current = null;
    }
  }
  function onPointerMove(event: React.PointerEvent<HTMLDivElement>) {
    if (!pointersRef.current.has(event.pointerId)) return;
    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointersRef.current.size >= 2 && pinchStartRef.current) {
      const [a, b] = [...pointersRef.current.values()];
      const distance = Math.hypot(a.x - b.x, a.y - b.y);
      setZoomAround(pinchStartRef.current.zoom * distance / Math.max(1, pinchStartRef.current.distance));
      return;
    }
    if (pointersRef.current.size === 1 && panStartRef.current) {
      const rect = event.currentTarget.getBoundingClientRect();
      const start = panStartRef.current;
      const dx = (event.clientX - start.point.x) * (1000 / (rect.width * zoom));
      const dy = (event.clientY - start.point.y) * (500 / (rect.height * zoom));
      setView(clampView([start.view[0] - dx, start.view[1] - dy]));
    }
  }
  function onPointerEnd(event: React.PointerEvent<HTMLDivElement>) {
    pointersRef.current.delete(event.pointerId);
    pinchStartRef.current = null;
    panStartRef.current = null;
    if (pointersRef.current.size === 1) {
      const [point] = [...pointersRef.current.values()];
      panStartRef.current = { point, view };
    }
  }

  return <section className="card live-visitor-card" aria-label="Live visitors map">
    <div className="live-visitor-heading">
      <div><span className="live-indicator" /> <strong>Live visitors by country</strong><small>Approximate locations · updated every minute</small></div>
      <button className="btn-ghost live-refresh" type="button" onClick={onRefresh} disabled={loading}>{loading ? "Updating…" : "Refresh"}</button>
    </div>
    {error ? <div className="notice danger live-map-error">{error}</div> : null}
    <div
      className="live-map-wrap live-vector-map"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerEnd}
      onPointerCancel={onPointerEnd}
      onWheel={(event) => { event.preventDefault(); setZoomAround(zoom * (event.deltaY < 0 ? 1.15 : .87)); }}
      onDoubleClick={() => setZoomAround(zoom * 1.5)}
      role="region"
      aria-label="Interactive world map. Pinch to zoom and drag to move."
    >
      <svg className="live-vector-world" viewBox={`${view[0]} ${view[1]} ${viewWidth} ${viewHeight}`} preserveAspectRatio="xMidYMid meet" role="img" aria-label="World map with active countries highlighted">
        <defs>
          <linearGradient id="visitor-ocean" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#eef5ff" /><stop offset="1" stopColor="#dceaff" /></linearGradient>
          <radialGradient id="visitor-pulse"><stop offset="0" stopColor="#2e67ad" stopOpacity=".34" /><stop offset="1" stopColor="#4c8de0" stopOpacity="0" /></radialGradient>
          <filter id="visitor-land-shadow" x="-10%" y="-10%" width="120%" height="120%"><feDropShadow dx="0" dy="1" stdDeviation="1" floodColor="#45658c" floodOpacity=".12" /></filter>
        </defs>
        <rect x="0" y="0" width="1000" height="500" fill="url(#visitor-ocean)" />
        <g className="live-map-graticule">
          <path d="M0 100H1000 M0 200H1000 M0 300H1000 M0 400H1000 M200 0V500 M400 0V500 M600 0V500 M800 0V500" />
        </g>
        <g filter="url(#visitor-land-shadow)">
          {WORLD_COUNTRIES.map((shape, index) => {
            const activity = activityByCountry.get(normalizeCountry(shape.name));
            return <path key={`${shape.name}-${index}`} className={activity ? "live-map-country is-active" : "live-map-country"} d={shape.d}>
              <title>{shape.name}{activity ? `: ${activity.activeUsers} active visitors` : ""}</title>
            </path>;
          })}
        </g>
        <g className="live-map-country-markers">
          {WORLD_COUNTRIES.map((shape, index) => {
            const activity = activityByCountry.get(normalizeCountry(shape.name));
            if (!activity) return null;
            const radius = 5 + 7 * activity.activeUsers / maxUsers;
            return <g key={`${shape.name}-marker-${index}`} className="live-map-country-marker">
              <circle className="live-map-marker-halo" cx={shape.x} cy={shape.y} r={radius * 3.1} />
              <circle className="live-map-marker-dot" cx={shape.x} cy={shape.y} r={radius} />
              <title>{shape.name}: {activity.activeUsers} active visitors</title>
            </g>;
          })}
        </g>
      </svg>
      <div className="live-map-controls" aria-label="Map zoom controls">
        <button type="button" aria-label="Zoom in" onPointerDown={(e) => e.stopPropagation()} onClick={() => setZoomAround(zoom * 1.5)}>+</button>
        <button type="button" aria-label="Zoom out" onPointerDown={(e) => e.stopPropagation()} onClick={() => setZoomAround(zoom / 1.5)}>−</button>
        <button type="button" aria-label="Reset map view" onPointerDown={(e) => e.stopPropagation()} onClick={() => { setZoom(1); setView([0, 0]); }}>↺</button>
      </div>
      {!loading && !countries.length && !error ? <div className="live-map-empty">No active visitor locations reported right now.</div> : null}
      <small className="live-map-attribution">Map data: Natural Earth</small>
    </div>
    {countries.length ? <div className="live-country-list">{countries.slice(0, 8).map((item) => <div key={item.country}><span>{item.country}</span><strong>{item.activeUsers}</strong></div>)}</div> : null}
    <small className="live-map-note">Google Analytics reports approximate country totals for active users. Individual locations are not shown.</small>
  </section>;
}
