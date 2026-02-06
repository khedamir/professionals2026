# Бэкенд для сервиса интерактивных досок

Этот проект реализует бэкенд (REST API + WebSocket) для одностраничного веб‑приложения по созданию и совместному редактированию интерактивных досок.

Документация предназначена для конкурсантов, разрабатывающих фронтенд.

---

## 1. Общая информация

- **Стек бэкенда**: Node.js, TypeScript, Express, WebSocket (`ws`), JWT, `bcryptjs`.
- **Базовый URL REST API**: `{{host}}/api`
- **WebSocket**: `ws://{{host}}/ws/board`
- **Формат данных**: JSON.
- **Авторизация**: JWT-токен в заголовке `Authorization: Bearer <token>`.
- **ClientId**: во всех запросах нужно передавать заголовок `ClientId`, равный вашему логину.

Пример общих заголовков:

```http
GET /api/boards HTTP/1.1
Host: {{host}}
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6...
ClientId: my-login
Content-Type: application/json
```

---

## 2. Авторизация и регистрация

### 2.1. Регистрация

**URL**: `POST /api/auth/register`

**Тело запроса**:

```json
{
  "email": "user@example.com",
  "name": "Alice",
  "password": "P@ssw0rd!"
}
```

**Правила валидации**:

- `email` — валидный адрес электронной почты.
- `name` — только латинские буквы (`[a-zA-Z]+`).
- `password` — минимум 8 символов, должна содержать:
  - хотя бы одну цифру;
  - хотя бы один спецсимвол (`!@#$%^&*(),.?":{}|<>` и т.п.).

**Успешный ответ (201)**:

```json
{
  "id": "<userId>",
  "email": "user@example.com",
  "name": "Alice"
}
```

**Ошибка валидации (400)**:

```json
{
  "errors": {
    "email": "Некорректный email",
    "name": "Имя должно содержать только латинские буквы",
    "password": "Пароль от 8 символов, с цифрами и спецсимволами"
  }
}
```

После успешной регистрации на фронтенде пользователя нужно перенаправить на страницу авторизации.

---

### 2.2. Авторизация (логин)

**URL**: `POST /api/auth/login`

**Тело запроса**:

```json
{
  "email": "user@example.com",
  "password": "P@ssw0rd!"
}
```

**Успешный ответ (200)**:

```json
{
  "token": "<JWT>"
}
```

Полученный токен необходимо:

- сохранить на клиенте (например, в `localStorage`);
- передавать в заголовке `Authorization: Bearer <token>` при всех дальнейших запросах.

**Ошибка авторизации (401)**:

```json
{
  "errors": {
    "common": "Неверный email или пароль"
  }
}
```

После успешного логина пользователя следует перенаправить на страницу списка публичных досок.

---

## 3. Управление досками (закрытая часть API)

Все эндпоинты этого раздела требуют:

- заголовок `Authorization: Bearer <token>`;
- заголовок `ClientId: <Ваш_логин>`.

### 3.1. Список досок, доступных на редактирование

**URL**: `GET /api/boards`

Возвращает все доски, к которым у текущего пользователя есть право редактирования (включая свои).

**Пример ответа (200)**:

```json
[
  {
    "id": "<boardId>",
    "title": "My Board",
    "ownerId": "<ownerId>",
    "isPublic": true,
    "publicHash": "abcd1234...",
    "likesCount": 3,
    "updatedAt": "2026-02-05T12:34:56.000Z"
  }
]
```

---

### 3.2. Создать новую доску

**URL**: `POST /api/boards`

**Тело запроса**:

```json
{
  "title": "My new board"
}
```

**Успешный ответ (201)** — полный объект доски:

```json
{
  "id": "<boardId>",
  "title": "My new board",
  "ownerId": "<userId>",
  "isPublic": false,
  "publicHash": null,
  "createdAt": "2026-02-05T12:34:56.000Z",
  "updatedAt": "2026-02-05T12:34:56.000Z",
  "canvasWidth": 1600,
  "canvasHeight": 900,
  "objects": [],
  "accessList": [
    {
      "userId": "<userId>",
      "canEdit": true
    }
  ],
  "likes": [],
  "locks": []
}
```

