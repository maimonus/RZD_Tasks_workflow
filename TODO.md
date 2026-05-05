# Исправление ошибки asyncpg на Render

## План (выполнен)
1. ✅ Создать TODO.md 
2. ✅ Убрать +asyncpg из backend/app/config.py
3. ✅ Добавить psycopg2-binary в backend/requirements.txt  
4. [ ] Git commit/push для redeploy
5. [ ] Проверить логи Render

## Статус
**Готово к деплою!** Выполните:

```bash
git add .
git commit -m "Fix asyncpg MissingGreenlet: use sync psycopg2 for Render"
git push origin main
```

Render передеплоит автоматически.


