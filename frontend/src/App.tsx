import React, { useCallback, useEffect, useState } from 'react';
import { api } from './api';
import { DepthCurtainPanel } from './components/DepthCurtainPanel';
import { LakehouseGridIcon, SonarPingMark } from './components/Icons';
import { OceanMap } from './components/OceanMap';
import { PipelineHud } from './components/PipelineHud';
import type {
  BoundingBox,
  FloatProfileResponse,
  FloatSummary,
  GridAnomalyCell,
  HealthResponse,
  PipelineTelemetryResponse,
  RegionAggregateResponse,
} from './types';

const BASIN_PRESETS: BoundingBox[] = [
  { label: 'Bay of Bengal', minLat: 6, maxLat: 22, minLon: 79, maxLon: 94 },
  { label: 'Arabian Sea', minLat: 7, maxLat: 23, minLon: 56, maxLon: 76 },
  { label: 'Equatorial Indian Ocean', minLat: -5, maxLat: 6, minLon: 62, maxLon: 95 },
];

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function App() {
  const [activeTab, setActiveTab] = useState<'observatory' | 'pipeline'>('observatory');
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [floats, setFloats] = useState<FloatSummary[]>([]);
  const [regionFilter, setRegionFilter] = useState<string>('All');
  const [heatwaveOnly, setHeatwaveOnly] = useState<boolean>(false);

  const [selectedFloatId, setSelectedFloatId] = useState<string | null>(null);
  const [profile, setProfile] = useState<FloatProfileResponse | null>(null);
  const [profileLoading, setProfileLoading] = useState<boolean>(false);

  // Time-Lapse Heatmap Scrubber state
  const [year, setYear] = useState<number>(2025);
  const [month, setMonth] = useState<number>(5);
  const [showHeatmap, setShowHeatmap] = useState<boolean>(true);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [gridCells, setGridCells] = useState<GridAnomalyCell[]>([]);

  // Bounding-Box Region Inspector state
  const [activeBox, setActiveBox] = useState<BoundingBox>(BASIN_PRESETS[0]);
  const [regionAgg, setRegionAgg] = useState<RegionAggregateResponse | null>(null);

  // Pipeline Telemetry HUD state
  const [telemetry, setTelemetry] = useState<PipelineTelemetryResponse | null>(null);

  // Load initial health & telemetry
  useEffect(() => {
    api.getHealth().then(setHealth).catch(console.error);
    api.getPipelineTelemetry().then(setTelemetry).catch(console.error);
  }, []);

  // Load floats whenever filters change
  useEffect(() => {
    api
      .getFloats(regionFilter, heatwaveOnly)
      .then((list) => {
        setFloats(list);
        if (list.length > 0 && !selectedFloatId) {
          setSelectedFloatId(list[0].float_id);
        }
      })
      .catch(console.error);
  }, [regionFilter, heatwaveOnly, selectedFloatId]);

  // Load selected float vertical profile
  const handleSelectFloat = useCallback((fid: string) => {
    setSelectedFloatId(fid);
  }, []);

  useEffect(() => {
    if (!selectedFloatId) return;
    setProfileLoading(true);
    api
      .getFloatProfile(selectedFloatId)
      .then(setProfile)
      .catch(console.error)
      .finally(() => setProfileLoading(false));
  }, [selectedFloatId]);

  // Load 1x1 degree grid anomalies for time-lapse scrubber
  useEffect(() => {
    api
      .getGridAnomalies(year, month, regionFilter)
      .then((res) => setGridCells(res.cells))
      .catch(console.error);
  }, [year, month, regionFilter]);

  // Time-lapse autoplay timer
  useEffect(() => {
    if (!isPlaying) return;
    const timer = window.setInterval(() => {
      setMonth((prevMonth) => {
        if (prevMonth === 12) {
          setYear((y) => (y >= 2025 ? 2022 : y + 1));
          return 1;
        }
        return prevMonth + 1;
      });
    }, 1100);
    return () => window.clearInterval(timer);
  }, [isPlaying]);

  // Load Bounding-Box Region Aggregate
  useEffect(() => {
    api
      .getRegionAggregate(activeBox.minLat, activeBox.maxLat, activeBox.minLon, activeBox.maxLon)
      .then(setRegionAgg)
      .catch(console.error);
  }, [activeBox]);

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Top Telemetry Header */}
      <header
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px',
          padding: '12px 22px',
          background: 'var(--bg-slate)',
          borderBottom: '1px solid var(--border-subtle)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <SonarPingMark size={30} />
          <div>
            <h1 style={{ fontSize: '1.15rem', fontWeight: 700, lineHeight: 1.1 }}>
              AbyssScout
            </h1>
            <div style={{ fontSize: '0.74rem', color: 'var(--text-secondary)' }}>
              Indian Ocean Big Data Telemetry &amp; Anomaly Lakehouse
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <button
            onClick={() => setActiveTab('observatory')}
            style={navTabStyle(activeTab === 'observatory')}
          >
            Spatial Observatory
          </button>
          <button
            onClick={() => setActiveTab('pipeline')}
            style={navTabStyle(activeTab === 'pipeline')}
          >
            <LakehouseGridIcon size={14} />
            Pipeline HUD
          </button>

          {health && (
            <div
              className="mono"
              style={{
                fontSize: '0.72rem',
                padding: '6px 10px',
                borderRadius: '999px',
                background: 'var(--surface-seafoam-soft)',
                border: '1px solid var(--border-subtle)',
                color: '#4ea5a8',
              }}
            >
              DUCKDB {health.status.toUpperCase()} • {health.total_clean_rows.toLocaleString()} ROWS •{' '}
              {health.query_latency_ms}ms
            </div>
          )}
        </div>
      </header>

      {/* Main Content */}
      <main style={{ flex: 1, padding: '16px 22px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
        {activeTab === 'pipeline' ? (
          <PipelineHud telemetry={telemetry} />
        ) : (
          <>
            {/* Filter & Bounding-Box Inspector Bar */}
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '12px',
                padding: '10px 14px',
                background: 'var(--bg-slate)',
                border: '1px solid var(--border-subtle)',
                borderRadius: '10px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>Basin:</span>
                {['All', 'Bay of Bengal', 'Arabian Sea', 'Equatorial Indian Ocean'].map((b) => (
                  <button
                    key={b}
                    onClick={() => setRegionFilter(b)}
                    style={pillBtnStyle(regionFilter === b)}
                  >
                    {b}
                  </button>
                ))}
                <button
                  onClick={() => setHeatwaveOnly((v) => !v)}
                  style={{
                    ...pillBtnStyle(heatwaveOnly),
                    borderColor: heatwaveOnly ? 'var(--accent-coral)' : 'var(--border-subtle)',
                    color: heatwaveOnly ? 'var(--accent-coral)' : 'var(--text-secondary)',
                  }}
                >
                  Heatwave Beacons Only
                </button>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>Box Inspector:</span>
                <select
                  value={activeBox.label}
                  onChange={(e) => {
                    const found = BASIN_PRESETS.find((p) => p.label === e.target.value);
                    if (found) setActiveBox(found);
                  }}
                  style={selectStyle}
                >
                  {BASIN_PRESETS.map((p) => (
                    <option key={p.label} value={p.label}>
                      {p.label}
                    </option>
                  ))}
                </select>
                <a
                  href={api.getExportUrl('csv', activeBox.minLat, activeBox.maxLat, activeBox.minLon, activeBox.maxLon)}
                  style={exportLinkStyle}
                >
                  Export CSV
                </a>
                <a
                  href={api.getExportUrl('parquet', activeBox.minLat, activeBox.maxLat, activeBox.minLon, activeBox.maxLon)}
                  style={exportLinkStyle}
                >
                  Export Parquet
                </a>
              </div>
            </div>

            {/* Observatory Split Workspace */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'minmax(0, 1.35fr) minmax(350px, 0.95fr)',
                gap: '14px',
                flex: 1,
                minHeight: '560px',
              }}
            >
              {/* Left: Map + Time-Lapse Scrubber + Region Summary */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div style={{ flex: 1, minHeight: '440px', position: 'relative' }}>
                  <OceanMap
                    floats={floats}
                    selectedFloatId={selectedFloatId}
                    onSelectFloat={handleSelectFloat}
                    gridCells={gridCells}
                    showHeatmap={showHeatmap}
                    activeBox={activeBox}
                  />
                </div>

                {/* Time-Lapse Monthly Heatmap Scrubber */}
                <div
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '12px',
                    padding: '10px 14px',
                    background: 'var(--bg-slate)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: '10px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <button
                      onClick={() => setIsPlaying((p) => !p)}
                      style={{
                        ...pillBtnStyle(isPlaying),
                        background: isPlaying ? 'var(--accent-coral)' : 'var(--surface-seafoam)',
                        color: '#fff',
                      }}
                    >
                      {isPlaying ? 'Pause' : 'Play'} Time-Lapse
                    </button>
                    <span className="mono" style={{ fontSize: '0.84rem', fontWeight: 600 }}>
                      {MONTHS[month - 1]} {year}
                    </span>
                    <label style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                      <input
                        type="checkbox"
                        checked={showHeatmap}
                        onChange={(e) => setShowHeatmap(e.target.checked)}
                      />
                      1°×1° Anomaly Grid
                    </label>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, maxWidth: '380px' }}>
                    <select
                      value={year}
                      onChange={(e) => setYear(Number(e.target.value))}
                      style={selectStyle}
                    >
                      {[2022, 2023, 2024, 2025].map((y) => (
                        <option key={y} value={y}>
                          {y}
                        </option>
                      ))}
                    </select>
                    <input
                      type="range"
                      min={1}
                      max={12}
                      value={month}
                      onChange={(e) => setMonth(Number(e.target.value))}
                      style={{ flex: 1, accentColor: '#ff6b4a' }}
                    />
                  </div>
                </div>

                {/* Live Bounding-Box Aggregation Strip */}
                {regionAgg && (
                  <div
                    className="mono"
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
                      gap: '10px',
                      padding: '10px 14px',
                      background: 'var(--bg-slate)',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: '10px',
                      fontSize: '0.75rem',
                    }}
                  >
                    <div>
                      <div style={{ color: 'var(--text-muted)' }}>Box Floats</div>
                      <div style={{ fontSize: '0.95rem', fontWeight: 600 }}>{regionAgg.float_count}</div>
                    </div>
                    <div>
                      <div style={{ color: 'var(--text-muted)' }}>Observations</div>
                      <div style={{ fontSize: '0.95rem', fontWeight: 600 }}>
                        {regionAgg.observation_count.toLocaleString()}
                      </div>
                    </div>
                    <div>
                      <div style={{ color: 'var(--text-muted)' }}>Mean SST</div>
                      <div style={{ fontSize: '0.95rem', fontWeight: 600, color: '#ff6b4a' }}>
                        {regionAgg.mean_surface_temp_c ?? '—'}°C
                      </div>
                    </div>
                    <div>
                      <div style={{ color: 'var(--text-muted)' }}>Mean Salinity</div>
                      <div style={{ fontSize: '0.95rem', fontWeight: 600, color: '#4ea5a8' }}>
                        {regionAgg.mean_surface_salinity_psu ?? '—'} PSU
                      </div>
                    </div>
                    <div>
                      <div style={{ color: 'var(--text-muted)' }}>Beacons / Query</div>
                      <div style={{ fontSize: '0.95rem', fontWeight: 600 }}>
                        {regionAgg.heatwave_beacons} • {regionAgg.query_latency_ms}ms
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Right: Depth-Curtain & Veracity Drawer */}
              <DepthCurtainPanel profile={profile} loading={profileLoading} />
            </div>
          </>
        )}
      </main>
    </div>
  );
}

