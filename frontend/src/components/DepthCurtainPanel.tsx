import React, { useMemo, useState } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { FloatProfileResponse } from '../types';
import { DepthStrataIcon } from './Icons';

interface DepthCurtainPanelProps {
  profile: FloatProfileResponse | null;
  loading: boolean;
}

export const DepthCurtainPanel: React.FC<DepthCurtainPanelProps> = ({ profile, loading }) => {
  const [targetDepth, setTargetDepth] = useState<number>(100);
  const [veracityMode, setVeracityMode] = useState<'clean' | 'veracity'>('clean');

  const interpolated = useMemo(() => {
    if (!profile || profile.clean_profile.length === 0) return null;
    const pts = profile.clean_profile;
    let closest = pts[0];
    let minDiff = Math.abs(pts[0].depth_m - targetDepth);
    for (const p of pts) {
      const d = Math.abs(p.depth_m - targetDepth);
      if (d < minDiff) {
        minDiff = d;
        closest = p;
      }
    }
    return closest;
  }, [profile, targetDepth]);

  if (loading) {
    return (
      <div style={panelStyle}>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
          Querying DuckDB vertical column (0–2,000m)...
        </p>
      </div>
    );
  }

  if (!profile) {
    return (
      <div style={panelStyle}>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
          Select any Argo float marker on the Indian Ocean map to inspect its 0–2,000m water column and QC provenance.
        </p>
      </div>
    );
  }

  const { float_meta: meta, clean_profile: cleanPts, raw_profile: rawPts, time_series: ts } = profile;
  const rejectedPts = rawPts.filter((r) => !r.is_valid);

  return (
    <div style={panelStyle}>
      {/* Provenance "Trace Every Number" Pill */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '8px',
          paddingBottom: '12px',
          borderBottom: '1px solid var(--border-subtle)',
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span className="mono" style={{ fontSize: '1.05rem', fontWeight: 700, color: '#fff' }}>
              WMO #{meta.float_id}
            </span>
            {meta.is_heatwave_beacon && (
              <span
                className="mono"
                style={{
                  fontSize: '0.68rem',
                  padding: '2px 8px',
                  borderRadius: '999px',
                  background: 'var(--accent-coral-glow)',
                  color: 'var(--accent-coral)',
                  border: '1px solid var(--accent-coral)',
                }}
              >
                HEATWAVE BEACON
              </span>
            )}
          </div>
          <div className="mono" style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: '3px' }}>
            {meta.region} • {meta.lat}°N, {meta.lon}°E • Cycle #{profile.selected_cycle}
          </div>
        </div>

        <div
          className="mono"
          title="Exact Provenance Metadata"
          style={{
            fontSize: '0.68rem',
            padding: '5px 9px',
            borderRadius: '8px',
            background: 'var(--surface-seafoam-soft)',
            border: '1px solid var(--border-subtle)',
            color: 'var(--text-secondary)',
            textAlign: 'right',
          }}
        >
          <div>{meta.program}</div>
          <div style={{ color: 'var(--accent-seafoam-bright)' }}>
            {new Date(profile.observed_at).toISOString().slice(0, 10)} • {profile.query_latency_ms}ms
          </div>
        </div>
      </div>

      {/* Interactive Depth-Curtain Scrubber (0m -> 2000m) */}
      <div
        style={{
          marginTop: '14px',
          padding: '12px',
          borderRadius: '10px',
          background: 'rgba(11, 19, 30, 0.75)',
          border: '1px solid var(--border-subtle)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', fontWeight: 600 }}>
            <DepthStrataIcon size={15} />
            Depth-Curtain Scrubber
          </span>
          <span className="mono" style={{ fontSize: '0.82rem', color: 'var(--accent-coral)', fontWeight: 600 }}>
            {interpolated ? `${interpolated.depth_m}m` : `${targetDepth}m`}
          </span>
        </div>

        <input
          type="range"
          min={5}
          max={2000}
          step={5}
          value={targetDepth}
          onChange={(e) => setTargetDepth(Number(e.target.value))}
          style={{ width: '100%', accentColor: '#ff6b4a', cursor: 'pointer' }}
        />

        {interpolated && (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: '8px',
              marginTop: '10px',
            }}
          >
            <div style={metricBoxStyle}>
              <div style={metricLabelStyle}>Temperature</div>
              <div className="mono" style={{ fontSize: '1rem', fontWeight: 600, color: '#ff6b4a' }}>
                {interpolated.temp_c.toFixed(2)}°C
              </div>
            </div>
            <div style={metricBoxStyle}>
              <div style={metricLabelStyle}>Salinity</div>
              <div className="mono" style={{ fontSize: '1rem', fontWeight: 600, color: '#4ea5a8' }}>
                {interpolated.salinity_psu.toFixed(2)} PSU
              </div>
            </div>
            <div style={metricBoxStyle}>
              <div style={metricLabelStyle}>Zone</div>
              <div className="mono" style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                {interpolated.depth_stratum.split(' ')[0]}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Before & After QC Veracity Toggle */}
      <div style={{ display: 'flex', gap: '8px', marginTop: '14px' }}>
        <button
          onClick={() => setVeracityMode('clean')}
          style={tabBtnStyle(veracityMode === 'clean')}
        >
          QC-Verified ({cleanPts.length})
        </button>
        <button
          onClick={() => setVeracityMode('veracity')}
          style={tabBtnStyle(veracityMode === 'veracity')}
        >
          Before &amp; After QC ({rejectedPts.length} Rejected)
        </button>
      </div>

      {veracityMode === 'clean' ? (
        <>
          <div style={{ marginTop: '12px' }}>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: '6px' }}>
              Vertical Thermocline Profile (Temp °C vs Depth m)
            </div>
            <div style={{ width: '100%', height: '185px' }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={cleanPts} margin={{ top: 5, right: 12, left: -12, bottom: 0 }}>
                  <CartesianGrid stroke="rgba(78,165,168,0.12)" strokeDasharray="3 3" />
                  <XAxis dataKey="depth_m" stroke="#68828d" fontSize={10} tickFormatter={(v) => `${v}m`} />
                  <YAxis stroke="#68828d" fontSize={10} domain={['auto', 'auto']} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#0b131e',
                      border: '1px solid rgba(78,165,168,0.35)',
                      borderRadius: '8px',
                      fontSize: '11px',
                    }}
                  />
                  <Line type="monotone" dataKey="temp_c" name="Temp (°C)" stroke="#ff6b4a" strokeWidth={2.2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div style={{ marginTop: '12px' }}>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: '6px' }}>
              Multi-Year Surface Temperature Trend ({ts.length} Cycles)
            </div>
            <div style={{ width: '100%', height: '145px' }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={ts} margin={{ top: 5, right: 12, left: -12, bottom: 0 }}>
                  <CartesianGrid stroke="rgba(78,165,168,0.12)" strokeDasharray="3 3" />
                  <XAxis dataKey="year" stroke="#68828d" fontSize={10} />
                  <YAxis stroke="#68828d" fontSize={10} domain={['dataMin - 1', 'dataMax + 1']} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#0b131e',
                      border: '1px solid rgba(78,165,168,0.35)',
                      borderRadius: '8px',
                      fontSize: '11px',
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="surface_temp_c"
                    name="SST (°C)"
                    stroke="#4ea5a8"
                    fill="rgba(42,111,114,0.32)"
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </>
      ) : (
        <div style={{ marginTop: '12px' }}>
          <div
            className="mono"
            style={{
              fontSize: '0.75rem',
              padding: '8px 10px',
              borderRadius: '8px',
              background: 'rgba(255, 107, 74, 0.1)',
              border: '1px solid rgba(255, 107, 74, 0.35)',
              color: 'var(--text-primary)',
              marginBottom: '10px',
            }}
          >
            Lifetime Float Veracity: {meta.clean_points.toLocaleString()} Clean /{' '}
            {meta.raw_points.toLocaleString()} Raw ({meta.rejected_points.toLocaleString()} Rejected)
          </div>

          <div style={{ maxHeight: '295px', overflowY: 'auto', border: '1px solid var(--border-subtle)', borderRadius: '8px' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.74rem' }} className="mono">
              <thead style={{ background: 'var(--bg-abyss)', position: 'sticky', top: 0 }}>
                <tr style={{ color: 'var(--text-secondary)', textAlign: 'left' }}>
                  <th style={{ padding: '7px 8px' }}>Depth</th>
                  <th style={{ padding: '7px 8px' }}>Temp</th>
                  <th style={{ padding: '7px 8px' }}>QC (T/S/P)</th>
                  <th style={{ padding: '7px 8px' }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {rawPts.map((pt, idx) => (
                  <tr
                    key={idx}
                    style={{
                      borderTop: '1px solid rgba(78,165,168,0.1)',
                      background: pt.is_valid ? 'transparent' : 'rgba(255,107,74,0.08)',
                    }}
                  >
                    <td style={{ padding: '6px 8px' }}>{pt.depth_m}m</td>
                    <td style={{ padding: '6px 8px' }}>{pt.temp_c}°C</td>
                    <td style={{ padding: '6px 8px' }}>
                      {pt.temp_qc}/{pt.psal_qc}/{pt.pres_qc}
                    </td>
                    <td
                      style={{
                        padding: '6px 8px',
                        color: pt.is_valid ? '#4ea5a8' : '#ff6b4a',
                        fontWeight: pt.is_valid ? 400 : 600,
                      }}
                    >
                      {pt.is_valid ? 'PASS' : pt.rejection_reason}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

const panelStyle: React.CSSProperties = {
  background: 'var(--bg-slate)',
  border: '1px solid var(--border-subtle)',
  borderRadius: '12px',
  padding: '16px',
  display: 'flex',
  flexDirection: 'column',
  height: '100%',
};

const metricBoxStyle: React.CSSProperties = {
  background: 'var(--bg-slate)',
  border: '1px solid var(--border-subtle)',
  borderRadius: '8px',
  padding: '8px 10px',
};

const metricLabelStyle: React.CSSProperties = {
  fontSize: '0.68rem',
  color: 'var(--text-muted)',
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
};

const tabBtnStyle = (active: boolean): React.CSSProperties => ({
  flex: 1,
  padding: '7px 10px',
  borderRadius: '8px',
  fontSize: '0.75rem',
  fontWeight: 600,
  cursor: 'pointer',
  border: active ? '1px solid var(--accent-coral)' : '1px solid var(--border-subtle)',
  background: active ? 'var(--accent-coral-glow)' : 'var(--bg-abyss)',
  color: active ? '#fff' : 'var(--text-secondary)',
});
