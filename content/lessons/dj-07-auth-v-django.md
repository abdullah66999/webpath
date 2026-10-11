## Встроенная аутентификация — батарея Django

Во Flask логин, сессии и права вы собираете из `flask-login` и своего кода. В Django аутентификация — встроенная батарея: модель `User`, сессии, хеширование паролей, права и группы уже готовы. Подключается строкой `django.contrib.auth` в `INSTALLED_APPS` (она там по умолчанию).

## Пароли: только хеш

Правило, которое нельзя нарушать: **никогда не присваивайте пароль напрямую**.

```python
user.password = "secret123"        # НЕЛЬЗЯ — в базу ляжет открытый текст
user = User.objects.create_user(username="anna", password="secret123")  # правильно
user.set_password("new_password")  # правильно для смены пароля
```

`create_user()` и `set_password()` пропускают пароль через хеш-функцию — по умолчанию PBKDF2 с солью, можно переключить на Argon2. В базе хранится не пароль, а его хеш; проверить совпадение могут `authenticate()` и `check_password()`, восстановить исходный пароль из хеша нельзя. Прямое присваивание — это дыра в безопасности: утечка базы выдаст все пароли.

## Логин и логаут

`authenticate()` проверяет логин и пароль, `login()` открывает сессию, `logout()` закрывает.

```python
user = authenticate(request, username=username, password=password)
if user is not None:
    login(request, user)
    return redirect("profile")
```

Порядок важен: сначала `authenticate`, и только при успешной проверке — `login`. Форма логина, как любая POST-форма, обязана содержать `{% csrf_token %}`.

## Права: login_required, permissions, groups

`@login_required` закрывает view от анонимов — перенаправляет на страницу входа, а в API отдаёт 401/403. Для классов есть `LoginRequiredMixin`.

```python
@login_required
def profile(request):
    return render(request, "accounts/profile.html")
```

Тонкие права строятся на **permissions** — разрешениях вида `posts.change_post`. Django создаёт их для каждой модели автоматически и проверяет через `user.has_perm("posts.change_post")`. **Groups** объединяют разрешения: пользователя добавляют в группу «редакторы», и он получает все её права разом. Для API в DRF этому соответствуют permission-классы `IsAuthenticated`, `IsAdminUser` и свои.

## Токены для API

Сессии работают через куки и браузер. Для API-клиентов (мобильное приложение, внешний сервис) используют токены: `TokenAuthentication` из DRF или JWT. Клиент передаёт токен в заголовке `Authorization`, сервер по нему определяет пользователя.

```python
class PostViewSet(viewsets.ModelViewSet):
    authentication_classes = [TokenAuthentication]
    permission_classes = [IsAuthenticated]
```

## Типовая ошибка

Проверять `if request.user.is_authenticated` вручную в каждой view вместо `@login_required` — легко забыть на одной странице и открыть личные данные. Вторая и самая опасная: `user.password = ...` вместо `set_password()`. Третья: писать свою модель пользователя с нуля, когда есть `AbstractUser` — потом переносить аутентификацию на кастомную модель больно, поэтому решение о ней принимают в начале проекта.
