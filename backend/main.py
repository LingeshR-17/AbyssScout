"""AbyssScout FastAPI REST Server — Big Data Analytical Serving Layer."""

from __future__ import annotations

import io
import time
from typing import Literal

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

from backend.db import get_duckdb_conn
from backend.schemas import (
    DepthClimatologyPoint,
    FloatProfileResponse,
    FloatSummary,
    FloatTimePoint,
    GridAnomaliesResponse,
    GridAnomalyCell,
    HealthResponse,
    PipelineRunRecord,
    PipelineTelemetryResponse,
    ProfilePoint,
    RawProfilePoint,
    RegionAggregateResponse,
)
from pipeline.config import settings

app = FastAPI(
    title="AbyssScout Analytical API",
    description="Read-only Big Data Lakehouse API for Indian Ocean Argo Telemetry & Marine Heatwave Analytics.",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["GET"],
    allow_headers=["*"],
)


@app.get("/api/health", response_model=HealthResponse)
def health_check() -> HealthResponse:
    """Verify DuckDB warehouse readiness and return high-level lakehouse counts."""
    t0 = time.perf_counter()
    if not settings.duckdb_file_path.exists():
        return HealthResponse(
            status="degraded",
            app_name=settings.app_name,
            duckdb_ready=False,
            total_floats=0,
            total_clean_rows=0,
            latest_run_id=None,
            query_latency_ms=round((time.perf_counter() - t0) * 1000.0, 2),
        )

    with get_duckdb_conn() as conn:
        total_floats = int(conn.execute("SELECT COUNT(*) FROM floats").fetchone()[0])
        total_clean = int(conn.execute("SELECT COUNT(*) FROM profiles_clean").fetchone()[0])
        latest = conn.execute(
            "SELECT run_id FROM pipeline_runs ORDER BY completed_at DESC LIMIT 1"
        ).fetchone()
        latest_run_id = latest[0] if latest else None

    return HealthResponse(
        status="healthy",
        app_name=settings.app_name,
        duckdb_ready=True,
        total_floats=total_floats,
        total_clean_rows=total_clean,
        latest_run_id=latest_run_id,
        query_latency_ms=round((time.perf_counter() - t0) * 1000.0, 2),
    )


@app.get("/api/floats", response_model=list[FloatSummary])
def list_floats(
    region: str | None = Query(default=None, description="Filter by Indian Ocean basin"),
    heatwave_only: bool = Query(default=False, description="Only return heatwave beacon floats"),
    limit: int = Query(default=100, ge=1, le=500),
) -> list[FloatSummary]:
    """Return catalog of active Argo floats with provenance and QC veracity metrics."""
    clauses: list[str] = []
    params: list[object] = []

    if region and region.lower() != "all":
        clauses.append("region = ?")
        params.append(region)
    if heatwave_only:
        clauses.append("is_heatwave_beacon = TRUE")

    where_sql = f"WHERE {' AND '.join(clauses)}" if clauses else ""
    params.append(limit)

    with get_duckdb_conn() as conn:
        df = conn.execute(
            f"SELECT * FROM floats {where_sql} ORDER BY is_heatwave_beacon DESC, float_id ASC LIMIT ?",
            params,
        ).fetchdf()

    return [FloatSummary(**rec) for rec in df.to_dict(orient="records")]


