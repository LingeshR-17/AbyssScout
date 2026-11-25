"""Stage 4: DuckDB Vectorized Spatial Grid Climatology, Anomaly Detection & Depth Analytics."""

from __future__ import annotations

import logging
from dataclasses import dataclass

import duckdb

from pipeline.config import settings

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class AnalyticsResult:
    """Summary counts from Stage 4 analytical aggregations."""

    grid_cells_computed: int
    heatwave_cells_detected: int
    heatwave_floats_flagged: int
    depth_strata_rows: int


def compute_analytics(db_path: str | None = None) -> AnalyticsResult:
    """
    Execute Stage 4 (Process):
    1. Compute 1x1 degree monthly spatial grid averages & baseline anomalies.
    2. Flag marine heatwave cells & float beacons where temp_anomaly_c >= threshold.
    3. Compute 0-2000m depth climatology curves per region & year.
    """
    target_db = db_path or str(settings.duckdb_file_path)
    threshold = settings.heatwave_anomaly_threshold_c

    with duckdb.connect(target_db) as conn:
        # 1. 1x1 degree monthly spatial grid + baseline climatology (2022-2023 reference)
        conn.execute(
            f"""
            CREATE OR REPLACE TABLE monthly_grid_anomalies AS
            WITH surface_obs AS (
                SELECT
                    FLOOR(lat)::INTEGER AS grid_lat,
                    FLOOR(lon)::INTEGER AS grid_lon,
                    year,
                    month,
                    region,
                    float_id,
                    temp_c,
                    salinity_psu
                FROM profiles_clean
                WHERE depth_m <= 20.0
            ),
            monthly_cells AS (
                SELECT
                    grid_lat,
                    grid_lon,
                    year,
                    month,
                    ANY_VALUE(region) AS region,
                    ROUND(AVG(temp_c), 3) AS mean_surface_temp_c,
                    ROUND(AVG(salinity_psu), 3) AS mean_surface_salinity_psu,
                    COUNT(*) AS observation_count,
                    COUNT(DISTINCT float_id) AS contributing_floats
                FROM surface_obs
                GROUP BY grid_lat, grid_lon, year, month
            ),
            baseline AS (
                SELECT
                    grid_lat,
                    grid_lon,
                    month,
                    AVG(mean_surface_temp_c) AS baseline_temp_c,
                    AVG(mean_surface_salinity_psu) AS baseline_salinity_psu
                FROM monthly_cells
                WHERE year <= 2023
                GROUP BY grid_lat, grid_lon, month
            )
            SELECT
                m.grid_lat,
                m.grid_lon,
                m.year,
                m.month,
                m.region,
                m.mean_surface_temp_c,
                m.mean_surface_salinity_psu,
                ROUND(COALESCE(b.baseline_temp_c, m.mean_surface_temp_c), 3) AS baseline_temp_c,
                ROUND(m.mean_surface_temp_c - COALESCE(b.baseline_temp_c, m.mean_surface_temp_c), 3) AS temp_anomaly_c,
                (m.mean_surface_temp_c - COALESCE(b.baseline_temp_c, m.mean_surface_temp_c)) >= {threshold} AS is_heatwave,
                m.observation_count,
                m.contributing_floats
            FROM monthly_cells m
            LEFT JOIN baseline b
                ON m.grid_lat = b.grid_lat AND m.grid_lon = b.grid_lon AND m.month = b.month
            ORDER BY m.year, m.month, m.grid_lat, m.grid_lon
            """
        )

        # 2. Update floats table with latest surface anomaly & heatwave beacon status
        conn.execute(
            f"""
            UPDATE floats
            SET
                surface_temp_anomaly_c = COALESCE((
                    SELECT ROUND(g.temp_anomaly_c, 2)
                    FROM monthly_grid_anomalies g
                    WHERE g.grid_lat = FLOOR(floats.lat)::INTEGER
                      AND g.grid_lon = FLOOR(floats.lon)::INTEGER
                      AND g.year = EXTRACT(YEAR FROM floats.latest_observed_at)::INTEGER
                      AND g.month = EXTRACT(MONTH FROM floats.latest_observed_at)::INTEGER
                    LIMIT 1
                ), 0.0),
                is_heatwave_beacon = COALESCE((
                    SELECT MAX(g.temp_anomaly_c) >= {threshold}
                    FROM monthly_grid_anomalies g
                    WHERE g.grid_lat = FLOOR(floats.lat)::INTEGER
                      AND g.grid_lon = FLOOR(floats.lon)::INTEGER
                      AND g.year >= 2024
                ), FALSE)
            """
        )

        # 3. Compute 0-2000m depth climatology curves per region & year
        conn.execute(
            """
            CREATE OR REPLACE TABLE depth_climatology AS
            SELECT
                region,
                year,
                depth_m,
                ANY_VALUE(depth_stratum) AS depth_stratum,
                ROUND(AVG(temp_c), 3) AS mean_temp_c,
                ROUND(MIN(temp_c), 3) AS min_temp_c,
                ROUND(MAX(temp_c), 3) AS max_temp_c,
                ROUND(AVG(salinity_psu), 3) AS mean_salinity_psu,
                COUNT(*) AS sample_count
            FROM profiles_clean
            GROUP BY region, year, depth_m
            ORDER BY region, year, depth_m
            """
        )

        grid_cells = conn.execute("SELECT COUNT(*) FROM monthly_grid_anomalies").fetchone()[0]
        hw_cells = conn.execute("SELECT COUNT(*) FROM monthly_grid_anomalies WHERE is_heatwave").fetchone()[0]
        hw_floats = conn.execute("SELECT COUNT(*) FROM floats WHERE is_heatwave_beacon").fetchone()[0]
        depth_rows = conn.execute("SELECT COUNT(*) FROM depth_climatology").fetchone()[0]

    logger.info(
        "Stage 4 Process complete: %d grid cells (%d heatwave), %d beacon floats, %d depth strata rows.",
        grid_cells,
        hw_cells,
        hw_floats,
        depth_rows,
    )
    return AnalyticsResult(
        grid_cells_computed=int(grid_cells),
        heatwave_cells_detected=int(hw_cells),
        heatwave_floats_flagged=int(hw_floats),
        depth_strata_rows=int(depth_rows),
    )
