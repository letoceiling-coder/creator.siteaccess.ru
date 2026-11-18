import { z } from 'zod'
import { ApiError, apiFetch, parse } from '@/features/auth/http.ts'

export { ApiError }

export type JobKind = 'photo' | 'video' | 'animate'
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
  kind: z.enum(['photo', 'video', 'animate']),
  target: z.string(),
  status: z.enum(['queued', 'running', 'done', 'failed', 'cancelled', 'expired']),
  done: z.number(),
  total: z.number(),
  position: z.number(),
  results: z.array(resultSchema),
  error: z.string().optional(),
  cost: z.number().optional(),
  refunded: z.boolean().optional(),
  createdAt: z.number(),
  finishedAt: z.number().optional(),
})

const createdSchema = z.object({ id: z.string(), position: z.number(), cost: z.number() })

export type Job = z.infer<typeof jobSchema>
export type JobResult = z.infer<typeof resultSchema>

export const finalStatuses: Job['status'][] = ['done', 'failed', 'cancelled', 'expired']

export const MAX_PHOTO_BYTES = 15 * 1024 * 1024
export const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp']

export interface CreateJobInput {
  kind: JobKind
  target: string
  outfit: number
  time: TimeOfDay
  /** Только для «оживления»: 5 или 10 секунд. */
  duration?: 5 | 10
  photos: File[]
}

/** Задача создаётся от имени вошедшего пользователя; токены списываются на сервере. */
export async function createJob(input: CreateJobInput) {
  const form = new FormData()
  form.append('kind', input.kind)
  form.append('target', input.target)
  form.append('outfit', String(input.outfit))
  form.append('time', input.time)
  if (input.duration) form.append('duration', String(input.duration))
  form.append('consent', 'yes')
  for (const photo of input.photos) form.append('photos', photo, photo.name)
  return parse(await apiFetch('/api/jobs', { method: 'POST', body: form }), createdSchema)
}

export async function getJob(id: string): Promise<Job> {
  return parse(await apiFetch(`/api/jobs/${id}`, { cache: 'no-store' }), jobSchema)
}

export async function cancelJob(id: string): Promise<Job> {
  return parse(await apiFetch(`/api/jobs/${id}/cancel`, { method: 'POST' }), jobSchema)
}

export async function listJobs(): Promise<Job[]> {
  const res = await apiFetch('/api/jobs', { cache: 'no-store' })
  return (await parse(res, z.object({ jobs: z.array(jobSchema) }))).jobs
}

/** Проверка файла до отправки: тип и размер. Сервер проверяет ещё раз по содержимому. */
export function checkPhoto(file: File): string | undefined {
  if (!PHOTO_TYPES.includes(file.type)) return `«${file.name}»: подходят JPEG, PNG и WebP`
  if (file.size > MAX_PHOTO_BYTES) return `«${file.name}»: больше 15 МБ`
  return undefined
}