@app.get("/api/floats/{float_id}/profile", response_model=FloatProfileResponse)
def get_float_profile(
    float_id: str,
    cycle_number: int | None = Query(default=None, ge=1),
) -> FloatProfileResponse:
    """
    Return vertical 0-2000m profile (clean + raw QC-rejected points) and historical
    surface time-series for a specific Argo float.
    """
    t0 = time.perf_counter()
    with get_duckdb_conn() as conn:
        meta_df = conn.execute("SELECT * FROM floats WHERE float_id = ?", [float_id]).fetchdf()
        if meta_df.empty:
            raise HTTPException(status_code=404, detail=f"Float {float_id} not found")

        float_meta = FloatSummary(**meta_df.to_dict(orient="records")[0])
        target_cycle = cycle_number or float_meta.latest_cycle

        clean_df = conn.execute(
            """
            SELECT depth_m, pres_dbar, temp_c, salinity_psu, depth_stratum, observed_at
            FROM profiles_clean
            WHERE float_id = ? AND cycle_number = ?
            ORDER BY depth_m ASC
            """,
            [float_id, target_cycle],
        ).fetchdf()

        if clean_df.empty:
            raise HTTPException(
                status_code=404,
                detail=f"Cycle {target_cycle} not found for float {float_id}",
            )

        raw_df = conn.execute(
            """
            SELECT depth_m, temp_c, salinity_psu, temp_qc, psal_qc, pres_qc, is_valid, rejection_reason
            FROM profiles_raw
            WHERE float_id = ? AND cycle_number = ?
            ORDER BY depth_m ASC
            """,
            [float_id, target_cycle],
        ).fetchdf()

        ts_df = conn.execute(
            """
            SELECT
                cycle_number,
                MIN(observed_at) AS observed_at,
                ANY_VALUE(year) AS year,
                ANY_VALUE(month) AS month,
                ROUND(AVG(CASE WHEN depth_m <= 20.0 THEN temp_c END), 2) AS surface_temp_c,
                ROUND(AVG(CASE WHEN depth_m <= 20.0 THEN salinity_psu END), 2) AS surface_salinity_psu
            FROM profiles_clean
            WHERE float_id = ?
            GROUP BY cycle_number
            ORDER BY cycle_number ASC
            """,
            [float_id],
        ).fetchdf()

    observed_at = clean_df["observed_at"].iloc[0]
    clean_points = [
        ProfilePoint(**rec)
        for rec in clean_df.drop(columns=["observed_at"]).to_dict(orient="records")
    ]
    raw_points = [RawProfilePoint(**rec) for rec in raw_df.to_dict(orient="records")]
    time_series = [FloatTimePoint(**rec) for rec in ts_df.dropna().to_dict(orient="records")]

    return FloatProfileResponse(
        float_meta=float_meta,
        selected_cycle=target_cycle,
        observed_at=observed_at,
        clean_profile=clean_points,
        raw_profile=raw_points,
        time_series=time_series,
        query_latency_ms=round((time.perf_counter() - t0) * 1000.0, 2),
    )


@app.get("/api/analytics/grid-anomalies", response_model=GridAnomaliesResponse)
def get_grid_anomalies(
    year: int = Query(default=2025, ge=2000, le=2100),
    month: int = Query(default=5, ge=1, le=12),
    region: str | None = Query(default=None),
) -> GridAnomaliesResponse:
    """Return 1x1 degree monthly spatial grid temperature anomalies for time-lapse playback."""
    t0 = time.perf_counter()
    clauses = ["year = ?", "month = ?"]
    params: list[object] = [year, month]
    if region and region.lower() != "all":
        clauses.append("region = ?")
        params.append(region)

    with get_duckdb_conn() as conn:
        df = conn.execute(
            f"SELECT * FROM monthly_grid_anomalies WHERE {' AND '.join(clauses)}",
            params,
        ).fetchdf()

    cells = [GridAnomalyCell(**rec) for rec in df.to_dict(orient="records")]
    heatwave_count = sum(1 for c in cells if c.is_heatwave)
    return GridAnomaliesResponse(
        year=year,
        month=month,
        cells=cells,
        heatwave_count=heatwave_count,
        query_latency_ms=round((time.perf_counter() - t0) * 1000.0, 2),
    )


@app.get("/api/analytics/region-aggregate", response_model=RegionAggregateResponse)
def aggregate_bounding_box(
    min_lat: float = Query(default=5.0, ge=-60.0, le=35.0),
    max_lat: float = Query(default=22.0, ge=-60.0, le=35.0),
    min_lon: float = Query(default=78.0, ge=20.0, le=120.0),
    max_lon: float = Query(default=95.0, ge=20.0, le=120.0),
    year: int | None = Query(default=None, ge=2000, le=2100),
) -> RegionAggregateResponse:
    """Compute live DuckDB spatial aggregation inside a user-selected bounding box."""
    if min_lat > max_lat or min_lon > max_lon:
        raise HTTPException(status_code=422, detail="min_lat/min_lon must be <= max_lat/max_lon")

    t0 = time.perf_counter()
    year_clause = "AND year = ?" if year is not None else ""
    obs_params: list[object] = [min_lat, max_lat, min_lon, max_lon]
    if year is not None:
        obs_params.append(year)

    with get_duckdb_conn() as conn:
        obs_row = conn.execute(
            f"""
            SELECT
                COUNT(DISTINCT float_id) AS float_count,
                COUNT(*) AS observation_count,
                ROUND(AVG(CASE WHEN depth_m <= 20.0 THEN temp_c END), 2) AS mean_surface_temp_c,
                ROUND(AVG(CASE WHEN depth_m <= 20.0 THEN salinity_psu END), 2) AS mean_surface_salinity_psu
            FROM profiles_clean
            WHERE lat BETWEEN ? AND ? AND lon BETWEEN ? AND ? {year_clause}
            """,
            obs_params,
        ).fetchone()

        float_row = conn.execute(
            """
            SELECT
                ROUND(MAX(surface_temp_anomaly_c), 2) AS max_anomaly,
                SUM(CASE WHEN is_heatwave_beacon THEN 1 ELSE 0 END) AS beacons
            FROM floats
            WHERE lat BETWEEN ? AND ? AND lon BETWEEN ? AND ?
            """,
            [min_lat, max_lat, min_lon, max_lon],
        ).fetchone()

    return RegionAggregateResponse(
        min_lat=min_lat,
        max_lat=max_lat,
        min_lon=min_lon,
        max_lon=max_lon,
        float_count=int(obs_row[0] or 0),
        observation_count=int(obs_row[1] or 0),
        mean_surface_temp_c=obs_row[2],
        mean_surface_salinity_psu=obs_row[3],
        max_temp_anomaly_c=float_row[0],
        heatwave_beacons=int(float_row[1] or 0),
        query_latency_ms=round((time.perf_counter() - t0) * 1000.0, 2),
    )


