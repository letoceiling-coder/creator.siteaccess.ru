# AI Creative Studio

Инженерная основа фронтенда. В этой сборке есть оболочка маршрутов, дизайн-токены, стенд компонентов и проверки. Страниц сервиса, генерации и кабинета здесь нет.

## Требования

- Node.js 22.12 или новее. Проверено на Node.js 24.16.
- npm 11.

## Установка

```bash
npm install
npx playwright install chromium
```

Вторая команда нужна один раз, для e2e.

## Команды

| Команда                | Назначение                         |
| ---------------------- | ---------------------------------- |
| `npm run dev`          | Сервер разработки                  |
| `npm run build`        | Проверка типов и production-сборка |
| `npm run preview`      | Просмотр сборки                    |
| `npm run typecheck`    | TypeScript                         |
| `npm run lint`         | Oxlint                             |
| `npm run format`       | Записать форматирование Prettier   |
| `npm run format:check` | Проверить форматирование           |
| `npm run test`         | Unit и component-тесты             |
| `npm run test:e2e`     | Playwright                         |

## Куда смотреть

- `/` — оболочка браузера
- `/telegram` — предпросмотр Telegram без SDK
- `/max` — предпросмотр MAX без SDK
- `/dev/foundation` — стенд компонентов

Дальше: [ARCHITECTURE.md](ARCHITECTURE.md), [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md), [DEVELOPMENT.md](DEVELOPMENT.md), [TESTING.md](TESTING.md), [docs/SKILLS.md](docs/SKILLS.md).
