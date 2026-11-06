-- Скрипт базы данных PostgreSQL.
-- Его можно выполнить в DataGrip (консоль запросов) вручную.
-- Но таблицу создаёт и сам app.py при запуске, так что этот файл — для наглядности.

-- Шаг 1. Создать базу (выполнять, подключившись к базе postgres):
CREATE DATABASE todo_db;

-- Шаг 2. Подключиться к todo_db и создать таблицу:
CREATE TABLE IF NOT EXISTS tasks (
    id    SERIAL PRIMARY KEY,
    title TEXT    NOT NULL,
    done  BOOLEAN NOT NULL DEFAULT FALSE
);

-- Проверка:
-- SELECT * FROM tasks;
