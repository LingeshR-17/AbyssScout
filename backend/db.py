"""Read-only DuckDB analytical connection helper for FastAPI."""

from __future__ import annotations

from contextlib import contextmanager
from typing import Iterator

import duckdb

from pipeline.config import settings


@contextmanager
def get_duckdb_conn() -> Iterator[duckdb.DuckDBPyConnection]:
    """Yield a read-only DuckDB connection to the AbyssScout warehouse."""
    db_path = settings.duckdb_file_path
    conn = duckdb.connect(str(db_path), read_only=True)
    try:
        yield conn
    finally:
        conn.close()
