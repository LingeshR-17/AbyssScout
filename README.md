# AbyssScout — Indian Ocean Big Data Telemetry & Anomaly Lakehouse

**AbyssScout** is a production-grade Big Data Analytics platform for ingesting, quality-filtering, storing, and analyzing **Argo oceanographic float telemetry** ($0\text{–}2000\text{ m}$ depth profiles) across the **Bay of Bengal**, **Arabian Sea**, and **Equatorial Indian Ocean**.

> **Architecture Boundary:** AbyssScout implements **Section A (Big Data Lakehouse & Spatial Analytics)** with zero Generative AI / LLM code. All analytical tables (`floats`, `profiles_clean`, `profiles_raw`, `monthly_grid_anomalies`, `pipeline_runs`) and read-only REST endpoints are cleanly documented so a downstream conversational/GenAI layer can plug in directly.

---

## 6-Stage Big Data Pipeline

1. **Collect (`pipeline/collect.py`):** Fetches Argo profiles from IFREMER ERDDAP (with automatic **offline-resilient Indian Ocean NetCDF/telemetry fallback**).
2. **Clean (`pipeline/clean.py`):** Enforces Argo Quality Control flags (`QC == 1`), physical ocean bounds ($0\text{–}2000\text{ m}$), and records per-float veracity counts (`raw` vs `rejected_qc` vs `rejected_range`).
3. **Store (`pipeline/store.py`):** Writes partitioned **Apache Parquet** (`data/lake/year=YYYY/region=...`) and idempotent **DuckDB** analytical tables (`data/abyssscout.duckdb`).
4. **Process (`pipeline/process.py`):** Computes $1^\circ \times 1^\circ$ monthly spatial grids, 4-year climatology baselines, marine heatwave anomalies ($\Delta T > +1.5^\circ\text{C}$), and depth-strata curves.
5. **Serve (`backend/`):** FastAPI REST API with strict Pydantic v2 schemas, bounding-box aggregation, provenance metadata, and CSV/Parquet export.
6. **Show (`frontend/`):** *Abyssal Telemetry Observatory* — React + Vite + Leaflet + ECharts spatial dashboard.

---

## Local Setup & Run Instructions

### 1. Python Environment & Pipeline
```bash
python -m venv .venv
.venv\Scripts\activate        # Windows
pip install -r requirements.txt

# Run the full 6-stage Big Data pipeline (idempotent)
python -m pipeline.run_all
```

### 2. Backend API (FastAPI)
```bash
uvicorn backend.main:app --reload --port 8000
# Health check: http://localhost:8000/api/health
# OpenAPI docs: http://localhost:8000/docs
```

### 3. Frontend Dashboard (Vite + React)
```bash
cd frontend
npm install
npm run dev
# Open http://localhost:5173
```

### 4. Verification
```bash
# Backend & Pipeline tests
pytest -v

# Frontend lint & production build
cd frontend && npm run lint && npm run build
```
