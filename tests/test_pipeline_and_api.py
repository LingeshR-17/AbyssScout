"""Automated test suite for AbyssScout 6-stage Big Data Pipeline & FastAPI Serving Layer."""

from __future__ import annotations

import pandas as pd
from fastapi.testclient import TestClient

from backend.main import app
from pipeline.clean import classify_indian_ocean_region, clean_argo_telemetry
from pipeline.run_all import run_pipeline

client = TestClient(app)


def test_region_classification() -> None:
    assert classify_indian_ocean_region(13.08, 81.45) == "Bay of Bengal"
    assert classify_indian_ocean_region(15.40, 70.20) == "Arabian Sea"
    assert classify_indian_ocean_region(1.50, 80.20) == "Equatorial Indian Ocean"


def test_qc_veracity_filtering_rejects_bad_flags_and_spikes() -> None:
    sample = pd.DataFrame(
        [
            {
                "float_id": "2902271",
                "cycle_number": 1,
                "observed_at": "2025-05-15T06:30:00+00:00",
                "year": 2025,
                "month": 5,
                "lat": 13.08,
                "lon": 81.45,
                "program": "INCOIS-ARGO",
                "pi_name": "INCOIS",
                "depth_m": 10.0,
                "pres_dbar": 10.1,
                "temp_c": 29.4,
                "salinity_psu": 33.2,
                "temp_qc": 1,
                "psal_qc": 1,
                "pres_qc": 1,
            },
            {
                "float_id": "2902271",
                "cycle_number": 1,
                "observed_at": "2025-05-15T06:30:00+00:00",
                "year": 2025,
                "month": 5,
                "lat": 13.08,
                "lon": 81.45,
                "program": "INCOIS-ARGO",
                "pi_name": "INCOIS",
                "depth_m": 20.0,
                "pres_dbar": 20.2,
                "temp_c": 45.0,
                "salinity_psu": 33.2,
                "temp_qc": 4,  # Bad QC flag
                "psal_qc": 1,
                "pres_qc": 1,
            },
            {
                "float_id": "2902271",
                "cycle_number": 1,
                "observed_at": "2025-05-15T06:30:00+00:00",
                "year": 2025,
                "month": 5,
                "lat": 13.08,
                "lon": 81.45,
                "program": "INCOIS-ARGO",
                "pi_name": "INCOIS",
                "depth_m": 2450.0,  # Exceeds 2000m max depth
                "pres_dbar": 2475.0,
                "temp_c": 2.5,
                "salinity_psu": 34.8,
                "temp_qc": 1,
                "psal_qc": 1,
                "pres_qc": 1,
            },
        ]
    )
    res = clean_argo_telemetry(sample)
    assert res.raw_rows == 3
    assert res.clean_rows == 1
    assert res.rejected_qc_rows == 1
    assert res.rejected_range_rows == 1


def test_full_pipeline_and_api_endpoints() -> None:
    # Ensure pipeline runs idempotently
    summary = run_pipeline(force_offline=True)
    assert summary["clean_rows"] > 40000
    assert summary["rejected_qc_rows"] > 0
    assert summary["partition_count"] >= 12

    # 1. Health endpoint
    health = client.get("/api/health")
    assert health.status_code == 200
    h_data = health.json()
    assert h_data["status"] == "healthy"
    assert h_data["duckdb_ready"] is True
    assert h_data["total_floats"] >= 35

    # 2. Floats catalog
    floats_resp = client.get("/api/floats?region=Bay%20of%20Bengal")
    assert floats_resp.status_code == 200
    floats = floats_resp.json()
    assert len(floats) > 0
    first_id = floats[0]["float_id"]

    # 3. Float vertical profile + raw QC veracity
    prof_resp = client.get(f"/api/floats/{first_id}/profile")
    assert prof_resp.status_code == 200
    prof = prof_resp.json()
    assert len(prof["clean_profile"]) > 10
    assert len(prof["raw_profile"]) >= len(prof["clean_profile"])
    assert len(prof["time_series"]) > 12

    # 4. Grid anomalies
    grid_resp = client.get("/api/analytics/grid-anomalies?year=2025&month=5")
    assert grid_resp.status_code == 200
    assert len(grid_resp.json()["cells"]) > 0

    # 5. Bounding-box region aggregate
    bbox_resp = client.get("/api/analytics/region-aggregate?min_lat=8&max_lat=21&min_lon=80&max_lon=92")
    assert bbox_resp.status_code == 200
    assert bbox_resp.json()["float_count"] > 0

    # 6. Depth climatology
    depth_resp = client.get("/api/analytics/depth-climatology?region=Bay%20of%20Bengal&year=2025")
    assert depth_resp.status_code == 200
    assert len(depth_resp.json()) > 20

    # 7. Pipeline Telemetry HUD
    tel_resp = client.get("/api/pipeline/telemetry")
    assert tel_resp.status_code == 200
    assert tel_resp.json()["veracity_pass_rate_pct"] > 85.0

    # 8. CSV Export
    export_resp = client.get("/api/export?format=csv&region=Bay%20of%20Bengal")
    assert export_resp.status_code == 200
    assert "float_id" in export_resp.text
