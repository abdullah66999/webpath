## Модель — это таблица на языке Python

Модель (model) описывает сущность и её данные. Класс — это таблица, поле — колонка, экземпляр класса — строка.

```python
class Post(models.Model):
    title = models.CharField("заголовок", max_length=200)
    body = models.TextField("текст")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = "пост"
        ordering = ["-created_at"]

    def __str__(self):
        return self.title
```

`CharField` требует `max_length`, `TextField` — для длинного текста без ограничения. `auto_now_add=True` проставляет дату создания при первом сохранении. `class Meta` задаёт поведение модели: человекочитаемое имя и порядок сортировки. `__str__` показывает, как объект выглядит в админке и отладке.

## makemigrations создаёт, migrate применяет

Изменили модель — схему базы нужно обновить. Делается это в два шага и ровно в таком порядке:

```bash
python manage.py makemigrations   # создаёт файлы в posts/migrations/
python manage.py migrate          # применяет их к базе
```

`makemigrations` только генерирует описание изменений — файл миграции. `migrate` выполняет SQL и меняет реальную таблицу. Перепутать порядок нельзя: без созданной миграции `migrate` нечего применять. Миграции коммитят в git — это история изменений схемы.

## Связи между моделями

**ForeignKey** — «один ко многим»: у поста один автор, у автора много постов.

```python
author = models.ForeignKey(User, on_delete=models.CASCADE, related_name="posts")
```

Аргумент `on_delete` **обязателен** начиная с Django 2: он говорит, что делать с постами при удалении автора (`CASCADE` — удалить вместе с ним, `PROTECT` — запретить удаление, `SET_NULL` — обнулить ссылку). `related_name="posts"` включает обратный доступ: `user.posts.all()`.

**ManyToMany** — «многие ко многим»: пост может иметь несколько тегов, тег встречается во многих постах.

```python
tags = models.ManyToManyField(Tag, blank=True, related_name="posts")
```

## N+1: select_related против prefetch_related

Пусть 20 постов, у каждого свой автор. `Post.objects.all()` и обращение к `post.author` в цикле даст **1 + 20 запросов** — это и есть N+1.

- `select_related("author")` — для ForeignKey и OneToOne. Добавляет SQL JOIN и подтягивает авторов одним запросом: **1 запрос** вместо 21.
- `prefetch_related("tags")` — для ManyToMany и обратных связей. Делает отдельный запрос на связанные объекты и склеивает их в Python: **2 запроса** вместо 21.

Перепутать их — классика: `select_related` не работает для ManyToMany, а `prefetch_related` для одиночного ключа делает лишний запрос.

## Админка из коробки

```python
# posts/admin.py
from django.contrib import admin
from .models import Post

admin.site.register(Post)
```

Одна строка — и в `/admin/` появился интерфейс для создания, правки и удаления постов. Для простых случаев удобнее `ModelAdmin` с `list_display` и `search_fields`, но регистрация работает и без него.

## Типовая ошибка

Забыли `on_delete` у ForeignKey — миграция не создастся, Django попросит указать поведение. Вторая ловушка: цикл по `objects.all()` с обращением к связанной модели внутри без `select_related` — молчаливый N+1, который незаметен на трёх записях и роняет продакшн на тысяче.
