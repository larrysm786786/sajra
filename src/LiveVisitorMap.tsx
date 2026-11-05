import React, { useMemo, useRef, useState } from "react";

interface CountryActivity { country: string; activeUsers: number; }
interface PointerPoint { x: number; y: number; }

// GA4 only returns country totals. These points mark country centroids, not visitors.
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

function mercatorPoint(longitude: number, latitude: number, worldSize: number): [number, number] {
  const lat = Math.max(-85, Math.min(85, latitude)) * Math.PI / 180;
  return [((longitude + 180) / 360) * worldSize, ((1 - Math.asinh(Math.tan(lat)) / Math.PI) / 2) * worldSize];
}

interface Props {
  countries: CountryActivity[];
  loading: boolean;
  error: string;
  onRefresh: () => void;
}

export default function LiveVisitorMap({ countries, loading, error, onRefresh }: Props) {
  const [zoom, setZoom] = useState(1);
  const [center, setCenter] = useState<[number, number]>([.5, .5]);
  const [viewport, setViewport] = useState({ width: 1000, height: 500 });
  const viewportRef = useRef<HTMLDivElement>(null);
  const pointersRef = useRef(new Map<number, PointerPoint>());
  const panStartRef = useRef<{ point: PointerPoint; center: [number, number] } | null>(null);
  const pinchStartRef = useRef<{ distance: number; zoom: number } | null>(null);
  const maxUsers = Math.max(1, ...countries.map((item) => item.activeUsers));
  const tileZoom = Math.max(1, Math.min(6, 2 + Math.floor(Math.log2(zoom))));
  const tileCount = 2 ** tileZoom;
  const worldSize = 256 * tileCount;
  const scale = viewport.width * zoom / worldSize;
  const offsetX = viewport.width / 2 - center[0] * worldSize * scale;
  const offsetY = viewport.height / 2 - center[1] * worldSize * scale;
  const visibleTiles = useMemo(() => {
    const left = Math.max(0, Math.floor((-offsetX / scale) / 256));
    const right = Math.min(tileCount - 1, Math.floor(((viewport.width - offsetX) / scale) / 256));
    const top = Math.max(0, Math.floor((-offsetY / scale) / 256));
    const bottom = Math.min(tileCount - 1, Math.floor(((viewport.height - offsetY) / scale) / 256));
    const tiles: { x: number; y: number }[] = [];
    for (let y = top; y <= bottom; y++) for (let x = left; x <= right; x++) tiles.push({ x, y });
    return tiles;
  }, [offsetX, offsetY, scale, tileCount, viewport.height, viewport.width]);

  function clampCenter(next: [number, number], nextZoom = zoom): [number, number] {
    const halfW = .5 / nextZoom;
    const halfH = viewport.height / (2 * viewport.width * nextZoom);
    return [Math.max(halfW, Math.min(1 - halfW, next[0])), Math.max(halfH, Math.min(1 - halfH, next[1]))];
  }
  function setZoomAround(nextZoom: number) {
    const bounded = Math.max(.75, Math.min(8, nextZoom));
    setCenter((current) => clampCenter(current, bounded));
    setZoom(bounded);
  }
  function onPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    setViewport({ width: rect.width, height: rect.height });
    event.currentTarget.setPointerCapture(event.pointerId);
    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointersRef.current.size === 1) {
      panStartRef.current = { point: { x: event.clientX, y: event.clientY }, center };
    } else if (pointersRef.current.size === 2) {
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
      const dx = (event.clientX - start.point.x) / (rect.width * zoom);
      const dy = (event.clientY - start.point.y) / (rect.width * zoom);
      setCenter(clampCenter([start.center[0] - dx, start.center[1] - dy]));
    }
  }
  function onPointerEnd(event: React.PointerEvent<HTMLDivElement>) {
    pointersRef.current.delete(event.pointerId);
    pinchStartRef.current = null;
    panStartRef.current = null;
    if (pointersRef.current.size === 1) {
      const [[, point]] = [...pointersRef.current.entries()];
      panStartRef.current = { point, center };
    }
  }

  return <section className="card live-visitor-card" aria-label="Live visitors map">
    <div className="live-visitor-heading">
      <div><span className="live-indicator" /> <strong>Live visitors by country</strong><small>Approximate locations · updated every minute</small></div>
      <button className="btn-ghost live-refresh" type="button" onClick={onRefresh} disabled={loading}>{loading ? "Updating…" : "Refresh"}</button>
    </div>
    {error ? <div className="notice danger live-map-error">{error}</div> : null}
    <div
      className="live-map-wrap"
      ref={viewportRef}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerEnd}
      onPointerCancel={onPointerEnd}
      onWheel={(event) => { event.preventDefault(); setZoomAround(zoom * (event.deltaY < 0 ? 1.15 : .87)); }}
      onDoubleClick={() => setZoomAround(zoom * 1.5)}
      role="region"
      aria-label="Interactive world map. Pinch to zoom and drag to move."
    >
      <div className="live-map-layer" style={{ width: worldSize, height: worldSize, transform: `translate(${offsetX}px, ${offsetY}px) scale(${scale})` }}>
        {visibleTiles.map(({ x, y }) => <img className="live-map-tile" key={`${tileZoom}/${x}/${y}`} src={`https://tile.openstreetmap.org/${tileZoom}/${x}/${y}.png`} alt="" draggable={false} style={{ left: x * 256, top: y * 256 }} />)}
        {countries.map((item) => {
          const coordinates = CENTROIDS[item.country];
          if (!coordinates) return null;
          const [x, y] = mercatorPoint(coordinates[0], coordinates[1], worldSize);
          const size = 10 + 10 * item.activeUsers / maxUsers;
          return <span key={item.country} className="live-map-marker" style={{ left: x, top: y, width: size, height: size }} title={`${item.country}: ${item.activeUsers} active users`} />;
        })}
      </div>
      <div className="live-map-controls" aria-label="Map zoom controls">
        <button type="button" aria-label="Zoom in" onPointerDown={(e) => e.stopPropagation()} onClick={() => setZoomAround(zoom * 1.5)}>+</button>
        <button type="button" aria-label="Zoom out" onPointerDown={(e) => e.stopPropagation()} onClick={() => setZoomAround(zoom / 1.5)}>−</button>
        <button type="button" aria-label="Reset map view" onPointerDown={(e) => e.stopPropagation()} onClick={() => { setZoom(1); setCenter([.5, .5]); }}>↺</button>
      </div>
      {!loading && !countries.length && !error ? <div className="live-map-empty">No active visitor locations reported right now.</div> : null}
      <a className="live-map-attribution" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap contributors</a>
    </div>
    {countries.length ? <div className="live-country-list">{countries.slice(0, 8).map((item) => <div key={item.country}><span>{item.country}</span><strong>{item.activeUsers}</strong></div>)}</div> : null}
    <small className="live-map-note">Google Analytics reports approximate country totals for active users. Individual locations are not shown.</small>
  </section>;
}
