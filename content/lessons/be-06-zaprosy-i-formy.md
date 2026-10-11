## Один объект request на весь запрос

Внутри view-функции доступен глобальный объект `request` — Flask подставляет его для текущего запроса. Из него достают всё, что прислал клиент.

```python
from flask import request

request.method        # 'GET', 'POST', 'PUT', ...
request.path          # '/posts/7'
request.args          # query-параметры: ?page=2&done=false
request.form          # тело формы application/x-www-form-urlencoded
request.json          # тело application/json, уже разобранное в dict
request.files         # загруженные файлы
request.headers       # заголовки запроса
request.cookies       # куки
```

## Данные лежат в разных местах

Путать `args` и `form` — классическая ошибка. Правило простое:

- **`request.args`** — всё, что после вопросительного знака в URL. Не зависит от метода: бывает и у `GET`, и у `POST`.
- **`request.form`** — тело запроса с `Content-Type: application/x-www-form-urlencoded` или `multipart/form-data`. То, что отправил `<form>`.
- **`request.json`** — тело с `Content-Type: application/json`.
- **`request.files`** — файлы из формы с `enctype="multipart/form-data"`.

Если клиент прислал JSON, а вы читаете `request.form`, поле окажется пустым — и наоборот. Ошибки не будет, будет молчаливая пустота.

## Всё приходит строкой

HTTP — текстовый протокол. `request.args.get("page")` вернёт `"2"`, а не `2`. Сравнивать `"2" > 1` Python не позволит, а `"2" == 2` просто даст `False`.

У `MultiDict` есть встроенное приведение типа:

```python
page = request.args.get("page", default=1, type=int)
limit = request.args.get("limit", default=20, type=int)
done = request.args.get("done")            # 'true' / 'false' — разбирайте вручную
tags = request.args.getlist("tag")         # ?tag=a&tag=b -> ['a', 'b']
```

Параметр `type` пытается преобразовать значение, а при неудаче возвращает `default` — без исключения. Это удобно, но скрывает ошибку: `?page=abc` даст `1`, и вы не узнаете, что запрос был кривым.

## Валидация обязательна, всегда

Клиент может прислать что угодно: отсутствующие поля, `null`, список вместо строки, отрицательное количество. Проверяйте на сервере и отвечайте `400` или `422` с внятным описанием.

```python
def validate_signup(data):
    errors = []
    email = data.get("email", "")
    password = data.get("password", "")

    if not email:
        errors.append("email обязателен")
    elif "@" not in email:
        errors.append("email некорректен")

    if len(password) < 8:
        errors.append("password должен быть не короче 8 символов")

    return errors
```

Функция ничего не знает про Flask: на входе словарь, на выходе список строк. Её можно вызвать и из обработчика формы, и из JSON-API, и из теста.

Когда данные уходят в базу, добавляется ещё одно правило: **никакой склейки строк**. `f"SELECT * FROM users WHERE email = '{email}'"` позволяет отправить `email = "'; DROP TABLE users; --"`. Запрос строят только с параметрами-заполнителями — как именно, разберём на этапе про базы данных.

## Редирект после POST

Если на `POST` ответить обычной страницей, обновление браузера отправит форму второй раз. Стандартное решение — шаблон **PRG** (Post/Redirect/Get): обработчик отвечает редиректом, а браузер делает повторный `GET`.

```python
from flask import redirect, url_for

@app.post("/signup")
def signup():
    errors = validate_signup(request.form)
    if errors:
        return jsonify({"errors": errors}), 400
    user_id = create_user(request.form)
    return redirect(url_for("profile", user_id=user_id))
```

`redirect()` по умолчанию возвращает `302 Found`. Для «переехало навсегда» есть `redirect(url, code=301)`.

## Загрузка файлов

```python
from pathlib import Path

from werkzeug.utils import secure_filename

UPLOAD_DIR = Path("uploads")


@app.post("/upload")
def upload():
    file = request.files.get("avatar")
    if file is None or file.filename == "":
        return jsonify({"error": "файл не прислан"}), 400
    name = secure_filename(file.filename)   # убирает ../ и прочий мусор
    UPLOAD_DIR.mkdir(exist_ok=True)
    file.save(UPLOAD_DIR / name)
    return jsonify({"saved": name}), 201
```

Имя файла приходит от клиента и может содержать `../../etc/passwd`. `secure_filename` оставляет только безопасные символы — без неё сохранять файл на диск нельзя.

## Типичная ошибка: request.json вместо get_json

`request.json` при неверном `Content-Type` бросает `415 Unsupported Media Type`, а при битом теле — `400`. Если вы хотите сами решить, что отвечать, читайте так:

```python
data = request.get_json(silent=True)
if data is None:
    return jsonify({"error": "ожидали JSON в теле запроса"}), 400
```

## Что дальше

Данные научились приходить. Следующий урок — как отдавать их обратно: `jsonify`, статусы и единый формат ошибок.