**Ошибка (400)**:

```json
{
  "errors": {
    "title": "Название обязательно"
  }
}
```

---

### 3.3. Предоставить доступ к доске по email

**URL**: `POST /api/boards/:id/share`

- Доступно только владельцу доски.
- Предоставляет другому пользователю право редактирования по его email.

**Тело запроса**:

```json
{
  "email": "other@example.com"
}
```

**Успешный ответ (200)** — обновлённая доска (включая список доступов):

```json
{
  "id": "<boardId>",
  "title": "My Board",
  "ownerId": "<ownerId>",
  "accessList": [
    { "userId": "<ownerId>", "canEdit": true },
    { "userId": "<otherUserId>", "canEdit": true }
  ],
  "...": "прочие поля доски"
}
```

**Ошибки**:

- `404` — доска не найдена;
- `403` — текущий пользователь не владелец доски;
- `400`:

  ```json
  {
    "errors": {
      "email": "Email обязателен"
    }
  }
  ```

  или

  ```json
  {
    "errors": {
      "email": "Пользователь с таким email не найден"
    }
  }
  ```

---

### 3.4. Сделать доску публичной (генерация hash)

**URL**: `POST /api/boards/:id/public`

- Доступно только владельцу доски.
- Делает доску публичной и генерирует публичный `hash`, если он ещё не был создан.

**Успешный ответ (200)**:

```json
{
  "id": "<boardId>",
  "isPublic": true,
  "publicHash": "<hash>"
}
```

**Ошибки**:

- `404` — доска не найдена;
- `403` — недостаточно прав.

---

### 3.5. Поставить лайк доске

**URL**: `POST /api/boards/:id/like`

- Пользователь может поставить лайк публичной доске один раз.

**Успешный ответ (200)**:

```json
{
  "likesCount": 10
}
```

**Ошибки**:

- `404` — доска не найдена;
- `400` — доска не является публичной.

---

### 3.6. Получить состояние доски для редактирования

**URL**: `GET /api/boards/:id/state`

- Доступно только пользователям с правом редактирования.
- Возвращает размеры холста, объекты на доске и текущие блокировки.

**Успешный ответ (200)**:

```json
{
  "id": "<boardId>",
  "canvasWidth": 1600,
  "canvasHeight": 900,
  "objects": [
    {
      "id": "obj1",
      "type": "text",
      "x": 100,
      "y": 100,
      "rotation": 0,
      "width": 200,
      "height": 50,
      "text": "Hello"
    }
  ],
  "locks": [
    {
      "objectId": "obj1",
      "userId": "<userId>",
      "userName": "Alice",
      "lockedAt": "2026-02-05T12:35:00.000Z"
    }
  ]
}
```

**Ошибки**:

- `404` — доска не найдена;
- `403` — нет прав на редактирование.

---

## 4. Публичные доски (открытая часть API)

### 4.1. Список публичных досок

**URL**: `GET /api/boards/public`

Параметры:

- `orderByLikes=desc` — сортировать по количеству лайков по убыванию.

**Ответ (200)**:

```json
[
  {
    "id": "<boardId>",
    "title": "Public board",
    "ownerId": "<ownerId>",
    "publicHash": "<hash>",
    "likesCount": 5,
    "updatedAt": "2026-02-05T12:34:56.000Z"
  }
]
```

Используйте этот эндпоинт для:

- страницы списка публичных досок;
- фильтрации по количеству лайков.

---

### 4.2. Просмотр публичной доски по hash (без авторизации)

**URL**: `GET /api/board_hash/:hash`

- Доступно без токена (гостям).
- Возвращает состояние публичной доски по `hash`.

**Ответ (200)**:

```json
{
  "id": "<boardId>",
  "hash": "<hash>",
  "title": "Public board",
  "canvasWidth": 1600,
  "canvasHeight": 900,
  "objects": [ /* объекты на холсте */ ],
  "locks": [ /* текущие блокировки */ ]
}
```

**Ошибка (404)**:

