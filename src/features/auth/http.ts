import { z } from 'zod'

export class ApiError extends Error {
  readonly status: number
  constructor(message: string, status = 0) {
    super(message)
    this.status = status
  }
}

const errorSchema = z.object({ error: z.string() })

/** Запрос к своему API: cookie сессии уходит автоматически (тот же сайт). */
export async function apiFetch(path: string, init: RequestInit = {}) {
  try {
    return await fetch(path, { credentials: 'same-origin', ...init })
  } catch {
    throw new ApiError('Нет соединения с сервером. Попробуйте ещё раз.')
  }
}

export function jsonInit(method: string, body: unknown): RequestInit {
  return { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }
}

export async function parse<T>(res: Response, schema: z.ZodType<T>): Promise<T> {
  let body: unknown
  try {
    body = await res.json()
  } catch {
    throw new ApiError('Сервер недоступен. Попробуйте ещё раз.', res.status)
  }
  if (!res.ok) {
    const parsed = errorSchema.safeParse(body)
    throw new ApiError(
      parsed.success ? parsed.data.error : 'Не удалось выполнить запрос',
      res.status,
    )
  }
  const parsed = schema.safeParse(body)
  if (!parsed.success) throw new ApiError('Неожиданный ответ сервера', res.status)
  return parsed.data
}
