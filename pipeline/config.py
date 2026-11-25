"""Centralized configuration for AbyssScout pipeline and API."""

from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict


PROJECT_ROOT = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    """Application and Big Data pipeline settings loaded from .env."""

    model_config = SettingsConfigDict(
        env_file=str(PROJECT_ROOT / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_name: str = "AbyssScout"
    app_env: str = "development"
    api_host: str = "0.0.0.0"
    api_port: int = 8000
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"

    data_raw_dir: str = "data/raw"
    data_lake_dir: str = "data/lake"
    duckdb_path: str = "data/abyssscout.duckdb"

    offline_mode: bool = False
    argo_erddap_base_url: str = "https://erddap.ifremer.fr/erddap/tabledap"
    argo_fetch_timeout_seconds: int = 10
    argo_max_floats: int = 42
    argo_years: str = "2022,2023,2024,2025"

    heatwave_anomaly_threshold_c: float = 1.5
    min_depth_m: float = 0.0
    max_depth_m: float = 2000.0

    @property
    def raw_dir_path(self) -> Path:
        p = Path(self.data_raw_dir)
        return p if p.is_absolute() else PROJECT_ROOT / p

    @property
    def lake_dir_path(self) -> Path:
        p = Path(self.data_lake_dir)
        return p if p.is_absolute() else PROJECT_ROOT / p

    @property
    def duckdb_file_path(self) -> Path:
        p = Path(self.duckdb_path)
        return p if p.is_absolute() else PROJECT_ROOT / p

    @property
    def years_list(self) -> list[int]:
        return [int(y.strip()) for y in self.argo_years.split(",") if y.strip()]

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


settings = Settings()
