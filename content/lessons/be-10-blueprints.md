## Один файл заканчивается быстро

Пока маршрутов пять, `app.py` читается нормально. На тридцатом вы начинаете листать файл в поисках нужной функции, импорты разрастаются, а две части приложения случайно начинают зависеть друг от друга. Решение — разбить код на модули ещё до того, как это стало больно.

## Blueprint: модуль с маршрутами

**Blueprint** — набор маршрутов, шаблонов и обработчиков ошибок, который регистрируется в приложении целиком.

```python
# app/tasks/routes.py
from flask import Blueprint, jsonify

from app.tasks import service

bp = Blueprint("tasks", __name__, url_prefix="/api/v1")


@bp.get("/tasks")
def list_tasks():
    items = service.list_tasks()
    return jsonify({"items": items, "total": len(items)})


@bp.get("/tasks/<int:task_id>")
def task_detail(task_id):
    task = service.get_task(task_id)
    if task is None:
        return jsonify({"error": {"status": 404, "message": "задача не найдена"}}), 404
    return jsonify(task)
```

`url_prefix` добавляется ко всем путям blueprint'а, поэтому внутри пишут `/tasks`, а снаружи получается `/api/v1/tasks`. Имя endpoint тоже получает префикс: `url_for("tasks.list_tasks")`.

Регистрация в приложении:

```python
from app.tasks.routes import bp as tasks_bp

app.register_blueprint(tasks_bp)
```

У blueprint могут быть свои папки `template_folder` и `static_folder`, свои `@bp.errorhandler`, `@bp.before_request` и даже свой `url_defaults`. Это полноценный кусок приложения, который можно отключить одной строкой.

## Фабрика приложения

Глобальный `app = Flask(__name__)` на уровне модуля создаёт три проблемы: нельзя собрать второе приложение с другим конфигом, тесты переиспользуют одно и то же состояние, а модули начинают импортировать друг друга по кругу.

**Фабрика** (application factory) — функция, которая создаёт и настраивает приложение при вызове:

```python
# app/__init__.py
from flask import Flask

from app.config import CONFIG


def create_app(config_name="development"):
    app = Flask(__name__)
    app.config.from_object(CONFIG[config_name])
    app.json.ensure_ascii = False      # провайдер JSON настраивается здесь, а не через config

    from app.tasks.routes import bp as tasks_bp
    from app.auth.routes import bp as auth_bp

    app.register_blueprint(tasks_bp)
    app.register_blueprint(auth_bp)

    from app.errors import register_error_handlers
    register_error_handlers(app)

    return app
```

Импорт blueprint'ов **внутри функции** — не случайность. На уровне модуля он создаёт циклическую зависимость: `app/__init__.py` импортирует `routes.py`, а тот импортирует что-то из `app`. Внутри `create_app` модуль `app` уже загружен, и круга не возникает.

Запуск из терминала:

```bash
flask --app app run --debug
```

CLI Flask сам найдёт функцию `create_app` в пакете `app` и вызовет её.

## Конфигурация

Конфиг держат в классах, а не в `if` внутри кода:

```python
# app/config.py
import os


class BaseConfig:
    SECRET_KEY = os.environ.get("SECRET_KEY")
    MAX_CONTENT_LENGTH = 2 * 1024 * 1024     # тело запроса не больше 2 МБ
    SESSION_COOKIE_HTTPONLY = True
    SESSION_COOKIE_SAMESITE = "Lax"


class DevelopmentConfig(BaseConfig):
    DEBUG = True
    SESSION_COOKIE_SECURE = False


class TestingConfig(BaseConfig):
    TESTING = True
    SECRET_KEY = "test-only"


class ProductionConfig(BaseConfig):
    DEBUG = False
    SESSION_COOKIE_SECURE = True


CONFIG = {
    "development": DevelopmentConfig,
    "testing": TestingConfig,
    "production": ProductionConfig,
}
```

Правило одно: **секреты приходят из окружения, а не из репозитория.** В git лежит `.env.example` с перечнем переменных и пустыми значениями, настоящий `.env` добавлен в `.gitignore`. `SECRET_KEY = "12345"` в коде — это не конфигурация, это скомпрометированный ключ.

## Структура проекта

```text
tasks-api/
├─ app/
│  ├─ __init__.py          # create_app
│  ├─ config.py            # классы конфигурации
│  ├─ errors.py            # общие errorhandler
│  ├─ storage.py           # слой хранения
│  ├─ auth/
│  │  ├─ __init__.py
│  │  └─ routes.py         # bp = Blueprint("auth", ...)
│  ├─ tasks/
│  │  ├─ __init__.py
│  │  ├─ routes.py         # bp = Blueprint("tasks", ...)
│  │  └─ service.py        # бизнес-логика без Flask
│  ├─ static/
│  └─ templates/
├─ tests/
├─ .env.example
└─ pyproject.toml
```

Обратите внимание на `service.py`: маршруты разбирают запрос и формируют ответ, а правила живут рядом, в отдельном модуле, который ничего не знает про HTTP. Такой модуль тестируется без поднятия сервера.

## Типичная ошибка: логика разъехалась по маршрутам

Сначала blueprint выглядит аккуратно, потом в `routes.py` появляются запросы к хранилищу, расчёты и отправка писем — по двести строк в одном обработчике. Разделение на модули само по себе ничего не даёт: слой маршрутизации должен остаться тонким. Правило простое — если кусок кода в обработчике можно вызвать без `request` и `jsonify`, ему место в `service.py`.

## Что дальше

Осталось собрать всё вместе. Следующий урок — итоговый проект этапа: полноценный CRUD-API для списка задач.
