## ORM: база как объекты Python

Писать SQL руками — нормально, но в приложении на Python удобнее работать с данными как с объектами. Этим занимается ORM (Object-Relational Mapping, объектно-реляционное отображение): она связывает таблицу с классом Python, строку — с экземпляром, а столбец — с атрибутом. Самая популярная ORM в экосистеме Python — SQLAlchemy.

Вместо строк SQL вы пишете `User.query.filter_by(name="Аня")`, а вместо кортежей получаете объекты с атрибутами. ORM сама собирает параметризованный SQL — про инъекции можно не думать.

## Модель

Класс-модель описывает таблицу. Пример с Flask-SQLAlchemy:

```python
from flask_sqlalchemy import SQLAlchemy

db = SQLAlchemy()

class User(db.Model):
    __tablename__ = "users"
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(80), nullable=False)
    email = db.Column(db.String(120), unique=True, nullable=False)

    def __repr__(self):
        return f"<User {self.name}>"
```

Каждый атрибут — столбец, `db.Column(...)` задаёт тип и ограничения. `db.create_all()` создаст таблицы в базе по этим классам.

## Сессия и запросы

Сессия (`db.session`) — рабочая область: через неё добавляют, изменяют и читают данные.

```python
user = User(name="Аня", email="ana@mail.ru")
db.session.add(user)
db.session.commit()               # без commit изменения не уйдут в базу

by_id = db.session.get(User, 1)   # по первичному ключу
one = db.session.execute(
    db.select(User).filter_by(email="ana@mail.ru")
).scalar_one_or_none()
many = db.session.execute(
    db.select(User).order_by(User.id.desc()).limit(10)
).scalars().all()
```

Знакомые `filter_by`, `order_by`, `limit` — это те же WHERE, ORDER BY и LIMIT, только на языке Python.

## N+1: запрос в цикле

Самая дорогая ошибка новичка — читать связанные данные в цикле. Есть модели `User` и `Order`, у пользователя много заказов. Наивный код:

```python
users = db.session.execute(db.select(User)).scalars().all()   # 1 запрос
for user in users:
    print(user.name, user.orders)   # ещё по запросу НА КАЖДОГО пользователя
```

Для 10 пользователей это 1 + 10 = 11 обращений к базе. Проблема называется N+1: один запрос на список и по одному на каждый связанный набор. На сотне объектов — сотня запросов и заметная задержка.

Решение — жадная загрузка (eager loading): связанные данные подтягиваются сразу, одним-двумя запросами.

```python
from sqlalchemy.orm import selectinload

users = db.session.execute(
    db.select(User).options(selectinload(User.orders))
).scalars().all()                  # заказы загружены заранее
for user in users:
    print(user.name, user.orders)  # дополнительных запросов нет
```

## ORM или чистый SQL

ORM ускоряет разработку и защищает от инъекций, но не бесплатна: сложные аналитические запросы, массовые обновления и тонкая оптимизация часто проще и быстрее на чистом SQL. Знать SQL всё равно нужно — ORM лишь надстройка над ним. Разумный подход: рутина через ORM, тяжёлые выборки и отчёты — SQL напрямую.

## Типовая ошибка

Забытый `db.session.commit()` после добавления объекта — данные видны в текущей сессии, но не в базе. И запрос в цикле (N+1), который работает на десяти записях и «ложится» на тысяче. Проверяйте количество выполненных запросов, когда видите тормоза.
