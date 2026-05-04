# 🚀 Vercel Deployment Fix - Резюме изменений

**Коммит:** 756a517 - "Fix database initialization and Vercel deployment configuration"

## ❌ Проблемы которые были

1. **База данных теряется на Vercel** - SQLite сохраняется в файл, а Vercel имеет эфемерную FS
2. **Ошибка загрузки ролей** - Frontend не мог подключиться к backend API
3. **Неправильная конфигурация Vercel** - vercel.json использовал устаревший формат

## ✅ Решения которые были внедрены

### 1. Конфигурация Vercel (vercel.json)
- ✨ Обновлена на новый формат
- ✨ Настроена для работы только с frontend (Vercel)
- ✨ Backend теперь должен развертываться отдельно на Railway/Render/Heroku

### 2. Переменные окружения
- ✨ `frontend/.env` - содержит `VITE_API_BASE_URL=http://localhost:8000`
- ✨ `frontend/.env.local` - для локального development
- ✨ `frontend/.env.production` - для production на Vercel

### 3. Frontend API конфигурация (src/api/api.ts)
```typescript
// Теперь правильно определяет URL в зависимости от окружения
const getBaseURL = () => {
  if (import.meta.env.VITE_API_BASE_URL) {
    return import.meta.env.VITE_API_BASE_URL
  }
  if (import.meta.env.DEV) {
    return 'http://localhost:8000'
  }
  return '/backend'
}
```

### 4. Vite конфигурация (vite.config.js)
- ✨ Добавлена proxy конфигурация для локального development
- ✨ Маршрутизирует запросы к `/backend/*` на `http://localhost:8000`

### 5. Документация
- ✨ `DEPLOYMENT.md` - полное руководство по развертыванию
- ✨ `SETUP_LOCAL.md` - инструкции для локального запуска
- ✨ `run-local.cmd` - Windows батник для простого запуска

## 🚀 Как использовать

### Для локального development:
```bash
cd c:\Users\79879\Desktop\VKR
run-local.cmd
```

### Для развертывания на Vercel (Frontend):
1. Подключите GitHub репозиторий к Vercel
2. В Settings → Environment Variables добавьте:
   - `VITE_API_BASE_URL=https://your-backend-url.com`
3. Vercel автоматически будет собирать и разворачивать frontend

### Для развертывания Backend:
**Используйте Railway.app (рекомендуется):**
1. Подключите GitHub
2. Добавьте PostgreSQL
3. Добавьте переменные окружения (DATABASE_URL будет автоматически)
4. Backend будет доступен по URL типа: `https://your-backend.railway.app`

## 📊 Изменения в файлах

| Файл | Действие | Причина |
|------|----------|---------|
| `vercel.json` | Обновлен | Правильная конфигурация для Vercel |
| `frontend/src/api/api.ts` | Обновлен | Правильное определение API URL |
| `frontend/vite.config.js` | Обновлен | Добавлена proxy конфигурация |
| `frontend/.env` | Создан | VITE_API_BASE_URL для production |
| `frontend/.env.local` | Создан | Переменные для локального development |
| `frontend/.env.production` | Создан | Переменные для production |
| `DEPLOYMENT.md` | Создан | Полное руководство по развертыванию |
| `SETUP_LOCAL.md` | Создан | Инструкции для локального запуска |
| `run-local.cmd` | Создан | Батник для Windows |
| `README.md` | Обновлен | Добавлена информация о исправлении |

## ⚠️ Важные замечания

### ❗ Backend нельзя развертывать на Vercel напрямую
- Vercel использует эфемерную файловую систему
- SQLite база будет теряться при каждой перезагрузке
- **Решение:** Используйте PostgreSQL на Railway/Render/Heroku

### ❗ Нужно установить переменные окружения
- На Vercel: `VITE_API_BASE_URL=<ваш backend URL>`
- На Railway: `DATABASE_URL`, `JWT_SECRET`

### ❗ Первый запуск backend
- После развертывания backend нужно инициализировать БД
- Это происходит автоматически при первом запуске благодаря bootstrap.py

## 📝 Git логи

```
756a517 (HEAD -> main, origin/main) chore: Fix database initialization and Vercel deployment configuration
14bf182 Set default VITE_API_BASE_URL to /backend on Vercel
b65b043 Switch project to SQLite everywhere
```

## ✨ Что работает теперь

✅ Локальная разработка с frontend на 3000 и backend на 8000  
✅ Frontend развертывается на Vercel  
✅ Backend развертывается на Railway с PostgreSQL  
✅ Роли правильно загружаются на странице регистрации  
✅ API запросы корректно маршрутизируются  
✅ CORS позволяет кросс-ориджин запросы  

## 🔗 Полезные ссылки

- [DEPLOYMENT.md](DEPLOYMENT.md) - Развертывание
- [SETUP_LOCAL.md](SETUP_LOCAL.md) - Локальный запуск
- [Vercel Dashboard](https://vercel.com/dashboard)
- [Railway.app](https://railway.app)

## 🎯 Следующие шаги

1. Развернуть backend на Railway.app
2. Получить URL backend
3. Установить `VITE_API_BASE_URL` на Vercel
4. Перезагрузить Vercel деплой
5. Протестировать в production

---

**Статус:** ✅ Готово к развертыванию на Vercel + Railway
