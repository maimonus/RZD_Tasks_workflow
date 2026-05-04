# Развертывание на облачных платформах

## Архитектура

Приложение состоит из двух частей, которые нужно развертывать отдельно:

1. **Frontend** - React приложение (статические файлы)
   - Может быть развернут на: Vercel, Netlify, GitHub Pages, AWS S3, etc.
   - **Рекомендуется:** Vercel

2. **Backend** - FastAPI приложение с БД
   - Требует постоянное хранилище для БД (PostgreSQL или другое)
   - Может быть развернут на: Railway, Render, Heroku, AWS, Google Cloud, etc.
   - **Рекомендуется:** Railway (бесплатный с PostgreSQL)

## 🚀 Развертывание на Vercel (Frontend)

### Шаг 1: Подготовка

Убедитесь что у вас есть переменная окружения с адресом backend:

```env
VITE_API_BASE_URL=https://your-backend-domain.com
```

### Шаг 2: Развертывание через Vercel Dashboard

1. Подключите ваш GitHub репозиторий к Vercel
2. В проекте на Vercel перейдите на Settings → Environment Variables
3. Добавьте переменную `VITE_API_BASE_URL` с URL вашего backend
4. Vercel автоматически:
   - Установит зависимости с `npm install`
   - Соберет приложение `npm run build`
   - Разместит на Vercel CDN

### Шаг 3: Настройка переменных окружения для production

На Vercel Dashboard добавьте:

| Переменная | Значение |
|-----------|---------|
| VITE_API_BASE_URL | https://your-backend-url.com |

## 🐘 Развертывание Backend на Railway

### Шаг 1: Регистрация и создание проекта

1. Зайдите на [railway.app](https://railway.app)
2. Создайте новый проект
3. Выберите "GitHub" и подключите ваш репозиторий

### Шаг 2: Добавление PostgreSQL

1. В Railroad Dashboard нажмите "Add Service"
2. Выберите "PostgreSQL"
3. PostgreSQL будет автоматически создана

### Шаг 3: Конфигурация Backend сервиса

1. Добавьте еще один сервис: "Deploy from GitHub repo"
2. Выберите ваш репозиторий

### Шаг 4: Установка переменных окружения

В Environment Variable секции добавьте:

```env
DATABASE_URL=postgresql://user:password@host:port/dbname
JWT_SECRET=your-secret-key
JWT_EXPIRES_MINUTES=120
```

**Примечание:** `DATABASE_URL` будет автоматически создана PostgreSQL сервисом.

### Шаг 5: Конфигурация деплоя

Убедитесь что в вашем репозитории:
- Есть `Dockerfile` в папке `backend/`
- Или добавьте конфигурацию на Railway Dashboard:

```
Root Directory: backend
Start Command: uvicorn app.main:app --host 0.0.0.0 --port $PORT
```

### Шаг 6: Первый деплой

1. Railway автоматически начнет деплой
2. После успешного деплоя вы получите URL типа: `https://your-backend.railway.app`
3. Скопируйте этот URL

### Шаг 7: Обновите переменные окружения на Vercel

На Vercel Dashboard обновите:

```
VITE_API_BASE_URL=https://your-backend.railway.app
```

## ⚙️ Альтернативные платформы для Backend

### Render.com

Аналогично Railway:
1. Подключите GitHub
2. Выберите "Web Service"
3. Добавьте PostgreSQL базу
4. Укажите Start Command: `cd backend && uvicorn app.main:app --host 0.0.0.0 --port $PORT`

### Heroku

⚠️ Heroku теперь платный, но процесс похож:

```bash
# Установите Heroku CLI
# Логин
heroku login

# Создайте приложение
heroku create your-app-name

# Добавьте PostgreSQL
heroku addons:create heroku-postgresql:hobby-dev

# Установите переменные окружения
heroku config:set JWT_SECRET=your-secret
heroku config:set JWT_EXPIRES_MINUTES=120

# Деплой
git push heroku main
```

## 🔗 CORS конфигурация

Убедитесь что backend CORS настроен правильно. В `backend/app/main.py`:

```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        'https://your-vercel-domain.vercel.app',
        'http://localhost:3000',  # для локального тестирования
    ],
    allow_credentials=True,
    allow_methods=['*'],
    allow_headers=['*'],
)
```

**Важно:** Замените `https://your-vercel-domain.vercel.app` на ваш реальный URL!

## 🔒 Переменные окружения для production

### На Vercel (Frontend):
- `VITE_API_BASE_URL` - URL backend API

### На Railway/Render/Heroku (Backend):
- `DATABASE_URL` - connection string для PostgreSQL (создается автоматически)
- `JWT_SECRET` - секретный ключ для JWT токенов
- `JWT_EXPIRES_MINUTES` - время жизни токена (по умолчанию 120)

## 🧪 Тестирование после развертывания

1. Откройте вашу frontend страницу на Vercel
2. Перейдите на страницу регистрации
3. Список ролей должен загруженным
4. Попробуйте зарегистрироваться

## 🐛 Диагностика проблем

### Ошибка "Не удалось загрузить список ролей"

**Решение:**
- Проверьте что переменная `VITE_API_BASE_URL` установлена на Vercel
- Проверьте что backend URL доступен: откройте `https://backend-url/docs`
- Проверьте CORS ошибки в Developer Tools (F12)

### Ошибка подключения к БД

**Решение:**
- Проверьте что `DATABASE_URL` правильно установлена на Railway
- Проверьте логи backend: в Railway Dashboard → Logs
- Убедитесь что миграции БД запущены

### Backend вернул 500 ошибку

**Решение:**
- Смотрите логи на Railway/Render/Heroku
- Возможно БД не инициализирована - нужно запустить миграции
- Проверьте что все зависимости установлены в requirements.txt

## 📝 Миграция БД

После первого развертывания backend нужно инициализировать БД:

### На Railway/Render:

1. В dashboard приложения найдите "Logs" или "Terminal"
2. Выполните команду для инициализации БД:

```bash
python -c "from app.db import engine, Base; Base.metadata.create_all(bind=engine)"
```

Или через bootstrap:

```bash
python -c "from app.db import SessionLocal; from app.bootstrap import bootstrap_defaults; db = SessionLocal(); bootstrap_defaults(db)"
```

## ✅ Чек-лист для деплоя

- [ ] Backend развернут на Railway/Render/Heroku
- [ ] PostgreSQL база создана
- [ ] Все переменные окружения установлены
- [ ] CORS правильно настроен в backend
- [ ] Frontend развернут на Vercel
- [ ] `VITE_API_BASE_URL` установлена на Vercel
- [ ] Локально протестировали с production URLs
- [ ] Backend логины видны в logs
- [ ] Frontend открывается и загружается
- [ ] Можно загрузить список ролей
