## DRF — это Django, который отдаёт JSON

Django REST Framework (DRF) — надстройка над Django для построения API. Он добавляет три вещи: сериализаторы, viewsets и browsable API. Если во Flask вы собирали JSON-ответы и валидацию из отдельных библиотек, в DRF это единая система в стиле Django.

## Сериализатор — не модель

Сериализатор описывает, как объект превращается в примитивы для JSON и как входящие данные проверяются и превращаются обратно. Это **не** модель: модель хранит данные, сериализатор — их представление наружу.

```python
class PostSerializer(serializers.ModelSerializer):
    author_name = serializers.CharField(source="author.get_full_name", read_only=True)

    class Meta:
        model = Post
        fields = ["id", "title", "body", "author_name", "created_at"]
```

`ModelSerializer` сам строит поля по модели и подтягивает её валидаторы. Но это удобство, а не магия: `source="author.get_full_name"` выравнивает связь в одно поле, `read_only_fields` защищает поля от записи, а `create()` и `update()` для нетривиальных случаев (вложенные объекты, несколько моделей) пишут вручную. Сериализатор отвечает за две стороны: `to_representation` (объект → JSON) и `to_internal_value` (JSON → данные, с валидацией).

## ViewSet: весь CRUD одним классом

`ModelViewSet` объединяет список, детальную страницу, создание, обновление и удаление.

```python
class PostViewSet(viewsets.ModelViewSet):
    queryset = Post.objects.select_related("author").all()
    serializer_class = PostSerializer
    permission_classes = [IsAuthenticatedOrReadOnly]
```

`queryset` обязательно пишите с `select_related`/`prefetch_related` — иначе каждая детальная страница или список даст N+1. `permission_classes` управляет доступом: здесь читать могут все, писать — только авторизованные.

## Роутер строит URL сам

Вместо десятка `path()` роутер генерирует маршруты под действия ViewSet:

```python
router = DefaultRouter()
router.register("posts", PostViewSet, basename="post")
urlpatterns = router.urls
```

Одна строка регистрации даёт `/posts/` (список и создание) и `/posts/<pk>/` (чтение, обновление, удаление).

## Пагинация и фильтры

Большие таблицы нельзя отдавать целиком. Пагинация режет ответ на страницы, фильтры — по параметрам запроса:

```python
REST_FRAMEWORK = {
    "DEFAULT_PAGINATION_CLASS": "rest_framework.pagination.PageNumberPagination",
    "PAGE_SIZE": 20,
    "DEFAULT_FILTER_BACKENDS": ["django_filters.rest_framework.DjangoFilterBackend"],
}
```

Во viewset добавляют `filterset_fields = ["author"]` — и клиент сможет запросить `/posts/?author=3`. Это тот же queryset, просто уточнённый до вычисления.

## Типовая ошибка

Относиться к сериализатору как к модели и ждать, что `ModelSerializer` проверит всё сам. Он наследует валидаторы полей, но бизнес-правила («нельзя публиковать пост без тега», «автор не может изменить чужой пост») нужно дописывать в `validate()` или в `create/update`. Вторая ловушка — `objects.all()` без пагинации и фильтрации: на большой таблице такой эндпоинт отдаст мегабайты JSON и положит базу. Третья — забыть `select_related` в `queryset`: browsable API выглядит нормально на пяти записях, а в проде сериализация каждого поста дёргает базу за автором.
