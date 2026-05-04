import time

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from apscheduler.schedulers.background import BackgroundScheduler
from starlette.middleware.base import BaseHTTPMiddleware

from .auth import auth_service
from .db import engine, SessionLocal, wait_for_postgres_ready
from .config import DATABASE_URL
from . import models
from .bootstrap import apply_runtime_migrations, bootstrap_defaults
from .config import BASE_DIR, UPLOADS_DIR, TASK_REPORT_UPLOAD_DIR
from .system_logging import build_system_logger, parse_user_from_auth_header
from .services.task_service import task_service
from .services.notification_service import notification_service
from .routes import auth, tasks, projects, users, workflow, roles, notifications, settings

if DATABASE_URL.startswith("postgresql"):
    wait_for_postgres_ready(timeout_seconds=60)
models.Base.metadata.create_all(bind=engine)
UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
TASK_REPORT_UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
with SessionLocal() as bootstrap_session:
    apply_runtime_migrations(bootstrap_session)
    bootstrap_defaults(bootstrap_session)

logger = build_system_logger(logs_dir=BASE_DIR / 'logs')

logger.info('System bootstrapping finished')

app = FastAPI(title='Finance Operations Workflow System')
app.add_middleware(
    CORSMiddleware,
    allow_origins=['*'],
    allow_credentials=True,
    allow_methods=['*'],
    allow_headers=['*'],
)

app.mount('/uploads', StaticFiles(directory=UPLOADS_DIR), name='uploads')


class SystemLoggingMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        start = time.perf_counter()

        user_id, role = parse_user_from_auth_header(
            auth_service=auth_service,
            auth_header=request.headers.get('Authorization'),
        )

        logger.info(
            'REQUEST_START | user_id=%s role=%s | %s %s?%s',
            user_id,
            role,
            request.method,
            request.url.path,
            request.url.query,
        )

        try:
            response = await call_next(request)
            duration_ms = int((time.perf_counter() - start) * 1000)
            logger.info(
                'REQUEST_END | user_id=%s role=%s | status=%s duration_ms=%s | %s %s',
                user_id,
                role,
                response.status_code,
                duration_ms,
                request.method,
                request.url.path,
            )
            return response
        except Exception:
            duration_ms = int((time.perf_counter() - start) * 1000)
            logger.exception(
                'REQUEST_ERROR | user_id=%s role=%s | duration_ms=%s | %s %s',
                user_id,
                role,
                duration_ms,
                request.method,
                request.url.path,
            )
            raise


app.add_middleware(SystemLoggingMiddleware)

app.include_router(auth)
app.include_router(tasks)
app.include_router(projects)
app.include_router(users)
app.include_router(workflow)
app.include_router(roles)
app.include_router(notifications)
app.include_router(settings)

scheduler = BackgroundScheduler()

@app.on_event('startup')
def startup_event():
    logger.info('Scheduler starting')

    def overdue_job():
        db = SessionLocal()
        try:
            changed = task_service.enforce_overdue(db)
            logger.info('JOB overdue_check | changed=%s', len(changed))
        except Exception:
            logger.exception('JOB overdue_check failed')
            raise
        finally:
            db.close()

    def notifications_deadline_soon_job():
        db = SessionLocal()
        try:
            created = notification_service.notify_deadlines_soon_job(db, within_hours=24)
            logger.info('JOB notifications_deadline_soon_check | created=%s', created)
        except Exception:
            logger.exception('JOB notifications_deadline_soon_check failed')
            raise
        finally:
            db.close()

    def notifications_deadline_overdue_job():
        db = SessionLocal()
        try:
            created = notification_service.notify_deadline_overdue_job(db)
            logger.info('JOB notifications_deadline_overdue_check | created=%s', created)
        except Exception:
            logger.exception('JOB notifications_deadline_overdue_check failed')
            raise
        finally:
            db.close()

    scheduler.add_job(overdue_job, 'interval', minutes=10, id='overdue_check')
    scheduler.add_job(notifications_deadline_soon_job, 'interval', minutes=10, id='notifications_deadline_soon_check')
    scheduler.add_job(notifications_deadline_overdue_job, 'interval', minutes=10, id='notifications_deadline_overdue_check')

    scheduler.start()

@app.on_event('shutdown')
def shutdown_event():
    logger.info('App shutdown: scheduler stopping')
    scheduler.shutdown()
    logger.info('App shutdown complete')
