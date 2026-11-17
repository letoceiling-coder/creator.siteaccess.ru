---
name: motion-design
description: Задаёт появление, переходы, hover, модалки, меню, загрузку и микровзаимодействия в одной шкале длительности. Use when adding or changing animation, transitions, hover motion, modals, menus, galleries, or loading movement.
paths:
  - src/**/*.tsx
  - src/config/motion.ts
  - src/styles/**/*.css
---

# motion-design

## Назначение

Движение подтверждает действие и связывает состояния. Оно не развлекает и не двигает layout. Ощущение — спокойное и точное.

## Когда применять

Появление блока, смена маршрута, hover, карточка, модалка, меню, загрузка, тост, галерея, любое микровзаимодействие.

## Область

Одна шкала: `140ms` быстро, `220ms` основное, `360ms` медленно. Кривые: standard, enter, exit — в `src/config/motion.ts` и в CSS-переменных `--duration-*`, `--ease-*-value`. Библиотека движения по умолчанию — `motion/react`. CSS transition и keyframes — для состояний, которые не зависят от дерева React. GSAP не ставить, пока нет многошаговой сцены, которую CSS и Motion не собирают.

## Инструкции

1. Выбрать одну длительность по роли. Hover и цвет — fast. Появление панели и тоста — base. Крупное смещение раздела — slow. Не анимировать всё сразу.
2. Анимировать `opacity` и `transform`. Не анимировать `height`, `top`, `width`, `margin`, если без этого можно обойтись.
3. Для React-присутствия использовать `AnimatePresence` и `motion`, длительность брать из `motionTokens`, easing копировать массивом `[...motionTokens.ease.enter]`.
4. Если `useReducedMotion()` истинен, ставить `duration: 0` и `initial={false}`. Глобальный CSS уже гасит transition и animation при `prefers-reduced-motion`.
5. Модалке хватает keyframes `studio-rise` на `.studio-dialog`. Второй слой Motion поверх dialog не добавлять.
6. Жест и клик не ждут конца анимации: кнопка остаётся активной, закрытие не блокируется анимацией.
7. Появление списка — короткий stagger (около 60ms), не каскад на всю страницу.
8. Галерея сменяет кадр opacity/transform и держит размер контейнера, чтобы сетка не прыгала.

## Правила

- В проекте одна библиотека движения: Motion. Не добавлять Framer Motion отдельным пакетом, anime.js или auto-animate «рядом».
- Hover меняет цвет, прозрачность или сдвиг не больше 4–8px. Не увеличивать карточку так, чтобы она наезжала на соседнюю.
- Спиннер имеет `motion-reduce:animate-none` и текстовый статус.
- Бесконечные декоративные циклы не использовать.

## Запрещено

- Анимация width/height/top/left как основной приём.
- Одинаковая анимация на каждом диве.
- Движение, которое перекрывает курсор или перехватывает жест.
- Игнорирование `prefers-reduced-motion`.
- Две библиотеки на одну задачу.

## Критерии качества

- На слабом телефоне нет дрожания и пропущенных кадров у обычного перехода.
- При reduced motion интерфейс появляется сразу и остаётся понятным.
- Длительности совпадают с токенами. Тест `src/styles/tokens.test.ts` это стережёт.

## Пример

```tsx
const reduceMotion = useReducedMotion()

<motion.div
  initial={reduceMotion ? false : { opacity: 0, y: 8 }}
  animate={{ opacity: 1, y: 0 }}
  transition={{
    duration: reduceMotion ? 0 : motionTokens.duration.base,
    ease: [...motionTokens.ease.enter],
  }}
/>
```

## Чек-лист

- [ ] Длительность и easing взяты из токенов.
- [ ] Двигаются только transform и opacity, кроме редкого обоснованного исключения.
- [ ] Reduced motion отключает сдвиг и задержку.
- [ ] Действие пользователя не ждёт конца ролика.
- [ ] Новая библиотека анимации не добавлена без невозможности решить задачу Motion или CSS.
