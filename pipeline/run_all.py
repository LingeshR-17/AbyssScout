"""Orchestrator for the full 6-stage AbyssScout Big Data Lakehouse Pipeline."""

from __future__ import annotations

import argparse
import logging
import sys
import time
import uuid
from pathlib import Path

# Allow direct execution via `python pipeline/run_all.py` or IDE Run button
_PROJECT_ROOT = str(Path(__file__).resolve().parent.parent)
if _PROJECT_ROOT not in sys.path:
    sys.path.insert(0, _PROJECT_ROOT)

import pandas as pd

from pipeline.clean import clean_argo_telemetry
from pipeline.collect import collect_argo_telemetry
from pipeline.process import compute_analytics
from pipeline.store import record_pipeline_run, store_lakehouse

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("pipeline.run_all")


def run_pipeline(force_offline: bool | None = None) -> dict[str, object]:
    """Execute Stages 1 -> 2 -> 3 -> 4 end-to-end and log audit telemetry."""
    run_id = f"run-{uuid.uuid4().hex[:10]}"
    started_at = pd.Timestamp.now(tz="UTC")
    t0 = time.perf_counter()

    collected = collect_argo_telemetry(force_offline=force_offline)
    raw_df = pd.read_parquet(collected.raw_parquet_path)

    cleaned = clean_argo_telemetry(raw_df)
    stored = store_lakehouse(cleaned)
    analytics = compute_analytics(str(stored.duckdb_path))

    duration_ms = (time.perf_counter() - t0) * 1000.0
    completed_at = pd.Timestamp.now(tz="UTC")

    record_pipeline_run(
        run_id=run_id,
        started_at=started_at,
        completed_at=completed_at,
        duration_ms=duration_ms,
        source_mode=collected.source_mode,
        cleaning=cleaned,
        storage=stored,
        status="success",
    )

    summary = {
        "run_id": run_id,
        "source_mode": collected.source_mode,
        "duration_ms": round(duration_ms, 2),
        "raw_rows": cleaned.raw_rows,
        "clean_rows": cleaned.clean_rows,
        "rejected_qc_rows": cleaned.rejected_qc_rows,
        "rejected_range_rows": cleaned.rejected_range_rows,
        "partition_count": stored.partition_count,
        "parquet_size_bytes": stored.parquet_size_bytes,
        "grid_cells_computed": analytics.grid_cells_computed,
        "heatwave_cells_detected": analytics.heatwave_cells_detected,
        "heatwave_floats_flagged": analytics.heatwave_floats_flagged,
    }
    logger.info("Pipeline %s finished in %.1f ms: %s", run_id, duration_ms, summary)
    return summary


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Run AbyssScout Big Data Lakehouse Pipeline")
    parser.add_argument("--offline", action="store_true", help="Skip live ERDDAP probe and use offline Indian Ocean dataset")
    args = parser.parse_args()
    run_pipeline(force_offline=True if args.offline else None)
