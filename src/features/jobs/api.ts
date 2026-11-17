import { z } from 'zod'

export type JobKind = 'photo' | 'video'
export type TimeOfDay = 'day' | 'dusk' | 'night'

const resultSchema = z.object({
  type: z.enum(['photo', 'video']),
  src: z.string(),
  download: z.string(),
  poster: z.string().optional(),
  label: z.string().optional(),
  width: z.number(),
  height: z.number(),
})

const jobSchema = z.object({
  id: z.string(),
  kind: z.enum(['photo', 'video']),
  target: z.string(),
  status: z.enum(['queued', 'running', 'done', 'failed', 'cancelled', 'expired']),
  done: z.number(),
  total: z.number(),
  position: z.number(),
  results: z.array(resultSchema),
  error: z.string().optional(),
  createdAt: z.number(),
  finishedAt: z.number().optional(),
})

const createdSchema = z.object({ id: z.string(), token: z.string(), position: z.number() })
const errorSchema = z.object({ error: z.string() })

export type Job = z.infer<typeof jobSchema>
export type JobResult = z.infer<typeof resultSchema>

export const finalStatuses: Job['status'][] = ['done', 'failed', 'cancelled', 'expired']

export const MAX_PHOTO_BYTES = 15 * 1024 * 1024
export const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp']

export class ApiError extends Error {}

/* ── Задачи этого устройства: id и токен доступа. Входа пока нет, токен — ключ к задаче. ── */

export interface LocalJob {
  id: string
  token: string
  kind: JobKind
  target: string
  createdAt: number
}

const storageKey = 'creator.jobs.v1'

export function localJobs(): LocalJob[] {
  try {
    const raw = window.localStorage.getItem(storageKey)
    const list = raw ? (JSON.parse(raw) as LocalJob[]) : []
    return Array.isArray(list) ? list : []
  } catch {
    return []
  }
}

function remember(job: LocalJob) {
  try {
    const list = [job, ...localJobs().filter((j) => j.id !== job.id)].slice(0, 50)
    window.localStorage.setItem(storageKey, JSON.stringify(list))
  } catch {
    // Хранилище недоступно (приватный режим): задача живёт, пока открыта вкладка.
  }
}

const memory = new Map<string, LocalJob>()

export function localJob(id: string): LocalJob | undefined {
  return memory.get(id) ?? localJobs().find((j) => j.id === id)
}

/* ── Запросы ── */

async function parse<T>(res: Response, schema: z.ZodType<T>): Promise<T> {
  let body: unknown
  try {
    body = await res.json()
  } catch {
    throw new ApiError('Сервер недоступен. Проверьте соединение и попробуйте ещё раз.')
  }
  if (!res.ok) {
    const parsed = errorSchema.safeParse(body)
    throw new ApiError(parsed.success ? parsed.data.error : 'Не удалось выполнить запрос')
  }
  const parsed = schema.safeParse(body)
  if (!parsed.success) throw new ApiError('Неожиданный ответ сервера')
  return parsed.data
}

export interface CreateJobInput {
  kind: JobKind
  target: string
  outfit: number
  time: TimeOfDay
  photos: File[]
}

export async function createJob(input: CreateJobInput): Promise<LocalJob & { position: number }> {
  const form = new FormData()
  form.append('kind', input.kind)
  form.append('target', input.target)
  form.append('outfit', String(input.outfit))
  form.append('time', input.time)
  form.append('consent', 'yes')
  for (const photo of input.photos) form.append('photos', photo, photo.name)
  let res: Response
  try {
    res = await fetch('/api/jobs', { method: 'POST', body: form })
  } catch {
    throw new ApiError('Нет соединения с сервером. Попробуйте ещё раз.')
  }
  const created = await parse(res, createdSchema)
  const job: LocalJob = {
    id: created.id,
    token: created.token,
    kind: input.kind,
    target: input.target,
    createdAt: Date.now(),
  }
  memory.set(job.id, job)
  remember(job)
  return { ...job, position: created.position }
}

export async function getJob(local: LocalJob): Promise<Job> {
  const res = await fetch(`/api/jobs/${local.id}`, {
    headers: { authorization: `Bearer ${local.token}` },
    cache: 'no-store',
  })
  return parse(res, jobSchema)
}

export async function cancelJob(local: LocalJob): Promise<Job> {
  const res = await fetch(`/api/jobs/${local.id}/cancel`, {
    method: 'POST',
    headers: { authorization: `Bearer ${local.token}` },
  })
  return parse(res, jobSchema)
}

/** Проверка файла до отправки: тип и размер. Сервер проверяет ещё раз по содержимому. */
export function checkPhoto(file: File): string | undefined {
  if (!PHOTO_TYPES.includes(file.type)) return `«${file.name}»: подходят JPEG, PNG и WebP`
  if (file.size > MAX_PHOTO_BYTES) return `«${file.name}»: больше 15 МБ`
  return undefined
}
