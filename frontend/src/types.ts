export interface HealthResponse {
  status: string;
  app_name: string;
  duckdb_ready: boolean;
  total_floats: number;
  total_clean_rows: number;
  latest_run_id: string | null;
  query_latency_ms: number;
}

export interface FloatSummary {
  float_id: string;
  region: string;
  lat: number;
  lon: number;
  program: string;
  pi_name: string;
  latest_observed_at: string;
  latest_cycle: number;
  total_cycles: number;
  surface_temp_c: number | null;
  surface_salinity_psu: number | null;
  max_depth_m: number;
  raw_points: number;
  clean_points: number;
  rejected_points: number;
  surface_temp_anomaly_c: number;
  is_heatwave_beacon: boolean;
}

export interface ProfilePoint {
  depth_m: number;
  pres_dbar: number;
  temp_c: number;
  salinity_psu: number;
  depth_stratum: string;
}

export interface RawProfilePoint {
  depth_m: number;
  temp_c: number;
  salinity_psu: number;
  temp_qc: number;
  psal_qc: number;
  pres_qc: number;
  is_valid: boolean;
  rejection_reason: string;
}

export interface FloatTimePoint {
  cycle_number: number;
  observed_at: string;
  year: number;
  month: number;
  surface_temp_c: number;
  surface_salinity_psu: number;
}

export interface FloatProfileResponse {
  float_meta: FloatSummary;
  selected_cycle: number;
  observed_at: string;
  clean_profile: ProfilePoint[];
  raw_profile: RawProfilePoint[];
  time_series: FloatTimePoint[];
  query_latency_ms: number;
}

export interface GridAnomalyCell {
  grid_lat: number;
  grid_lon: number;
  year: number;
  month: number;
  region: string;
  mean_surface_temp_c: number;
  mean_surface_salinity_psu: number;
  baseline_temp_c: number;
  temp_anomaly_c: number;
  is_heatwave: boolean;
  observation_count: number;
  contributing_floats: number;
}

export interface GridAnomaliesResponse {
  year: number;
  month: number;
  cells: GridAnomalyCell[];
  heatwave_count: number;
  query_latency_ms: number;
}

export interface RegionAggregateResponse {
  min_lat: number;
  max_lat: number;
  min_lon: number;
  max_lon: number;
  float_count: number;
  observation_count: number;
  mean_surface_temp_c: number | null;
  mean_surface_salinity_psu: number | null;
  max_temp_anomaly_c: number | null;
  heatwave_beacons: number;
  query_latency_ms: number;
}

export interface PipelineRunRecord {
  run_id: string;
  started_at: string;
  completed_at: string;
  duration_ms: number;
  source_mode: string;
  raw_rows: number;
  clean_rows: number;
  rejected_qc_rows: number;
  rejected_range_rows: number;
  parquet_size_bytes: number;
  partition_count: number;
  status: string;
}

export interface PipelineTelemetryResponse {
  runs: PipelineRunRecord[];
  total_raw_rows: number;
  total_clean_rows: number;
  total_rejected_rows: number;
  veracity_pass_rate_pct: number;
  parquet_size_mb: number;
  partition_count: number;
  query_latency_ms: number;
}

export interface BoundingBox {
  label: string;
  minLat: number;
  maxLat: number;
  minLon: number;
  maxLon: number;
}
