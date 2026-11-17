# Модель данных

База и миграции этой фазой не создаются. Типы ниже — логическая модель для будущего сервера и Zod-контрактов. Идентификаторы UUID. Время — ISO-8601 в UTC.

Обязательность: MVP или позже.

## User

MVP. Учётная запись.

| Поле | Тип | Ограничение |
| --- | --- | --- |
| `id` | uuid | первичный ключ |
| `status` | `active` \| `disabled` | по умолчанию `active` |
| `createdAt` | datetime | |

Связи: один `UserProfile`, много медиа, задач, избранного, уведомлений.

Пароль и хэш в эту сущность не входят отдельным полем документации: хранение секрета описывает `SECURITY_AND_STORAGE.md`. В ответах API секрета нет.

## UserProfile

MVP.

| Поле | Тип | Ограничение |
| --- | --- | --- |
| `userId` | uuid | один к одному |
| `displayName` | string | 2–80 |
| `locale` | string | пока только `ru` |
| `theme` | `light` \| `dark` | совпадает с клиентской темой, не источник истины для чужих устройств |

## UserMedia

MVP для файлов конкретной задачи. Библиотека всех загрузок в кабинете — позже.

| Поле | Тип | Ограничение |
| --- | --- | --- |
| `id` | uuid | |
| `userId` | uuid | владелец |
| `role` | `source` \| `example` | пример сценария не принадлежит пользователю |
| `mimeType` | string | jpeg, png, webp для исходника |
| `byteSize` | integer | |
| `width` | integer | |
| `height` | integer | |
| `storageKey` | string | внутренний ключ, клиенту не как публичный URL |
| `createdAt` | datetime | |

Чужой `userId` файл не читает.

## PhotoSession

MVP. Шаблон, не работа пользователя.

| Поле | Тип | Ограничение |
| --- | --- | --- |
| `id` | uuid | |
| `slug` | string | уникальный |
| `title` | string | |
| `category` | string | код из карты |
| `summary` | string | текст человеку |
| `styleLabel` | string | |
| `outputCount` | integer | больше 0 |
| `aspectRatio` | string | например `3:4` |
| `clothingNote` | string | |
| `sourceRequirements` | string | |
| `likenessNote` | string | без обещания 100% |
| `estimatedSeconds` | integer \| null | оценка, может быть пустой пока нет замера |
| `creditCost` | integer \| null | null, пока тариф не утверждён |
| `lookSchema` | json | какие поля образа разрешены |
| `hiddenBrief` | string | серверный текст графа, в API нет |
| `published` | boolean | |

Связи: примеры `UserMedia` роли `example`, задачи ссылаются на `slug` или `id`.

## VideoScenario

Позже для запуска, в модели сразу.

Те же смысловые поля, плюс `durationSeconds`, `sceneCount`, `previewMediaId`. `hiddenBrief` по сценам, не одним промптом на весь фильм.

## ScenarioScene

Позже для запуска, в модели сразу.

| Поле | Тип | Ограничение |
| --- | --- | --- |
| `id` | uuid | |
| `scenarioId` | uuid | |
| `order` | integer | с 1, уникален внутри сценария |
| `title` | string | видно человеку |
| `cameraNote` | string | видно человеку |
| `hiddenBrief` | string | только сервер |

## GenerationJob

MVP.

| Поле | Тип | Ограничение |
| --- | --- | --- |
| `id` | uuid | |
| `userId` | uuid | |
| `kind` | enum типов работ | в MVP только `photo_session` |
| `templateId` | uuid | фото или видео шаблон |
| `status` | статус из архитектуры генерации | |
| `look` | json | проверен `lookSchema` |
| `idempotencyKey` | string | уникален вместе с `userId` |
| `attempt` | integer | 0 или 1 |
| `failureCode` | string \| null | безопасный код |
| `queuedAt` | datetime \| null | |
| `startedAt` | datetime \| null | |
| `finishedAt` | datetime \| null | |
| `estimatedSeconds` | integer \| null | копируется на момент подтверждения |

Связи: входы `GenerationInput`, выходы `GenerationResult`.

## GenerationInput

MVP.

| Поле | Тип | Ограничение |
| --- | --- | --- |
| `jobId` | uuid | |
| `mediaId` | uuid | исходник этого пользователя |
| `order` | integer | |

Число входов проверяется шаблоном. Для фото MVP от 1 до 3.

## GenerationResult

MVP.

| Поле | Тип | Ограничение |
| --- | --- | --- |
| `id` | uuid | |
| `jobId` | uuid | |
| `mediaId` | uuid | итоговый файл |
| `thumbMediaId` | uuid \| null | |
| `order` | integer | |
| `kind` | `image` \| `video` \| `collage` | в MVP `image` |

## UserProject

Позже. Папка человека поверх готовых задач: `id`, `userId`, `title`, связь на задачи. GPU не занимает.

## Favorite

Позже. `userId`, `templateKind`, `templateId`. Уникальная пара.

## Notification

Позже. `userId`, `jobId`, `kind` (`job_completed`, `job_failed`), `readAt`. В MVP человек узнаёт статус, открыв задачу. Push платформ не обещается.

## CreditTransaction

Позже и только после тарифа. `userId`, `jobId` или null, `amount` целым числом кредитов, `reason` (`hold`, `capture`, `release`, `adjustment`). Деньги платёжной системы здесь не хранятся. Цена кредита не задаётся.

Пока сущности нет, подтверждение задачи кредиты не списывает.
