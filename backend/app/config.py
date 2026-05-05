import os
from pathlib import Path
from datetime import timedelta

BASE_DIR = Path(__file__).resolve().parents[1]

raw_database_url = os.getenv('DATABASE_URL', '').strip()

# Validate and configure DATABASE_URL
if raw_database_url:
    # Check for placeholder or invalid values
    if 'hostname' in raw_database_url.lower() or raw_database_url == 'postgresql://':
        print(f"WARNING: DATABASE_URL contains invalid placeholder value: {raw_database_url}")
        print("Using SQLite fallback for local development.")
        DATABASE_URL = 'sqlite:///./finance_system.db'
    else:
        DATABASE_URL = raw_database_url
        # Convert asyncpg to psycopg2 (sync driver) for synchronous code
        if 'postgresql' in DATABASE_URL.lower():
            DATABASE_URL = (DATABASE_URL
                           .replace('postgresql+asyncpg://', 'postgresql+psycopg2://')
                           .replace('postgresql://', 'postgresql+psycopg2://'))
else:
    # No DATABASE_URL provided, use SQLite for local development
    DATABASE_URL = 'sqlite:///./finance_system.db'

SQLITE_CONNECT_ARGS = {'check_same_thread': False} if DATABASE_URL.startswith('sqlite') else {}

JWT_SECRET = os.getenv('JWT_SECRET', 'supersecretjwtkey')
JWT_ALGORITHM = 'HS256'
JWT_EXPIRES_MINUTES = int(os.getenv('JWT_EXPIRES_MINUTES', '120'))

ROLE_ADMIN = 'Admin'
ROLE_FINANCIAL_DIRECTOR = 'FinancialDirector'
ROLE_DEPARTMENT_HEAD = 'DepartmentHead'
ROLE_MANAGER = 'Manager'
ROLE_EXECUTOR = 'Executor'

TASK_STATUSES = ['pending', 'in_progress', 'in_review', 'completed', 'overdue', 'archived']

ROLE_HIERARCHY = {
    ROLE_ADMIN: [],
    ROLE_FINANCIAL_DIRECTOR: [ROLE_DEPARTMENT_HEAD, ROLE_MANAGER, ROLE_EXECUTOR],
    ROLE_DEPARTMENT_HEAD: [ROLE_MANAGER, ROLE_EXECUTOR],
    ROLE_MANAGER: [ROLE_EXECUTOR],
    ROLE_EXECUTOR: [],
}

SLA_DEFAULT_DAYS = 7

UPLOADS_DIR = Path(os.getenv('UPLOADS_DIR', BASE_DIR / 'uploads'))
TASK_REPORT_UPLOAD_DIR = UPLOADS_DIR / 'task-reports'