const navTabStyle = (active: boolean): React.CSSProperties => ({
  display: 'inline-flex',
  alignItems: 'center',
  gap: '6px',
  padding: '7px 14px',
  borderRadius: '8px',
  fontSize: '0.8rem',
  fontWeight: 600,
  cursor: 'pointer',
  border: active ? '1px solid var(--accent-coral)' : '1px solid var(--border-subtle)',
  background: active ? 'var(--accent-coral-glow)' : 'var(--bg-abyss)',
  color: active ? '#fff' : 'var(--text-secondary)',
});

const pillBtnStyle = (active: boolean): React.CSSProperties => ({
  padding: '5px 11px',
  borderRadius: '999px',
  fontSize: '0.75rem',
  fontWeight: 600,
  cursor: 'pointer',
  border: active ? '1px solid #4ea5a8' : '1px solid var(--border-subtle)',
  background: active ? 'var(--surface-seafoam)' : 'var(--bg-abyss)',
  color: active ? '#fff' : 'var(--text-secondary)',
});

const selectStyle: React.CSSProperties = {
  background: 'var(--bg-abyss)',
  color: 'var(--text-primary)',
  border: '1px solid var(--border-subtle)',
  borderRadius: '8px',
  padding: '5px 10px',
  fontSize: '0.76rem',
};

const exportLinkStyle: React.CSSProperties = {
  padding: '5px 10px',
  borderRadius: '8px',
  fontSize: '0.74rem',
  fontWeight: 600,
  textDecoration: 'none',
  background: 'var(--surface-seafoam-soft)',
  border: '1px solid var(--border-subtle)',
  color: '#4ea5a8',
};

export default App;
