"""Stage 3: Partitioned Apache Parquet Lake & Idempotent DuckDB Warehouse."""

from __future__ import annotations

import logging
import shutil
from dataclasses import dataclass
from pathlib import Path

import duckdb
import pandas as pd
import pyarrow as pa
import pyarrow.parquet as pq

from pipeline.clean import CleaningResult
from pipeline.config import settings

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class StorageResult:
    """Storage metrics returned by Stage 3."""

    lake_dir: Path
    duckdb_path: Path
    partition_count: int
    parquet_size_bytes: int


def _compute_dir_stats(directory: Path) -> tuple[int, int]:
    """Return (parquet_file_count, total_bytes) under lake directory."""
    files = list(directory.rglob("*.parquet"))
    total_bytes = sum(f.stat().st_size for f in files)
    return len(files), total_bytes


def store_lakehouse(cleaning: CleaningResult) -> StorageResult:
    """
    Execute Stage 3 (Store):
    1. Write idempotent partitioned Apache Parquet (year=YYYY/region=...) to data/lake/.
    2. Populate DuckDB analytical tables (profiles_clean, profiles_raw, floats, pipeline_runs).
    """
    lake_dir = settings.lake_dir_path
    if lake_dir.exists():
        shutil.rmtree(lake_dir)
    lake_dir.mkdir(parents=True, exist_ok=True)

    # Write partitioned Parquet lake
    clean_arrow = pa.Table.from_pandas(cleaning.clean_df, preserve_index=False)
    pq.write_to_dataset(
        clean_arrow,
        root_path=str(lake_dir),
        partition_cols=["year", "region"],
        compression="snappy",
    )
    partition_count, parquet_size_bytes = _compute_dir_stats(lake_dir)

    # Populate DuckDB analytical warehouse
    db_path = settings.duckdb_file_path
    db_path.parent.mkdir(parents=True, exist_ok=True)

    with duckdb.connect(str(db_path)) as conn:
        # Register DataFrames for fast atomic replacement
        conn.register("df_clean", cleaning.clean_df)
        conn.register("df_raw", cleaning.raw_df)

        conn.execute("CREATE OR REPLACE TABLE profiles_clean AS SELECT * FROM df_clean")
        conn.execute("CREATE OR REPLACE TABLE profiles_raw AS SELECT * FROM df_raw")

        # Build float summary catalog with provenance and veracity counts
        conn.execute(
            """
            CREATE OR REPLACE TABLE floats AS
            WITH latest_cycle AS (
                SELECT
                    float_id,
                    MAX(cycle_number) AS latest_cycle,
                    MAX(observed_at) AS latest_observed_at,
                    COUNT(DISTINCT cycle_number) AS total_cycles,
                    MAX(depth_m) AS max_depth_m
                FROM profiles_clean
                GROUP BY float_id
            ),
            surface_latest AS (
                SELECT
                    p.float_id,
                    ANY_VALUE(p.region) AS region,
                    ANY_VALUE(p.program) AS program,
                    ANY_VALUE(p.pi_name) AS pi_name,
                    AVG(p.lat) AS lat,
                    AVG(p.lon) AS lon,
                    AVG(CASE WHEN p.depth_m <= 20.0 THEN p.temp_c END) AS surface_temp_c,
                    AVG(CASE WHEN p.depth_m <= 20.0 THEN p.salinity_psu END) AS surface_salinity_psu
                FROM profiles_clean p
                INNER JOIN latest_cycle lc
                    ON p.float_id = lc.float_id AND p.cycle_number = lc.latest_cycle
                GROUP BY p.float_id
            ),
            veracity_counts AS (
                SELECT
                    float_id,
                    COUNT(*) AS raw_points,
                    SUM(CASE WHEN is_valid THEN 1 ELSE 0 END) AS clean_points,
                    SUM(CASE WHEN NOT is_valid THEN 1 ELSE 0 END) AS rejected_points
                FROM profiles_raw
                GROUP BY float_id
            )
            SELECT
                s.float_id,
                s.region,
                ROUND(s.lat, 4) AS lat,
                ROUND(s.lon, 4) AS lon,
                s.program,
                s.pi_name,
                lc.latest_observed_at,
                lc.latest_cycle,
                lc.total_cycles,
                ROUND(s.surface_temp_c, 2) AS surface_temp_c,
                ROUND(s.surface_salinity_psu, 2) AS surface_salinity_psu,
                lc.max_depth_m,
                vc.raw_points,
                vc.clean_points,
                vc.rejected_points,
                0.0::DOUBLE AS surface_temp_anomaly_c,
                FALSE AS is_heatwave_beacon
            FROM surface_latest s
            JOIN latest_cycle lc ON s.float_id = lc.float_id
            JOIN veracity_counts vc ON s.float_id = vc.float_id
            ORDER BY s.region, s.float_id
            """
        )

        # Ensure idempotent pipeline_runs audit table exists
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS pipeline_runs (
                run_id VARCHAR PRIMARY KEY,
                started_at TIMESTAMPTZ,
                completed_at TIMESTAMPTZ,
                duration_ms DOUBLE,
                source_mode VARCHAR,
                raw_rows BIGINT,
                clean_rows BIGINT,
                rejected_qc_rows BIGINT,
                rejected_range_rows BIGINT,
                parquet_size_bytes BIGINT,
                partition_count INTEGER,
                status VARCHAR
            )
            """
        )

    logger.info(
        "Stage 3 Store complete: %d Parquet files (%.2f MB) + DuckDB warehouse at %s",
        partition_count,
        parquet_size_bytes / (1024 * 1024),
        db_path,
    )
    return StorageResult(
        lake_dir=lake_dir,
        duckdb_path=db_path,
        partition_count=partition_count,
        parquet_size_bytes=parquet_size_bytes,
    )


def record_pipeline_run(
    run_id: str,
    started_at: pd.Timestamp,
    completed_at: pd.Timestamp,
    duration_ms: float,
    source_mode: str,
    cleaning: CleaningResult,
    storage: StorageResult,
    status: str = "success",
) -> None:
    """Idempotently record a pipeline execution in the DuckDB pipeline_runs audit table."""
    with duckdb.connect(str(storage.duckdb_path)) as conn:
        conn.execute(
            """
            INSERT OR REPLACE INTO pipeline_runs VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            [
                run_id,
                started_at.to_pydatetime(),
                completed_at.to_pydatetime(),
                round(duration_ms, 2),
                source_mode,
                cleaning.raw_rows,
                cleaning.clean_rows,
                cleaning.rejected_qc_rows,
                cleaning.rejected_range_rows,
                storage.parquet_size_bytes,
                storage.partition_count,
                status,
            ],
        )
