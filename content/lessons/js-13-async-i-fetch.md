## Один поток и очередь задач

JavaScript выполняет код в **одном потоке**: есть стек вызовов (call stack), и в один момент там одна функция. Всё, что требует ожидания — сеть, таймер, клик, — не блокирует стек, а регистрирует задачу в очереди.

**Цикл событий** (event loop) работает так: как только стек пустеет, движок сначала забирает все **микрозадачи** (microtasks) — это обратные вызовы промисов, — и только потом одну **макрозадачу** (macrotask): таймер, событие, ответ сети.

```js
console.log('1');
setTimeout(() => console.log('2'), 0);
Promise.resolve().then(() => console.log('3'));
console.log('4');
// в консоли: 1 4 3 2
```

Задержка `0` не значит «сейчас»: таймер всё равно ждёт, пока стек опустеет и пока отработают все микрозадачи. Порядок всегда один — синхронный код, потом промисы, потом таймеры и события.

## Promise

**Промис** (Promise) — объект, который обещает значение позже. У него три состояния: `pending` (ожидание), `fulfilled` (успех) и `rejected` (ошибка). Перейти из успеха в ошибку или обратно нельзя.

```js
const loadUser = new Promise(function (resolve, reject) {
  setTimeout(function () {
    const user = { id: 7, name: 'Аня' };
    if (user.name) resolve(user);
    else reject(new Error('пользователь не найден'));
  }, 600);
});

loadUser
  .then(user => user.name)
  .then(name => console.log(name))
  .catch(error => console.log('Ошибка: ' + error.message));
```

`then` возвращает новый промис, поэтому вызовы складываются в цепочку. `catch` ловит ошибку из любого звена, включая ошибку внутри самого `then`.

## async и await

Синтаксис `async`/`await` — это те же промисы, но записанные как обычный последовательный код. Функция с `async` **всегда** возвращает промис, а `await` приостанавливает только её саму, не весь поток.

```js
async function renderUser(id) {
  const out = document.querySelector('#out');
  try {
    const response = await fetch('/api/users/' + id);
    if (!response.ok) throw new Error('сервер ответил ' + response.status);
    const user = await response.json();
    out.textContent = user.name;
  } catch (error) {
    out.textContent = 'Не загрузилось: ' + error.message;
  }
}
```

Без `try/catch` любая ошибка сети превращается в необработанное отклонение промиса (unhandled rejection): в консоли красный текст, а интерфейс навсегда остаётся в состоянии «загрузка». Пользователь не понимает, что произошло, и ждёт. `try/catch` в асинхронной функции — не украшение, а обязательная часть.

## fetch и три вида неудачи

`fetch(url)` возвращает промис с объектом `Response`. Неудачи бывают трёх разных видов, и ловить их надо по-разному:

- **Нет связи, DNS, блокировка CORS.** Промис отклоняется с `TypeError: Failed to fetch`.
- **Сервер ответил 404 или 500.** Промис **разрешается**: для `fetch` это нормальный ответ. Флаг `response.ok` равен `false`, `response.status` — 404.
- **Тело не читается.** `response.json()` тоже возвращает промис и может отклониться, если вместо JSON пришёл HTML страницы ошибки.

Именно поэтому в коде выше стоит `if (!response.ok) throw new Error('сервер ответил ' + response.status)` — эта строка превращает второй случай в отклонение промиса, и все три попадают в один `catch`.

Запрос с телом выглядит так:

```js
const response = await fetch('/api/orders', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ item: 'Кофе', qty: 2 })
});
```

## Типичные ошибки

- `async`-функция без `try/catch` — ошибка уходит в консоль, интерфейс зависает.
- Ожидание, что 404 отклонит промис: не отклонит, проверяйте `response.ok`.
- Забыли `await response.json()` и работаете с объектом `Response` как с данными.
- `await` внутри цикла для независимых запросов: сто запросов идут по очереди. Используйте `Promise.all`.
- Данные пришли, а элемента на странице уже нет: `out.textContent` падает с ошибкой про `null`.
