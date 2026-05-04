# TODO: Render Deployment Fix (asyncpg migration)
Status: 🔄 In Progress

## Шаги плана:
- [x] 1. Прочитать файлы и составить план (завершено)
- [✅] 2. Отредактировать backend/requirements.txt (удалить psycopg*, добавить asyncpg)
- [✅] 3. Отредактировать backend/app/config.py (добавить замену диалекта на asyncpg)
- [✅] 4. Создать TODO.md с прогрессом (завершено)
- [ ] 5. Commit & Push в GitHub
- [ ] 6. Проверить Render логи (авто-деплой)
- [ ] 7. Тестировать подключение к PostgreSQL на Render
- [ ] 8. Обновить TODO.md (✅ Deploy success)
- [ ] 9. Проверить frontend интеграцию (VITE_API_BASE_URL)

Команды после правок:
```
git add .
git commit -m "fix(render): replace psycopg2 with asyncpg for Render deploy"
git push origin main
```

