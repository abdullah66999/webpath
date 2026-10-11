## jsonify делает две вещи

`jsonify` превращает словарь или список Python в тело ответа и проставляет заголовок `Content-Type: application/json`. Если вместо него вернуть `str(task)`, в тело попадёт `{'id': 1}` с одинарными кавычками — это не JSON, и `response.json()` на клиенте упадёт с ошибкой разбора. Заголовок при этом останется `text/html`, а на него смотрят браузерные обёртки и прокси.

```python
from flask import jsonify

@app.get("/api/v1/tasks")
def list_tasks():
    return jsonify([{"id": 1, "title": "Купить молоко"}])
```

Начиная с Flask 2.2 словарь можно возвращать напрямую — `return {"id": 1}` сработает так же. Но `jsonify` нужен, когда вы добавляете статус или заголовки:

```python
return jsonify(task), 201
return jsonify(task), 200, {"Location": f"/api/v1/tasks/{task['id']}"}
```

Две полезные настройки провайдера JSON:

```python
app.json.ensure_ascii = False   # кириллица в теле как есть, а не \u041f...
app.json.sort_keys = False      # не переставлять ключи словаря по алфавиту
```

## Код статуса — вторая половина ответа

`return jsonify(data), 201` — кортеж из тела и статуса. Без второго элемента Flask подставит `200`. Статус обязан отражать реальность:

- `201` — создали, и желательно заголовок `Location`.
- `204` — сделали, тела нет. Стандартный ответ на успешный `DELETE`.
- `400` — запрос кривой синтаксически.
- `401` — пользователь не опознан.
- `403` — опознан, но прав не хватает.
- `404` — такого ресурса нет.
- `409` — конфликт состояния: email уже занят.
- `422` — тело разобрали, но значения бессмысленны: `{"age": -5}`.
- `500` — ваш код упал. Детали наружу не отдают.

## Единая форма ошибки

Выберите один формат и держитесь его во всём API. Удобный минимум:

```json
{
  "error": {
    "status": 422,
    "message": "заголовок не может быть пустым",
    "field": "title"
  }
}
```

```python
def api_error(status, message, field=None):
    payload = {"error": {"status": status, "message": message}}
    if field is not None:
        payload["error"]["field"] = field
    return jsonify(payload), status
```

Ключ `field` появляется только когда ошибка привязана к конкретному полю. Клиенту проще: один парсер ошибок на весь проект.

## Обработчики ошибок ловят всё

`@app.errorhandler` перехватывает не только ваши `abort()`, но и то, что бросает сам Flask: `404` на несуществующий маршрут, `405` на неверный метод, `500` на необработанное исключение.

```python
from werkzeug.exceptions import HTTPException

@app.errorhandler(404)
def not_found(error):
    return api_error(404, "ресурс не найден")


@app.errorhandler(HTTPException)
def http_error(error):
    return api_error(error.code, error.description)


@app.errorhandler(Exception)
def internal_error(error):
    app.logger.exception("необработанная ошибка")   # детали — в лог, не клиенту
    return api_error(500, "внутренняя ошибка сервера")
```

Порядок важен: Flask выбирает наиболее специфичный обработчик, поэтому `404` сработает раньше `HTTPException`, а тот — раньше `Exception`.

Без этих трёх функций API будет отдавать HTML-страницу ошибки от Werkzeug. Фронтенд вызовет `response.json()` и упадёт с невнятным `SyntaxError` — классический сценарий «шаблон отдаёт HTML там, где клиент ждёт JSON».

## Коллекция и пагинация

Для списка возвращайте не голый массив, а объект с метаданными: их можно расширять, не ломая клиентов.

```json
{
  "items": [{ "id": 1, "title": "Купить молоко", "done": false }],
  "total": 42,
  "limit": 20,
  "offset": 0
}
```

## Типичная ошибка: 200 на всё

```python
@app.delete("/api/v1/tasks/<int:task_id>")
def delete_task(task_id):
    if TASKS.pop(task_id, None) is None:
        return jsonify({"ok": False, "message": "не найдено"})   # статус 200!
    return jsonify({"ok": True})
```

Клиент обязан читать тело, чтобы понять, что случилось. Мониторинг, кэш и прокси видят только `200` и считают, что всё хорошо, — ошибка уедет в продакшн незамеченной. Правильно: `404` и короткое описание в теле, а на успех — `204` без тела.

## Что дальше

По API мы отвечаем машинам. Но Flask умеет собирать и отдавать HTML — следующий урок про шаблоны Jinja.