```json
{
  "error": "Публичная доска не найдена"
}
```

Этот эндпоинт удобно использовать для маршрута вида `/board/{hash}` без авторизации.

---

## 5. Модель объектов на доске

Размер холста для каждой доски фиксирован:

- `canvasWidth = 1600`
- `canvasHeight = 900`

Все объекты должны находиться **внутри этих границ**. Сервер при сохранении дополнительно ограничивает координаты/размеры, чтобы объект не выходил за холст.

### 5.1. Общие поля объекта

```json
{
  "id": "obj1",
  "type": "text | image | rect | circle | line",
  "x": 100,
  "y": 100,
  "rotation": 0,
  "width": 200,
  "height": 50
}
```

### 5.2. Текстовый объект (`type = "text"`)

```json
{
  "id": "obj1",
  "type": "text",
  "x": 100,
  "y": 100,
  "rotation": 0,
  "width": 200,
  "height": 50,
  "text": "Hello"
}
```

### 5.3. Изображение (`type = "image"`)

```json
{
  "id": "img1",
  "type": "image",
  "x": 200,
  "y": 200,
  "rotation": 0,
  "width": 300,
  "height": 200,
  "url": "https://example.com/image.png"
}
```

Клиент должен сохранять пропорции изображения при масштабировании. Сервер гарантирует, что изображение не выйдет за пределы холста.

### 5.4. Фигуры (`rect | circle | line`)

```json
{
  "id": "shape1",
  "type": "rect",
  "x": 300,
  "y": 300,
  "rotation": 0,
  "width": 100,
  "height": 50,
  "color": "#ff0000"
}
```

---

## 6. WebSocket API (совместное редактирование в реальном времени)

**URL WebSocket**: `ws://{{host}}/ws/board`

### 6.1. Режимы подключения

1. **Редактирование (авторизованный пользователь)**:

   ```text
   ws://{{host}}/ws/board?boardId=<boardId>&token=<JWT>
   ```

   Условия:

   - `token` — валидный JWT;
   - у пользователя есть право редактирования доски `boardId`.

2. **Публичный просмотр (гость)**:

   ```text
   ws://{{host}}/ws/board?hash=<publicHash>
   ```

   - Авторизация не требуется;
   - редактирование запрещено, можно только получать события.

### 6.2. Сообщение при подключении

Сразу после успешного подключения сервер отправляет полное состояние доски:

```json
{
  "type": "full_state",
  "boardId": "<boardId>",
  "canvasWidth": 1600,
  "canvasHeight": 900,
  "objects": [ /* все объекты */ ],
  "locks": [
    {
      "objectId": "obj1",
      "userId": "<userId>",
      "userName": "Alice",
      "lockedAt": "2026-02-05T12:35:00.000Z"
    }
  ]
}
```

Тип события: `"full_state"`.

---

### 6.3. Входящие события (от клиента к серверу)

Все события — JSON-объекты с полем `type`.

#### 6.3.1. Установить фокус на объект

```json
{
  "type": "focus_object",
  "objectId": "obj1"
}
```

- Клиент просит взять объект в фокус (начать редактирование).
- Сервер:
  - создаёт блокировку, если объект ещё не заблокирован другим пользователем;
  - при успехе рассылает всем клиентам:

    ```json
    {
      "type": "focus_object",
      "objectId": "obj1"
    }
    ```

Информацию о том, **кто** редактирует объект, фронтенд берёт из массива `locks`.

---

#### 6.3.2. Снять фокус с объекта

```json
{
  "type": "blur_object",
  "objectId": "obj1"
}
```

- Клиент завершает редактирование объекта.
- Сервер снимает блокировку (если она принадлежит этому пользователю) и рассылает всем:

```json
{
  "type": "blur_object",
  "objectId": "obj1"
}
```

Изменения самого объекта (позиция, размеры, текст) обычно отправляются в виде отдельного события `update_object` до или после снятия фокуса — в зависимости от вашей UI-логики.

---

#### 6.3.3. Добавить объект

```json
{
  "type": "add_object",
  "object": { /* полный объект BoardObject */ }
}
```

