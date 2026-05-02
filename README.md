# Corporate Finance Task and Workflow System

Учебная система управления задачами, проектами и workflow для финансового отдела.

## Структура проекта

- `backend/` — FastAPI backend с SQLAlchemy, JWT, ролями и workflow-логикой
- `frontend/` — React + TypeScript + Tailwind интерфейс
- `docker-compose.yml` — запуск PostgreSQL, backend и frontend через Docker
- `package.json` в корне — удобные команды для запуска frontend из корня проекта

## Быстрый старт

Есть два основных сценария:

1. `Docker` — если хотите поднять весь проект одной командой
2. `Локальный запуск` — если хотите запускать backend и frontend отдельно

## Запуск через Docker

Убедитесь, что установлены Docker Desktop и Docker Compose, затем в корне проекта выполните:

```bash
docker compose up --build
```

После запуска будут доступны:

- frontend: `http://localhost:3000`
- backend API: `http://localhost:8000`
- Swagger UI: `http://localhost:8000/docs`
- PostgreSQL: `postgres://postgres:postgres@localhost:5432/finance_system`

## Локальный запуск на Windows PowerShell

> Важно: для backend используйте `Python 3.11` или `Python 3.12`.  
> `Python 3.13` на Windows может вызывать проблемы с частью бинарных зависимостей.

### Автоматический запуск (рекомендуется): `run-local.ps1`

Чтобы каждый раз вручную не запускать backend и frontend в отдельных терминалах, в корне проекта есть скрипт:

```powershell
cd c:\Users\79879\Desktop\VKR
.\run-local.ps1
```

Скрипт сделает:
1) подготовит `backend/.venv` и установит зависимости (`pip install -r requirements.txt`)
2) запустит uvicorn на `http://localhost:8000`
3) дождётся поднятия backend (порт `8000`)
4) выполнит `npm install` в `frontend/` и запустит `npm run dev` (обычно на `http://localhost:3000`)

> Первый запуск может занять несколько минут из‑за установки зависимостей.

### 1. Запуск backend

Откройте PowerShell и выполните:

```powershell
cd c:\Users\79879\Desktop\VKR\backend
py -3.12 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Backend будет доступен по адресам:

- API: `http://localhost:8000`
- Swagger UI: `http://localhost:8000/docs`

Если виртуальное окружение уже было создано на `Python 3.13`, удалите папку `.venv` и создайте её заново:

```powershell
cd c:\Users\79879\Desktop\VKR\backend
Remove-Item -Recurse -Force .venv
py -3.12 -m venv .venv
```

### 2. Запуск frontend

Откройте новый PowerShell и запустите frontend из корня проекта:

```powershell
cd c:\Users\79879\Desktop\VKR
npm.cmd install
npm.cmd run dev
```

Это рекомендуемый вариант. Корневой `package.json` проксирует команды в `frontend/`, поэтому не нужно вручную переходить в папку фронтенда.

Frontend будет доступен по адресу:

- `http://localhost:3000`

### Если PowerShell блокирует `npm`

Если появляется ошибка вида `npm.ps1 ... выполнение сценариев отключено`, используйте один из вариантов:

```powershell
# Рекомендуется
npm.cmd install
npm.cmd run dev
```

или:

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
npm install
npm run dev
```

## Что запускать и откуда

Чтобы не было путаницы:

- `docker compose up --build` запускается из корня проекта `VKR`
- `npm.cmd install` и `npm.cmd run dev` для frontend тоже запускаются из корня проекта `VKR`
- backend-команды запускаются из папки `backend`

## Переменные и поведение по умолчанию

Backend использует:

- `DATABASE_URL` — если не задан, используется локальная SQLite база `backend/finance_system.db`
- `JWT_SECRET` — по умолчанию `supersecretjwtkey`
- `JWT_EXPIRES_MINUTES` — по умолчанию `120`

В Docker используется PostgreSQL. При локальном запуске без `DATABASE_URL` backend стартует на SQLite.

## Технологии

- Python, FastAPI, SQLAlchemy, Alembic
- JWT authentication и RBAC
- APScheduler для автоматической проверки просроченных задач
- React, TypeScript, Vite, Tailwind CSS

## Возможности

- роли: `Admin`, `FinancialDirector`, `DepartmentHead`, `Manager`, `Executor`
- управление проектами и задачами
- workflow и согласование задач
- аналитика и контроль просрочек
