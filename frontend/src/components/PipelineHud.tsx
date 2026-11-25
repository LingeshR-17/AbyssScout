import React from 'react';
import type { PipelineTelemetryResponse } from '../types';

interface PipelineHudProps {
  telemetry: PipelineTelemetryResponse | null;
}

export const PipelineHud: React.FC<PipelineHudProps> = ({ telemetry }) => {
  if (!telemetry) {
    return (
      <div style={{ padding: '24px', color: 'var(--text-secondary)' }}>
        Loading Lakehouse Telemetry HUD...
      </div>
    );
  }

  const latest = telemetry.runs[0];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Top Big Data KPI Strip */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
          gap: '12px',
        }}
      >
        <KpiCard
          label="Raw Telemetry Ingested"
          value={telemetry.total_raw_rows.toLocaleString()}
          sub="Stage 1: Argo NetCDF / ERDDAP"
        />
        <KpiCard
          label="QC-Verified Lakehouse Rows"
          value={telemetry.total_clean_rows.toLocaleString()}
          sub={`${telemetry.veracity_pass_rate_pct}% Veracity Pass Rate`}
          accent="#4ea5a8"
        />
        <KpiCard
          label="Rejected Bad Flags & Spikes"
          value={telemetry.total_rejected_rows.toLocaleString()}
          sub="Stage 2: QC != 1 & >2000m Guard"
          accent="#ff6b4a"
        />
        <KpiCard
          label="Partitioned Apache Parquet"
          value={`${telemetry.parquet_size_mb} MB`}
          sub={`${telemetry.partition_count} Partitions (year / region)`}
        />
        <KpiCard
          label="DuckDB OLAP Latency"
          value={`${telemetry.query_latency_ms} ms`}
          sub="Sub-second Analytical Serving"
          accent="#4ea5a8"
        />
      </div>

      {/* Veracity Funnel Visualization */}
      {latest && (
        <div style={cardStyle}>
          <h3 style={{ fontSize: '0.95rem', marginBottom: '12px' }}>
            Stage 2 Veracity Funnel (Latest Run: <span className="mono">{latest.run_id}</span>)
          </h3>
          <div style={{ display: 'flex', height: '24px', borderRadius: '8px', overflow: 'hidden', border: '1px solid var(--border-subtle)' }}>
            <div
              style={{
                width: `${(latest.clean_rows / latest.raw_rows) * 100}%`,
                background: '#2a6f72',
              }}
              title={`Clean: ${latest.clean_rows}`}
            />
            <div
              style={{
                width: `${(latest.rejected_qc_rows / latest.raw_rows) * 100}%`,
                background: '#ff6b4a',
              }}
              title={`QC Flag Rejected: ${latest.rejected_qc_rows}`}
            />
            <div
              style={{
                width: `${(latest.rejected_range_rows / latest.raw_rows) * 100}%`,
                background: '#e8985e',
              }}
              title={`Range Spike Rejected: ${latest.rejected_range_rows}`}
            />
          </div>
          <div className="mono" style={{ display: 'flex', gap: '20px', fontSize: '0.75rem', marginTop: '10px', color: 'var(--text-secondary)' }}>
            <span><span style={{ color: '#4ea5a8' }}>■</span> Clean Passed: {latest.clean_rows.toLocaleString()}</span>
            <span><span style={{ color: '#ff6b4a' }}>■</span> QC Flag Rejected: {latest.rejected_qc_rows.toLocaleString()}</span>
            <span><span style={{ color: '#e8985e' }}>■</span> Range/Depth Rejected: {latest.rejected_range_rows.toLocaleString()}</span>
          </div>
        </div>
      )}

      {/* Pipeline Runs Audit Log */}
      <div style={cardStyle}>
        <h3 style={{ fontSize: '0.95rem', marginBottom: '12px' }}>
          DuckDB Lakehouse Audit Log (<span className="mono">pipeline_runs</span>)
        </h3>
        <div style={{ overflowX: 'auto' }}>
          <table className="mono" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.76rem' }}>
            <thead>
              <tr style={{ color: 'var(--text-muted)', textAlign: 'left', borderBottom: '1px solid var(--border-subtle)' }}>
                <th style={{ padding: '8px' }}>Run ID</th>
                <th style={{ padding: '8px' }}>Source Mode</th>
                <th style={{ padding: '8px' }}>Duration</th>
                <th style={{ padding: '8px' }}>Raw → Clean</th>
                <th style={{ padding: '8px' }}>Partitions</th>
                <th style={{ padding: '8px' }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {telemetry.runs.map((r) => (
                <tr key={r.run_id} style={{ borderBottom: '1px solid rgba(78,165,168,0.1)' }}>
                  <td style={{ padding: '8px', color: '#fff' }}>{r.run_id}</td>
                  <td style={{ padding: '8px', color: 'var(--text-secondary)' }}>{r.source_mode}</td>
                  <td style={{ padding: '8px' }}>{r.duration_ms.toFixed(0)} ms</td>
                  <td style={{ padding: '8px' }}>
                    {r.raw_rows.toLocaleString()} → <span style={{ color: '#4ea5a8' }}>{r.clean_rows.toLocaleString()}</span>
                  </td>
                  <td style={{ padding: '8px' }}>{r.partition_count} Parquet</td>
                  <td style={{ padding: '8px', color: '#4ea5a8', textTransform: 'uppercase' }}>{r.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

const KpiCard: React.FC<{ label: string; value: string; sub: string; accent?: string }> = ({
  label,
  value,
  sub,
  accent,
}) => (
  <div style={cardStyle}>
    <div style={{ fontSize: '0.74rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>{label}</div>
    <div className="mono" style={{ fontSize: '1.45rem', fontWeight: 700, color: accent || '#fff' }}>
      {value}
    </div>
    <div className="mono" style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '4px' }}>
      {sub}
    </div>
  </div>
);

const cardStyle: React.CSSProperties = {
  background: 'var(--bg-slate)',
  border: '1px solid var(--border-subtle)',
  borderRadius: '12px',
  padding: '16px',
};