Пример:

```json
{
  "type": "add_object",
  "object": {
    "id": "obj1",
    "type": "rect",
    "x": 100,
    "y": 200,
    "rotation": 0,
    "width": 200,
    "height": 100,
    "color": "#ff0000"
  }
}
```

- Сервер:
  - нормализует координаты и размеры объекта в пределах холста `1600x900`;
  - сохраняет объект;
  - рассылает всем клиентам:

```json
{
  "type": "add_object",
  "object": { /* сохранённый объект */ }
}
```

---

#### 6.3.4. Обновить объект

```json
{
  "type": "update_object",
  "object": { /* полный объект BoardObject */ }
}
```

Пример:

```json
{
  "type": "update_object",
  "object": {
    "id": "obj1",
    "type": "text",
    "x": 120,
    "y": 110,
    "rotation": 15,
    "width": 220,
    "height": 60,
    "text": "New text"
  }
}
```

- Сервер обновляет объект (также ограничивает координаты и размеры в пределах холста) и рассылает всем:

```json
{
  "type": "update_object",
  "object": { /* обновлённые данные */ }
}
```

---

#### 6.3.5. Удалить объект

```json
{
  "type": "delete_object",
  "objectId": "obj1"
}
```

- Сервер удаляет объект и связанные с ним блокировки и рассылает:

```json
{
  "type": "delete_object",
  "objectId": "obj1"
}
```

---

### 6.4. Исходящие события (от сервера к клиентам)

Сервер может отправлять следующие типы событий:

- `full_state` — полный снимок состояния доски (при подключении);
- `focus_object` — объект взят в фокус;
- `blur_object` — фокус снят;
- `add_object` — добавлен новый объект;
- `update_object` — объект обновлён;
- `delete_object` — объект удалён.

Все клиенты, подключённые к одной и той же доске (через `boardId` или `hash`), получают одинаковые обновления.

---

## 7. Примеры использования на фронтенде

### 7.1. Пример: логин и получение списка публичных досок (fetch)

```ts
const baseUrl = '{{host}}/api';

async function login(email: string, password: string) {
  const res = await fetch(`${baseUrl}/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ClientId: 'my-login'
    },
    body: JSON.stringify({ email, password })
  });

  const data = await res.json();
  if (!res.ok) throw data;
  localStorage.setItem('token', data.token);
}

async function fetchPublicBoards() {
  const token = localStorage.getItem('token');
  const res = await fetch(`${baseUrl}/boards/public?orderByLikes=desc`, {
    headers: {
      'Content-Type': 'application/json',
      ClientId: 'my-login',
      Authorization: `Bearer ${token}`
    }
  });
  return res.json();
}
```

---

### 7.2. Пример: подключение к WebSocket и фокус объекта

```ts
const token = localStorage.getItem('token');
const boardId = '<boardId>';

const ws = new WebSocket(
  `ws://{{host}}/ws/board?boardId=${boardId}&token=${token}`
);

ws.onopen = () => {
  console.log('WS connected');
};

ws.onmessage = (event) => {
  const msg = JSON.parse(event.data);
  switch (msg.type) {
    case 'full_state':
      // отрисовать все объекты и блокировки
      break;
    case 'add_object':
      // добавить объект в локальное состояние
      break;
    case 'update_object':
      // обновить объект
      break;
    case 'focus_object':
      // пометить объект как находящийся в фокусе
      break;
    case 'blur_object':
      // снять визуальное выделение фокуса
      break;
  }
};

// Взять объект в фокус
function focusObject(objectId: string) {
  ws.send(
    JSON.stringify({
      type: 'focus_object',
      objectId
    })
  );
}
```

---

## 8. Итоги

Данный бэкенд предоставляет:

- полную поддержку регистрации и авторизации с JWT;
- управление досками, шаринг по email, публичные ссылки и лайки;
- REST-эндпоинты для получения состояния досок;
- WebSocket-интерфейс для совместного редактирования в реальном времени.

Этого достаточно, чтобы реализовать требуемое SPA (на React/Vue) согласно условиям конкурсного задания.