@app.get("/api/analytics/depth-climatology", response_model=list[DepthClimatologyPoint])
def get_depth_climatology(
    region: str = Query(default="Bay of Bengal"),
    year: int = Query(default=2025, ge=2000, le=2100),
) -> list[DepthClimatologyPoint]:
    """Return 0-2000m thermocline & halocline curves for a basin and year."""
    with get_duckdb_conn() as conn:
        df = conn.execute(
            """
            SELECT * FROM depth_climatology
            WHERE region = ? AND year = ?
            ORDER BY depth_m ASC
            """,
            [region, year],
        ).fetchdf()

    return [DepthClimatologyPoint(**rec) for rec in df.to_dict(orient="records")]


@app.get("/api/pipeline/telemetry", response_model=PipelineTelemetryResponse)
def get_pipeline_telemetry() -> PipelineTelemetryResponse:
    """Return Big Data Pipeline HUD metrics: runs, Parquet size, and QC veracity funnel."""
    t0 = time.perf_counter()
    with get_duckdb_conn() as conn:
        runs_df = conn.execute(
            "SELECT * FROM pipeline_runs ORDER BY completed_at DESC LIMIT 10"
        ).fetchdf()

    runs = [PipelineRunRecord(**rec) for rec in runs_df.to_dict(orient="records")]
    if not runs:
        return PipelineTelemetryResponse(
            runs=[],
            total_raw_rows=0,
            total_clean_rows=0,
            total_rejected_rows=0,
            veracity_pass_rate_pct=0.0,
            parquet_size_mb=0.0,
            partition_count=0,
            query_latency_ms=round((time.perf_counter() - t0) * 1000.0, 2),
        )

    latest = runs[0]
    rejected = latest.rejected_qc_rows + latest.rejected_range_rows
    pass_rate = round((latest.clean_rows / latest.raw_rows) * 100.0, 2) if latest.raw_rows else 0.0
    return PipelineTelemetryResponse(
        runs=runs,
        total_raw_rows=latest.raw_rows,
        total_clean_rows=latest.clean_rows,
        total_rejected_rows=rejected,
        veracity_pass_rate_pct=pass_rate,
        parquet_size_mb=round(latest.parquet_size_bytes / (1024 * 1024), 2),
        partition_count=latest.partition_count,
        query_latency_ms=round((time.perf_counter() - t0) * 1000.0, 2),
    )


@app.get("/api/export")
def export_clean_slice(
    format: Literal["csv", "parquet"] = Query(default="csv"),
    region: str | None = Query(default=None),
    min_lat: float = Query(default=-60.0, ge=-60.0, le=35.0),
    max_lat: float = Query(default=35.0, ge=-60.0, le=35.0),
    min_lon: float = Query(default=20.0, ge=20.0, le=120.0),
    max_lon: float = Query(default=120.0, ge=20.0, le=120.0),
) -> StreamingResponse:
    """Export a QC-verified analytical slice as CSV or Apache Parquet."""
    clauses = ["lat BETWEEN ? AND ?", "lon BETWEEN ? AND ?"]
    params: list[object] = [min_lat, max_lat, min_lon, max_lon]
    if region and region.lower() != "all":
        clauses.append("region = ?")
        params.append(region)

    with get_duckdb_conn() as conn:
        df = conn.execute(
            f"SELECT * FROM profiles_clean WHERE {' AND '.join(clauses)} LIMIT 25000",
            params,
        ).fetchdf()

    if format == "parquet":
        buf = io.BytesIO()
        df.to_parquet(buf, index=False, compression="snappy")
        buf.seek(0)
        return StreamingResponse(
            buf,
            media_type="application/octet-stream",
            headers={"Content-Disposition": "attachment; filename=abyssscout_slice.parquet"},
        )

    csv_buf = io.StringIO()
    df.to_csv(csv_buf, index=False)
    csv_buf.seek(0)
    return StreamingResponse(
        iter([csv_buf.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=abyssscout_slice.csv"},
    )
