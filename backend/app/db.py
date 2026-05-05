from __future__ import annotations

import time

from sqlalchemy import create_engine, text
from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import Session, declarative_base, sessionmaker

from .config import DATABASE_URL, SQLITE_CONNECT_ARGS

# Create engine with psycopg2 (sync driver) - pool_pre_ping prevents stale connections
engine = create_engine(
    DATABASE_URL,
    connect_args=SQLITE_CONNECT_ARGS,
    future=True,
    echo=True,
    pool_pre_ping=True,  # Validates connection before using it
    pool_recycle=3600,   # Recycle connections after 1 hour
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine, future=True)
Base = declarative_base()


def wait_for_postgres_ready(
    *,
    timeout_seconds: int = 60,
    interval_seconds: float = 1.5,
    verbose: bool = False,
) -> None:
    deadline = time.time() + timeout_seconds
    last_error: Exception | None = None

    while time.time() < deadline:
        try:
            with engine.connect() as conn:
                conn.execute(text("SELECT 1"))
            return
        except OperationalError as exc:
            last_error = exc
            if verbose:
                # avoid logger dependency here
                print(f"Waiting for database... {exc}")
            time.sleep(interval_seconds)

    raise RuntimeError(
        f"Database was not ready within {timeout_seconds}s. Last error: {last_error}"
    )
