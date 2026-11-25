"""Strict Pydantic v2 schemas for AbyssScout analytical REST endpoints."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field


class HealthResponse(BaseModel):
    status: str
    app_name: str
    duckdb_ready: bool
    total_floats: int
    total_clean_rows: int
    latest_run_id: str | None = None
    query_latency_ms: float


class FloatSummary(BaseModel):
    float_id: str
    region: str
    lat: float
    lon: float
    program: str
    pi_name: str
    latest_observed_at: datetime
    latest_cycle: int
    total_cycles: int
    surface_temp_c: float | None = None
    surface_salinity_psu: float | None = None
    max_depth_m: float
    raw_points: int
    clean_points: int
    rejected_points: int
    surface_temp_anomaly_c: float
    is_heatwave_beacon: bool


class ProfilePoint(BaseModel):
    depth_m: float
    pres_dbar: float
    temp_c: float
    salinity_psu: float
    depth_stratum: str


class RawProfilePoint(BaseModel):
    depth_m: float
    temp_c: float
    salinity_psu: float
    temp_qc: int
    psal_qc: int
    pres_qc: int
    is_valid: bool
    rejection_reason: str


class FloatTimePoint(BaseModel):
    cycle_number: int
    observed_at: datetime
    year: int
    month: int
    surface_temp_c: float
    surface_salinity_psu: float


class FloatProfileResponse(BaseModel):
    float_meta: FloatSummary
    selected_cycle: int
    observed_at: datetime
    clean_profile: list[ProfilePoint]
    raw_profile: list[RawProfilePoint]
    time_series: list[FloatTimePoint]
    query_latency_ms: float


class GridAnomalyCell(BaseModel):
    grid_lat: int
    grid_lon: int
    year: int
    month: int
    region: str
    mean_surface_temp_c: float
    mean_surface_salinity_psu: float
    baseline_temp_c: float
    temp_anomaly_c: float
    is_heatwave: bool
    observation_count: int
    contributing_floats: int


class GridAnomaliesResponse(BaseModel):
    year: int
    month: int
    cells: list[GridAnomalyCell]
    heatwave_count: int
    query_latency_ms: float


class RegionAggregateResponse(BaseModel):
    min_lat: float = Field(ge=-90, le=90)
    max_lat: float = Field(ge=-90, le=90)
    min_lon: float = Field(ge=-180, le=180)
    max_lon: float = Field(ge=-180, le=180)
    float_count: int
    observation_count: int
    mean_surface_temp_c: float | None = None
    mean_surface_salinity_psu: float | None = None
    max_temp_anomaly_c: float | None = None
    heatwave_beacons: int
    query_latency_ms: float


class DepthClimatologyPoint(BaseModel):
    region: str
    year: int
    depth_m: float
    depth_stratum: str
    mean_temp_c: float
    min_temp_c: float
    max_temp_c: float
    mean_salinity_psu: float
    sample_count: int


class PipelineRunRecord(BaseModel):
    run_id: str
    started_at: datetime
    completed_at: datetime
    duration_ms: float
    source_mode: str
    raw_rows: int
    clean_rows: int
    rejected_qc_rows: int
    rejected_range_rows: int
    parquet_size_bytes: int
    partition_count: int
    status: str


class PipelineTelemetryResponse(BaseModel):
    runs: list[PipelineRunRecord]
    total_raw_rows: int
    total_clean_rows: int
    total_rejected_rows: int
    veracity_pass_rate_pct: float
    parquet_size_mb: float
    partition_count: int
    query_latency_ms: float
