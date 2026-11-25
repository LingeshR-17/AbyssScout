"""Stage 2: Argo Quality-Control (QC) & Physical Veracity Cleaning."""

from __future__ import annotations

import logging
from dataclasses import dataclass

import pandas as pd

from pipeline.config import settings

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class CleaningResult:
    """Veracity audit counts produced by Stage 2 cleaning."""

    raw_df: pd.DataFrame
    clean_df: pd.DataFrame
    raw_rows: int
    clean_rows: int
    rejected_qc_rows: int
    rejected_range_rows: int


def classify_indian_ocean_region(lat: float, lon: float) -> str:
    """Assign standardized Indian Ocean basin from coordinates."""
    if lat < 5.5:
        return "Equatorial Indian Ocean"
    if lon >= 77.5:
        return "Bay of Bengal"
    return "Arabian Sea"


def classify_depth_stratum(depth_m: float) -> str:
    """Classify depth into standard oceanographic vertical zones."""
    if depth_m <= 200.0:
        return "Epipelagic (0-200m)"
    if depth_m <= 1000.0:
        return "Mesopelagic (200-1000m)"
    return "Bathypelagic (1000-2000m)"


def clean_argo_telemetry(raw_df: pd.DataFrame) -> CleaningResult:
    """
    Execute Stage 2 (Clean):
    1. Enforce Argo QC flags (TEMP_QC == 1, PSAL_QC == 1, PRES_QC == 1).
    2. Enforce physical ocean bounds (0 <= depth_m <= 2000, -2 <= temp_c <= 38, 25 <= salinity_psu <= 42).
    3. Standardize basin regions & depth strata while preserving rejection reasons on raw_df.
    """
    df = raw_df.copy()
    df["observed_at"] = pd.to_datetime(df["observed_at"], utc=True)
    df["region"] = [
        classify_indian_ocean_region(float(lat), float(lon))
        for lat, lon in zip(df["lat"], df["lon"])
    ]
    df["depth_stratum"] = [classify_depth_stratum(float(d)) for d in df["depth_m"]]

    qc_valid = (df["temp_qc"] == 1) & (df["psal_qc"] == 1) & (df["pres_qc"] == 1)
    range_valid = (
        df["depth_m"].between(settings.min_depth_m, settings.max_depth_m)
        & df["temp_c"].between(-2.0, 38.0)
        & df["salinity_psu"].between(25.0, 42.0)
        & df["lat"].between(-60.0, 35.0)
        & df["lon"].between(20.0, 120.0)
    )

    df["is_valid"] = qc_valid & range_valid
    df["rejection_reason"] = "valid"
    df.loc[~qc_valid, "rejection_reason"] = "qc_flag_rejected"
    df.loc[qc_valid & ~range_valid, "rejection_reason"] = "physical_range_rejected"

    rejected_qc_rows = int((~qc_valid).sum())
    rejected_range_rows = int((qc_valid & ~range_valid).sum())

    clean_df = df[df["is_valid"]].drop(columns=["is_valid", "rejection_reason"]).reset_index(drop=True)

    logger.info(
        "Stage 2 Clean complete: %d raw -> %d clean (%d QC-rejected, %d range-rejected)",
        len(df),
        len(clean_df),
        rejected_qc_rows,
        rejected_range_rows,
    )
    return CleaningResult(
        raw_df=df,
        clean_df=clean_df,
        raw_rows=len(df),
        clean_rows=len(clean_df),
        rejected_qc_rows=rejected_qc_rows,
        rejected_range_rows=rejected_range_rows,
    )
