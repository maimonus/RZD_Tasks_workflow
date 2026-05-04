# Локальное развертывание Finance Workflow System

## Проблема

При открытии страницы регистрации показывается ошибка: **"Не удалось загрузить список ролей. Попробуйте еще раз."**

## Причина

Frontend и backend запущены на разных портах (3000 и 8000), и frontend неправильно определяет URL для подключения к API backend.

## Решение

Были сделаны следующие изменения для исправления проблемы:

### 1. Добавлена переменная окружения для API базового URL

Создан файл `.env` в папке `frontend/`:

```env
VITE_API_BASE_URL=http://localhost:8000
```

Также создан файл `.env.local` с тем же содержимым для development окружения.

### 2. Улучшена логика определения API URL в frontend

Файл `frontend/src/api/api.ts` обновлен:

```typescript
const getBaseURL = () => {
  // Сначала проверяем явно установленную переменную окружения
  if (import.meta.env.VITE_API_BASE_URL) {
    return import.meta.env.VITE_API_BASE_URL
  }

  // Если DEV режим, используем localhost:8000
  if (import.meta.env.DEV) {
    return 'http://localhost:8000'
  }

  // Для production режима, используем относительный путь через proxy
  return '/backend'
}
```

### 3. Добавлена proxy конфигурация в Vite

Файл `frontend/vite.config.js` обновлен с proxy конфигурацией:

```javascript
server: {
  proxy: {
    '/backend': {
      target: 'http://localhost:8000',
      changeOrigin: true,
      rewrite: (path) => path.replace(/^\/backend/, ''),
    },
  },
}
```

## Как запустить локально

### Вариант 1: Используя батник (Windows)

```bash
cd c:\Users\79879\Desktop\VKR
run-local.cmd
```

Это откроет два окна терминала - одно для backend, одно для frontend.

### Вариант 2: Запуск вручную

**Терминал 1 - Backend:**
```bash
cd backend
.\.venv\Scripts\activate  # Или используйте venv напрямую
python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

**Терминал 2 - Frontend:**
```bash
cd frontend
npm install  # Если первый запуск
npm run dev
```

### Вариант 3: Используя PowerShell скрипт

```bash
cd c:\Users\79879\Desktop\VKR
.\run-local.ps1
```

## Как проверить, что все работает

1. Откройте браузер на `http://localhost:3000`
2. Нажмите на "Регистрация"
3. Выпадающий список "Роль" должен загруженным со всеми доступными ролями
4. Если видите ошибку, откройте Developer Tools (F12) и перейдите на вкладку "Console"
5. Вставьте следующий код для диагностики:

```javascript
// Тест подключения к API
async function testAPI() {
  const baseUrls = [
    'http://localhost:8000',
    '/backend',
    window.location.origin + '/backend',
  ]

  console.log('Testing API connection...')
  console.log('Current origin:', window.location.origin)

  for (const baseUrl of baseUrls) {
    try {
      const response = await fetch(`${baseUrl}/roles`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      })
      console.log(`✓ ${baseUrl}/roles: ${response.status}`)
      const data = await response.json()
      console.log('  Roles:', data)
    } catch (error) {
      console.error(`✗ ${baseUrl}/roles:`, error.message)
    }
  }
}

testAPI()
```

## Учетные данные для тестирования

Admin аккаунт:
- Email: `admin@finance.local`
- Password: `admin12345`

Demo аккаунты (все с паролем `demo12345`):
- Финансовый директор: `fd@finance.local`
- Начальник отдела: `head@finance.local`
- Менеджер: `manager1@finance.local`, `manager2@finance.local`, `manager3@finance.local`
- Исполнитель: `executor1@finance.local`, `executor2@finance.local`, и т.д.

## Структура базы данных

База данных инициализируется автоматически при запуске backend. Если нужно пересоздать БД:

1. Удалите файл `backend/finance_system.db`
2. Перезагрузите backend - БД будет пересоздана с demo данными

## Возможные проблемы и решения

### Проблема: "Ошибка подключения к backend"

**Решение:**
- Убедитесь, что backend запущен на порту 8000
- Проверьте, что .env файл присутствует в папке frontend с правильной переменной окружения
- Проверьте CORS логи в backend (в файле `backend/logs/system.log`)

### Проблема: "Роли не загружаются"

**Решение:**
- Проверьте, что база данных инициализирована: есть ли файл `backend/finance_system.db`
- В backend логах должна быть строка "System bootstrapping finished"
- Используйте тест из раздела "Как проверить" выше

### Проблема: Frontend показывает пустую страницу

**Решение:**
- Проверьте что порт 3000 не занят другим процессом
- Очистите кэш браузера (Ctrl+Shift+Delete)
- Проверьте console браузера на ошибки
- Перезагрузите страницу

## Дополнительные команды

### Проверка доступности портов

```powershell
Test-NetConnection -ComputerName localhost -Port 8000  # Backend
Test-NetConnection -ComputerName localhost -Port 3000  # Frontend
```

### Просмотр логов backend

```bash
Get-Content backend/logs/system.log -Tail 50  # Последние 50 строк
```

### Пересборка frontend

```bash
cd frontend
npm run build
```

## Документация

- Backend: FastAPI, SQLAlchemy, SQLite
- Frontend: React, TypeScript, Vite, Axios
- API документация доступна на: http://localhost:8000/docs (SwaggerUI)
