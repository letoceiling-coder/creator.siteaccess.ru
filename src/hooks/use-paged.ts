import { useState } from 'react'

/** Постраничный показ: первые `size` элементов и «показать ещё». Сброс при смене списка. */
export function usePaged<T>(items: T[], size: number) {
  const [state, setState] = useState({ items, count: size })
  let count = state.count
  // Новый список (например, другая категория) — снова первая страница.
  if (state.items !== items) {
    count = size
    setState({ items, count })
  }
  return {
    visible: items.slice(0, count),
    left: Math.max(items.length - count, 0),
    total: items.length,
    more: () => setState((s) => ({ ...s, count: s.count + size })),
  }
}
