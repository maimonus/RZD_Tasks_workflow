import os
from pathlib import Path
from datetime import timedelta

BASE_DIR = Path(__file__).resolve().parents[1]

raw_database_url = os.getenv('DATABASE_URL', '').strip()
if raw_database_url:
    DATABASE_URL = raw_database_url
    # Force sync PostgreSQL dialect for Render compatibility
    DATABASE_URL = DATABASE_URL.replace('postgresql+asyncpg://', 'postgresql://').replace('+asyncpg', '')
else:
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

