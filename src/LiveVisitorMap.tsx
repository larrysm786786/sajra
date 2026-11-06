import React, { useRef, useState } from "react";
import { WORLD_CITIES } from "./worldCityData";
import { WORLD_COUNTRIES } from "./worldMapData";

interface CityActivity { city: string; country: string; activeUsers: number; }
interface Point { x: number; y: number; }
interface PanStart { point: Point; view: [number, number]; }

const COUNTRY_ALIASES: Record<string, string> = {
  "united states": "united states of america",
  "tanzania": "united republic of tanzania",
  "czechia": "czech republic",
  "south korea": "republic of korea",
  "north korea": "democratic people's republic of korea",
  "ivory coast": "côte d'ivoire",
  "vietnam": "viet nam",
  "turkiye": "turkey",
};

function normalize(value: string): string {
  return value.trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}
function normalizeCountry(value: string): string {
  const normalized = normalize(value);
  return COUNTRY_ALIASES[normalized] ?? normalized;
}
const cityPoints = new Map<string, Point>();
for (const place of WORLD_CITIES) {
  const point = { x: place.x, y: place.y };
  for (const country of new Set([place.country, place.sovereign])) {
    cityPoints.set(`${normalizeCountry(country)}|${normalize(place.city)}`, point);
  }
}

interface Props {
  cities: CityActivity[];
  loading: boolean;
  error: string;
  onRefresh: () => void;
}

export default function LiveVisitorMap({ cities, loading, error, onRefresh }: Props) {
  const [zoom, setZoom] = useState(1);
  const [view, setView] = useState<[number, number]>([0, 0]);
  const pointersRef = useRef(new Map<number, Point>());
  const panStartRef = useRef<PanStart | null>(null);
  const pinchStartRef = useRef<{ distance: number; zoom: number } | null>(null);
  const mappedCities = cities.flatMap((item) => {
    const point = cityPoints.get(`${normalizeCountry(item.country)}|${normalize(item.city)}`);
    return point ? [{ ...item, ...point }] : [];
  });
  const maxUsers = Math.max(1, ...mappedCities.map((item) => item.activeUsers));
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
      <div><span className="live-indicator" /> <strong>Live visitors by city</strong><small>Approximate city locations · updated every minute</small></div>
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
      <svg className="live-vector-world" viewBox={`${view[0]} ${view[1]} ${viewWidth} ${viewHeight}`} preserveAspectRatio="xMidYMid meet" role="img" aria-label="World map with approximate active visitor cities">
        <defs>
          <linearGradient id="visitor-ocean" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#eef5ff" /><stop offset="1" stopColor="#dceaff" /></linearGradient>
          <radialGradient id="visitor-pulse"><stop offset="0" stopColor="#2e67ad" stopOpacity=".34" /><stop offset="1" stopColor="#4c8de0" stopOpacity="0" /></radialGradient>
          <filter id="visitor-land-shadow" x="-10%" y="-10%" width="120%" height="120%"><feDropShadow dx="0" dy="1" stdDeviation="1" floodColor="#45658c" floodOpacity=".12" /></filter>
        </defs>
        <rect x="0" y="0" width="1000" height="500" fill="url(#visitor-ocean)" />
        <g className="live-map-graticule"><path d="M0 100H1000 M0 200H1000 M0 300H1000 M0 400H1000 M200 0V500 M400 0V500 M600 0V500 M800 0V500" /></g>
        <g filter="url(#visitor-land-shadow)">{WORLD_COUNTRIES.map((shape, index) => <path key={`${shape.name}-${index}`} className="live-map-country" d={shape.d}><title>{shape.name}</title></path>)}</g>
        <g className="live-map-city-markers">{mappedCities.map((item, index) => {
          const radius = 4 + 5 * item.activeUsers / maxUsers;
          return <g key={`${item.city}-${item.country}-${index}`} className="live-map-city-marker">
            <circle className="live-map-city-halo" cx={item.x} cy={item.y} r={radius * 3.2} />
            <circle className="live-map-city-dot" cx={item.x} cy={item.y} r={radius} />
            <title>{item.city}, {item.country}: {item.activeUsers} active visitors</title>
          </g>;
        })}</g>
      </svg>
      <div className="live-map-controls" aria-label="Map zoom controls">
        <button type="button" aria-label="Zoom in" onPointerDown={(e) => e.stopPropagation()} onClick={() => setZoomAround(zoom * 1.5)}>+</button>
        <button type="button" aria-label="Zoom out" onPointerDown={(e) => e.stopPropagation()} onClick={() => setZoomAround(zoom / 1.5)}>−</button>
        <button type="button" aria-label="Reset map view" onPointerDown={(e) => e.stopPropagation()} onClick={() => { setZoom(1); setView([0, 0]); }}>↺</button>
      </div>
      {!loading && !cities.length && !error ? <div className="live-map-empty">No active visitor locations reported right now.</div> : null}
      <small className="live-map-attribution">Map data: Natural Earth</small>
    </div>
    {cities.length ? <div className="live-city-list">{cities.slice(0, 12).map((item, index) => <div key={`${item.city}-${item.country}-${index}`}><span><strong>{item.city}</strong><small>{item.country}</small></span><b>{item.activeUsers}</b></div>)}</div> : null}
  </section>;
}
