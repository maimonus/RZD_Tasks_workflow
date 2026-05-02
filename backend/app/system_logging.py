from __future__ import annotations

import logging
import os
from logging.handlers import RotatingFileHandler
from pathlib import Path
from typing import Optional


def _ensure_dir(path: Path) -> None:
    path.mkdir(parents=True, exist_ok=True)


def build_system_logger(
    *,
    logs_dir: Path,
    log_file_name: str = "system.log",
    level: int = logging.INFO,
) -> logging.Logger:
    _ensure_dir(logs_dir)

    logger = logging.getLogger("finance_system")
    logger.setLevel(level)
    logger.propagate = False  # avoid double logs if root logger configured

    log_path = logs_dir / log_file_name

    # Prevent adding duplicate handlers on module reload
    if any(isinstance(h, RotatingFileHandler) and getattr(h, "baseFilename", None) == str(log_path) for h in logger.handlers):
        return logger

    formatter = logging.Formatter(
        fmt="%(asctime)s | %(levelname)s | %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )

    file_handler = RotatingFileHandler(
        filename=str(log_path),
        maxBytes=5 * 1024 * 1024,  # 5MB
        backupCount=5,
        encoding="utf-8",
    )
    file_handler.setLevel(level)
    file_handler.setFormatter(formatter)

    stream_handler = logging.StreamHandler()
    stream_handler.setLevel(level)
    stream_handler.setFormatter(formatter)

    logger.addHandler(file_handler)
    logger.addHandler(stream_handler)

    return logger


def parse_user_from_auth_header(auth_service, auth_header: Optional[str]) -> tuple[Optional[int], Optional[str]]:
    """
    Возвращает (user_id, role) из Bearer token.
    Не кидает исключения наружу — логгер middleware не должен ломать запрос.
    """
    if not auth_header:
        return None, None
    if not auth_header.startswith("Bearer "):
        return None, None

    token = auth_header.split(" ", 1)[1].strip()
    if not token:
        return None, None

    try:
        payload = auth_service.decode_token(token)
        return int(payload.sub), payload.role
    except Exception:
        return None, None
