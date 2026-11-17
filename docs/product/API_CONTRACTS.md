# Контракты API

Все пути ниже — предложение нового API продукта. Ни один не существует в текущем репозитории и не подтверждён как внешний контракт генерационного хоста.

Статусы маркировки:

- `CONFIRMED` — есть и проверен.
- `PROPOSED` — предлагается создать.
- `UNKNOWN` — по аудиту нельзя утверждать.

Подтверждённых endpoint'ов продукта: нет.

Внутренние вызовы хоста, которые аудит видел, но которые этот API не публикует: ComfyUI `POST /free` на localhost, Ollama `keep_alive: 0`, Chatterbox `POST /unload`. Полный контракт постановки графа в ComfyUI — `UNKNOWN`.

Общие правила предложения:

- База `/api/v1`.
- Авторизация — httpOnly-сессия после входа. Заголовок `Authorization` не является текущим механизмом.
- Тела JSON, кроме загрузки файла.
- Ошибки: `400` проверка, `401` нет сессии, `403` чужой ресурс, `404` нет объекта, `409` конфликт состояния, `413` файл больше лимита, `429` слишком много подтверждений, `503` брокер или API недоступны. Занятая видеокарта очередь не отклоняет: подтверждение отвечает `202`, задача остаётся в `queued`.
- Форма ошибки: `{ "error": { "code": "string", "message": "string" } }`. Сообщение можно показать человеку.
- Подтверждение генерации требует заголовок `Idempotency-Key`.

Схемы ниже — будущие контракты Zod. В код они этой фазой не добавляются.

## Authentication

Все `PROPOSED`.

### `POST /api/v1/auth/register`

Создаёт пользователя.

Запрос: `{ "email": "string", "password": "string", "displayName": "string" }`. Способ входа ещё не утверждён, email здесь — заглушка контракта, не решение.

Ответ `201`: `{ "user": { "id": "uuid", "displayName": "string" } }`.

Ошибки: `400`, `409` если идентификатор занят.

### `POST /api/v1/auth/login`

Запрос: `{ "email": "string", "password": "string" }`.

Ответ `200`: пользователь и сессионная cookie.

Ошибки: `401`.

### `POST /api/v1/auth/logout`

Ответ `204`.

### `POST /api/v1/auth/telegram`

Запрос: `{ "initData": "string" }`. Сервер проверяет подпись. Клиентский факт наличия строки ничего не доказывает.

Ответ `200` и сессия, либо `401`.

### `POST /api/v1/auth/max`

Та же схема, отдельная проверка подписи MAX. Алгоритм подписи MAX — `UNKNOWN`.

## User Profile

Все `PROPOSED`.

### `GET /api/v1/me`

Ответ: `User` и `UserProfile` без секретов.

### `PATCH /api/v1/me`

Запрос: `{ "displayName": "string" }`, длина от 2 до 80.

Ответ: обновлённый профиль.

## Media Upload

Все `PROPOSED`.

### `POST /api/v1/media`

`multipart/form-data`, поле `file`. Сессия обязательна.

Ответ `201`: `{ "id": "uuid", "mimeType": "string", "width": "number", "height": "number", "byteSize": "number" }`.

Ошибки: `400` тип, `413` размер. Лимиты 15 МБ и 4096 px — предлагаемая политика, не измеренный лимит хоста.

### `GET /api/v1/media/:mediaId`

Только владелец. Тело — файл. `Cache-Control: private`.

### `DELETE /api/v1/media/:mediaId`

Ответ `204`, если файл не привязан к незавершённой задаче. Иначе `409`.

## Photo Sessions

Чтение каталога может быть без сессии. Запись каталога в этот контракт не входит: сценарии правит не клиент.

Все `PROPOSED`.

### `GET /api/v1/photo-sessions`

Запрос query: `category`, `cursor`, `limit` до 24.

Ответ: `{ "items": [PhotoSessionCard], "nextCursor": "string | null" }`.

Карточка не содержит промпт.

### `GET /api/v1/photo-sessions/:slug`

Ответ: карточка плюс примеры, требования, разрешённые поля образа, число кадров, оценка секунд, `creditCost` или `null`, если тариф не утверждён.

## Video Scenarios

Все `PROPOSED`. В MVP создание задачи с этим типом отвечает `409` с кодом `video_not_enabled`.

### `GET /api/v1/video-scenarios`

Как каталог фото.

### `GET /api/v1/video-scenarios/:slug`

Карточка, сцены для раскадровки без промптов, длительность, число сцен, требования, `creditCost` или `null`.

## Generation Jobs

Все `PROPOSED`.

### `POST /api/v1/jobs`

Создаёт `draft`.

Запрос:

```json
{
  "kind": "photo_session",
  "templateSlug": "string"
}
```

`kind` в MVP принимает только `photo_session`.

Ответ `201`: `{ "job": { "id": "uuid", "status": "draft" } }`.

### `PUT /api/v1/jobs/:jobId/inputs`

Только из `draft`.

Запрос: `{ "mediaIds": ["uuid"], "look": { "clothing": "string", "timeOfDay": "string", "note": "string" } }`.

`look` сверяется со схемой сценария. Чужое поле — `400`.

Ответ: задание.

### `POST /api/v1/jobs/:jobId/confirm`

Заголовок `Idempotency-Key`. Переводит `draft` в `pending`, затем брокер сам двигает статус.

Ответ `202`: задание. Повтор с тем же ключом возвращает то же тело и не создаёт вторую задачу.

Ошибки: `409` если статус уже не черновик и ключ другой, `400` если фото не проходят правила сценария.

### `GET /api/v1/jobs/:jobId`

Владелец. Ответ включает статус, оценку очереди если она известна, и ссылки на результаты только при `completed`.

Неизвестная оценка — `null`, не выдуманные минуты.

### `POST /api/v1/jobs/:jobId/cancel`

Из `pending` и `queued` переводит в `cancelled`. Из `processing` в MVP отвечает `409`.

### `GET /api/v1/jobs`

История владельца. Query: `cursor`, `status`.

## Generation Results

Все `PROPOSED`.

### `GET /api/v1/jobs/:jobId/results/:resultId`

Файл владельца. Повторная загрузка не запускает генерацию.

### `GET /api/v1/jobs/:jobId/archive`

ZIP готовых файлов. Собирается из уже лежащих объектов.

## User Projects

`PROPOSED`, не MVP.

### `GET /api/v1/projects`

### `POST /api/v1/projects`

### `POST /api/v1/projects/:projectId/items`

Проект собирает уже готовые задачи. Сам по себе GPU не занимает.

## Credits / Billing

`PROPOSED` и выключен, пока нет утверждённой цены. До этого поля стоимости в ответах каталога — `null`, а confirm не списывает кредиты.

Будущие пути, без реализации:

- `GET /api/v1/credits`
- `GET /api/v1/credits/transactions`
- `POST /api/v1/credits/checkout`

Платёжный провайдер — `UNKNOWN`. Суммы в контракт не ставятся.
