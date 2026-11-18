import { z } from 'zod'
import { apiFetch, jsonInit, parse } from '@/features/auth/http.ts'

export type ScenarioKind = 'photo' | 'video' | 'song'

const photoPlan = z.object({
  title: z.string(),
  summary: z.string(),
  shots: z.array(z.object({ ru: z.string() })),
})
const music = z.object({ ru: z.string(), tags: z.string(), bpm: z.number() })
const videoPlan = photoPlan.extend({ music: z.array(music) })
const songPlan = z.object({
  title: z.string(),
  summary: z.string(),
  genre: z.string(),
  bpm: z.number(),
  language: z.enum(['ru', 'en']),
  vocal: z.enum(['male', 'female']),
  lyrics: z.string(),
})

const scenarioSchema = z.object({
  id: z.string(),
  kind: z.enum(['photo', 'video', 'song']),
  status: z.enum(['asking', 'proposed', 'approved']),
  plan: z.union([videoPlan, photoPlan, songPlan]).optional(),
  messages: z.array(z.object({ role: z.enum(['user', 'agent']), text: z.string() })),
  music: music.optional(),
  cost: z.number(),
  createdAt: z.number(),
})

export type Scenario = z.infer<typeof scenarioSchema>
export type PhotoPlan = z.infer<typeof photoPlan>
export type VideoPlan = z.infer<typeof videoPlan>
export type SongPlan = z.infer<typeof songPlan>

export const isSongPlan = (p: Scenario['plan']): p is SongPlan => Boolean(p && 'lyrics' in p)
export const isVideoPlan = (p: Scenario['plan']): p is VideoPlan => Boolean(p && 'music' in p)

export async function startScenario(kind: ScenarioKind, idea: string) {
  return parse(await apiFetch('/api/scenarios', jsonInit('POST', { kind, idea })), scenarioSchema)
}

export async function getScenario(id: string) {
  return parse(await apiFetch(`/api/scenarios/${id}`, { cache: 'no-store' }), scenarioSchema)
}

export async function replyScenario(id: string, text: string) {
  return parse(
    await apiFetch(`/api/scenarios/${id}/reply`, jsonInit('POST', { text })),
    scenarioSchema,
  )
}

/** music — номер варианта фоновой музыки для видео или null («без музыки»). */
export async function approveScenario(id: string, music?: number | null) {
  return parse(
    await apiFetch(`/api/scenarios/${id}/approve`, jsonInit('POST', { music })),
    scenarioSchema,
  )
}

/** Цель задачи по своему сюжету. */
export const customTarget = (id: string) => `s-${id}`
export const isCustomTarget = (target: string) => /^s-[0-9a-f]{16}$/.test(target)
