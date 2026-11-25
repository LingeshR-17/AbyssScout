import type {
  FloatProfileResponse,
  FloatSummary,
  GridAnomaliesResponse,
  HealthResponse,
  PipelineTelemetryResponse,
  RegionAggregateResponse,
} from './types';

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`API error ${res.status}: ${await res.text()}`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  getHealth: () => fetchJson<HealthResponse>('/api/health'),
  getFloats: (region?: string, heatwaveOnly = false) => {
    const params = new URLSearchParams();
    if (region && region !== 'All') params.set('region', region);
    if (heatwaveOnly) params.set('heatwave_only', 'true');
    return fetchJson<FloatSummary[]>(`/api/floats?${params.toString()}`);
  },
  getFloatProfile: (floatId: string, cycleNumber?: number) => {
    const params = cycleNumber ? `?cycle_number=${cycleNumber}` : '';
    return fetchJson<FloatProfileResponse>(`/api/floats/${floatId}/profile${params}`);
  },
  getGridAnomalies: (year: number, month: number, region?: string) => {
    const params = new URLSearchParams({ year: String(year), month: String(month) });
    if (region && region !== 'All') params.set('region', region);
    return fetchJson<GridAnomaliesResponse>(`/api/analytics/grid-anomalies?${params.toString()}`);
  },
  getRegionAggregate: (minLat: number, maxLat: number, minLon: number, maxLon: number) => {
    const params = new URLSearchParams({
      min_lat: String(minLat),
      max_lat: String(maxLat),
      min_lon: String(minLon),
      max_lon: String(maxLon),
    });
    return fetchJson<RegionAggregateResponse>(`/api/analytics/region-aggregate?${params.toString()}`);
  },
  getPipelineTelemetry: () => fetchJson<PipelineTelemetryResponse>('/api/pipeline/telemetry'),
  getExportUrl: (format: 'csv' | 'parquet', minLat: number, maxLat: number, minLon: number, maxLon: number) => {
    const params = new URLSearchParams({
      format,
      min_lat: String(minLat),
      max_lat: String(maxLat),
      min_lon: String(minLon),
      max_lon: String(maxLon),
    });
    return `/api/export?${params.toString()}`;
  },
};
