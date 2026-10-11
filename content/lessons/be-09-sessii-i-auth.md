## HTTP не помнит вас

Каждый запрос независим: сервер не знает, что пять секунд назад к нему обращались вы. Чтобы узнавать посетителя, нужен идентификатор, который приходит с каждым запросом. Эту роль играет кука (cookie): сервер её выдаёт, браузер хранит и автоматически подставляет в заголовок `Cookie`.

Flask прячет работу с куками за объектом `session`:

```python
from flask import session

session["user_id"] = 7          # записать
user_id = session.get("user_id")  # прочитать
session.pop("user_id", None)      # удалить
session.clear()                   # очистить целиком
```

## Сессия Flask — это подписанная кука, а не запись на сервере

Важно понимать механику. Flask не хранит данные сессии у себя: он кладёт их в куку, сериализует в JSON, кодирует в base64 и **подписывает** ключом `SECRET_KEY`. При следующем запросе подпись проверяется, и если куку меняли — данные отбрасываются.

Отсюда два следствия:

- Содержимое сессии **видно** любому, кто открыл DevTools. Кладите туда только идентификатор пользователя, никогда пароли и номера карт.
- Подделать его **нельзя** — без ключа подпись не сойдётся.

Настоящее серверное хранение (Redis, база) подключают расширением Flask-Session, когда сессий становится слишком много или их нужно отзывать принудительно.

## SECRET_KEY

```python
import os

app = Flask(__name__)
app.secret_key = os.environ["SECRET_KEY"]
```

Ключ задаётся один раз и держится в переменной окружения или в файле `.env`, который добавлен в `.gitignore`. Ключ, закоммиченный в репозиторий, считается скомпрометированным: его видно всем, кто читал код, и он остаётся в истории git навсегда.

Без `secret_key` Flask не сможет подписать куку. Запись `session["user_id"] = 7` сама по себе пройдёт, а вот когда Flask соберётся сохранять сессию в ответ, вы получите `RuntimeError: The session is unavailable because no secret key was set`.

Дополнительно включите флаги кук:

```python
app.config.update(
    SESSION_COOKIE_HTTPONLY=True,     # JavaScript не может прочитать куку
    SESSION_COOKIE_SECURE=True,       # только по HTTPS
    SESSION_COOKIE_SAMESITE="Lax",    # защита от межсайтовой подделки запросов
    PERMANENT_SESSION_LIFETIME=3600,  # время жизни в секундах
)
```

## Пароли: только хеш и только werkzeug

Пароль в открытом виде хранить нельзя. Утечка базы — и вы отдали чужие пароли, которые люди используют везде. Хешируют через `werkzeug.security`, он идёт в комплекте с Flask:

```python
from werkzeug.security import check_password_hash, generate_password_hash

password_hash = generate_password_hash("correct-horse-battery")
check_password_hash(password_hash, "correct-horse-battery")   # True
check_password_hash(password_hash, "wrong")                   # False
```

`generate_password_hash` сама добавляет случайную соль и выбирает стойкий медленный алгоритм. Результат — строка, в которой зашиты алгоритм, параметры и соль: `pbkdf2:sha256:600000$aBc123$...` или `scrypt:32768:8:1$...`. Её и сохраняют в базу. `check_password_hash` разбирает эту строку и сравнивает значения за постоянное время.

**Никогда не используйте `hashlib.md5` или `hashlib.sha256` для паролей.** Они быстрые по замыслу, соли не добавляют, и перебор на видеокарте даёт миллиарды вариантов в секунду. Это не «слабое место», это взлом за минуты.

## Регистрация, вход, выход

```python
import os

from flask import (
    Flask, jsonify, redirect, render_template, request, session, url_for
)
from werkzeug.security import check_password_hash, generate_password_hash

app = Flask(__name__)
app.secret_key = os.environ["SECRET_KEY"]

USERS = {"anna@example.ru": {"id": 7, "password_hash": "pbkdf2:sha256:600000$..."}}


@app.post("/register")
def register():
    data = request.get_json(silent=True) or {}
    email = data.get("email", "")
    password = data.get("password", "")
    if not email or not password:
        return jsonify({"error": "нужны email и password"}), 422
    if email in USERS:
        return jsonify({"error": "такой email уже занят"}), 409
    user = {"id": len(USERS) + 1, "password_hash": generate_password_hash(password)}
    USERS[email] = user
    return jsonify({"id": user["id"]}), 201


@app.get("/login")
def login_page():
    return render_template("login.html")


@app.post("/login")
def login():
    data = request.get_json(silent=True) or {}
    user = USERS.get(data.get("email", ""))
    if user is None or not check_password_hash(user["password_hash"], data.get("password", "")):
        return jsonify({"error": "неверный email или пароль"}), 401
    session.clear()                    # защита от фиксации сессии
    session["user_id"] = user["id"]
    session.permanent = True
    return jsonify({"user_id": user["id"]})


@app.post("/logout")
def logout():
    session.clear()
    return redirect(url_for("login_page"))
```

Редирект после выхода ведёт на `login_page` — маршрут, зарегистрированный для `GET`. Если написать `url_for("login")`, браузер сделает `GET /login` к маршруту, который принимает только `POST`, и получит `405 Method Not Allowed`.

Обратите внимание на `401` при неудачном входе и на одинаковое сообщение для «нет такого пользователя» и «неверный пароль». Если писать «пользователь не найден», вы даёте атакующему способ перебирать существующие email.

## Декоратор login_required

```python
from functools import wraps


def login_required(view):
    @wraps(view)
    def wrapped(*args, **kwargs):
        if "user_id" not in session:
            return jsonify({"error": {"status": 401, "message": "нужно войти"}}), 401
        return view(*args, **kwargs)
    return wrapped


@app.get("/api/v1/profile")
@login_required
def profile():
    return jsonify({"user_id": session["user_id"]})
```

`@wraps` обязателен: без него имя функции станет `wrapped`, и Flask зарегистрирует два endpoint с одинаковым именем — приложение не стартует.

## Типичные ошибки

- **`secret_key` в коде и в репозитории.** Ключ надо читать из окружения, а в репозитории держать `.env.example` с пустым значением.
- **Хеширование пароля через `hashlib`.** Только `generate_password_hash`.
- **Сравнение хешей через `==` вместо `check_password_hash`.** Обычное сравнение уязвимо к атаке по времени и не умеет читать параметры из строки хеша.
- **Проверка «залогинен ли» внутри каждого обработчика.** Это и есть работа декоратора.
- **Редирект на маршрут, принимающий только `POST`.** Браузер пойдёт по нему `GET`-ом и получит `405`.
- **Пароль или роль в сессии.** Куку видно; храните только `user_id`, а права читайте из своего хранилища.

## Что дальше

Авторизация работает в одном файле. Дальше — как разнести приложение на модули через Blueprint и собирать его фабрикой.
