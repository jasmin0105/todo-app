"""
БЭКЕНД: сервер на Flask (Python) + база данных PostgreSQL.

Что делает сервер:
1. Отдаёт страницу (фронтенд) по адресу "/".
2. Предоставляет API (набор адресов), через который фронтенд
   читает, добавляет, меняет и удаляет задачи в базе данных.

Это называется CRUD: Create (создать), Read (прочитать),
Update (обновить), Delete (удалить).
"""

import os
import datetime
import psycopg2
from psycopg2.extras import RealDictCursor
from flask import Flask, jsonify, request

# Создаём приложение. Папка static — там лежит фронтенд (html, css, js).
app = Flask(__name__, static_folder="static", static_url_path="/static")


# ---------- НАСТРОЙКИ ПОДКЛЮЧЕНИЯ К POSTGRESQL ----------
# Значения берутся из переменных окружения, а если их нет — используются
# значения по умолчанию (справа). Если у тебя другой пароль или порт —
# поменяй значение по умолчанию прямо здесь.

DB_CONFIG = {
    "host":     os.getenv("DB_HOST", "localhost"),
    "port":     os.getenv("DB_PORT", "5432"),
    "dbname":   os.getenv("DB_NAME", "todo_db"),
    "user":     os.getenv("DB_USER", "zasmin"),
    "password": os.getenv("DB_PASSWORD", ""),
}

# Какие колонки отдаём наружу. due_date::text превращает дату в строку "2026-10-25"
COLUMNS = "id, title, done, priority, due_date::text AS due_date"

# Допустимые приоритеты задач
PRIORITIES = ("low", "medium", "high")


# ---------- РАБОТА С БАЗОЙ ДАННЫХ ----------

def get_db():
    """Открывает соединение с PostgreSQL."""
    return psycopg2.connect(**DB_CONFIG)


def init_db():
    """
    Готовит таблицу tasks:
    1. создаёт её, если нет;
    2. добавляет новые колонки priority и due_date, если их ещё нет
       (старые задачи остаются на месте).
    """
    conn = get_db()
    cur = conn.cursor()
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS tasks (
            id    SERIAL PRIMARY KEY,               -- уникальный номер (растёт сам)
            title TEXT    NOT NULL,                 -- текст задачи
            done  BOOLEAN NOT NULL DEFAULT FALSE    -- выполнена или нет
        )
        """
    )
    # Приоритет: low / medium / high (у старых задач будет medium)
    cur.execute("ALTER TABLE tasks ADD COLUMN IF NOT EXISTS priority TEXT NOT NULL DEFAULT 'medium'")
    # Срок выполнения (может быть пустым)
    cur.execute("ALTER TABLE tasks ADD COLUMN IF NOT EXISTS due_date DATE")
    conn.commit()
    cur.close()
    conn.close()


def query(sql, params=(), fetch="all"):
    """
    Вспомогательная функция: выполняет SQL-запрос и возвращает результат.
    fetch = "all"  -> список строк
    fetch = "one"  -> одна строка (или None)
    fetch = None   -> ничего не возвращать (для DELETE)
    Строки приходят как словари: {"id": 1, "title": "...", "done": False}
    """
    conn = get_db()
    cur = conn.cursor(cursor_factory=RealDictCursor)
    cur.execute(sql, params)   # %s — безопасная подстановка значений
    result = None
    if fetch == "all":
        result = cur.fetchall()
    elif fetch == "one":
        result = cur.fetchone()
    conn.commit()
    cur.close()
    conn.close()
    return result


def valid_date(value):
    """Проверяет, что строка — настоящая дата вида 2026-10-25."""
    try:
        datetime.date.fromisoformat(value)
        return True
    except (ValueError, TypeError):
        return False


# ---------- МАРШРУТЫ (АДРЕСА) ----------

@app.route("/")
def index():
    """Главная страница — отдаём файл index.html."""
    return app.send_static_file("index.html")


@app.route("/api/tasks", methods=["GET"])
def get_tasks():
    """READ: получить все задачи."""
    tasks = query(f"SELECT {COLUMNS} FROM tasks ORDER BY id DESC")
    return jsonify(tasks)


@app.route("/api/tasks", methods=["POST"])
def add_task():
    """CREATE: добавить новую задачу (название, приоритет, срок)."""
    data = request.get_json()
    title = (data.get("title") or "").strip()
    priority = data.get("priority") or "medium"
    due_date = data.get("due_date") or None   # пустая строка -> None (в БД будет NULL)

    if not title:  # проверка: пустую задачу не добавляем
        return jsonify({"error": "Название не может быть пустым"}), 400
    if priority not in PRIORITIES:
        return jsonify({"error": "Неверный приоритет"}), 400
    if due_date and not valid_date(due_date):
        return jsonify({"error": "Неверная дата"}), 400

    # RETURNING возвращает только что созданную строку
    task = query(
        f"INSERT INTO tasks (title, priority, due_date) VALUES (%s, %s, %s) RETURNING {COLUMNS}",
        (title, priority, due_date),
        fetch="one",
    )
    return jsonify(task), 201  # 201 = «создано»


@app.route("/api/tasks/<int:task_id>", methods=["PUT"])
def update_task(task_id):
    """
    UPDATE: изменить задачу.
    Можно прислать title (текст), done (статус), priority (приоритет) —
    любые из них. То, что не прислали, остаётся как было (так работает COALESCE).
    """
    data = request.get_json()
    title = data.get("title")
    done = data.get("done")
    priority = data.get("priority")

    if title is not None:
        title = title.strip()
        if not title:
            return jsonify({"error": "Название не может быть пустым"}), 400

    if done is not None:
        done = bool(done)

    if priority is not None and priority not in PRIORITIES:
        return jsonify({"error": "Неверный приоритет"}), 400

    task = query(
        f"""
        UPDATE tasks
        SET title    = COALESCE(%s, title),
            done     = COALESCE(%s, done),
            priority = COALESCE(%s, priority)
        WHERE id = %s
        RETURNING {COLUMNS}
        """,
        (title, done, priority, task_id),
        fetch="one",
    )
    if task is None:
        return jsonify({"error": "Задача не найдена"}), 404
    return jsonify(task)


@app.route("/api/tasks/completed", methods=["DELETE"])
def delete_completed():
    """DELETE: удалить сразу все выполненные задачи."""
    query("DELETE FROM tasks WHERE done = TRUE", fetch=None)
    return jsonify({"ok": True})


@app.route("/api/tasks/<int:task_id>", methods=["DELETE"])
def delete_task(task_id):
    """DELETE: удалить задачу."""
    query("DELETE FROM tasks WHERE id = %s", (task_id,), fetch=None)
    return jsonify({"ok": True})


# ---------- ЗАПУСК ----------

if __name__ == "__main__":
    init_db()                 # сначала готовим таблицу в базе
    app.run(debug=True)       # потом запускаем сервер на http://127.0.0.1:5000