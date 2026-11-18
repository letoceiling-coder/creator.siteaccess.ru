import { RefreshCw } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useState } from 'react'
import { StudioButton } from '@/components/studio/studio-button.tsx'
import { Alert } from '@/components/ui/alert.tsx'
import { ApiError } from '@/features/auth/http.ts'
import { redoJob, type Job, type RedoReason } from '@/features/jobs/api.ts'
import { cn } from '@/shared/cn.ts'

const reasonsFor: Record<Job['kind'], [RedoReason, string][]> = {
  photo: [
    ['face', 'Лицо не похоже на меня'],
    ['face_cut', 'Лицо обрезано или плохо видно'],
    ['body', 'Искажены руки или тело'],
    ['outfit', 'Не тот образ или одежда'],
    ['scene', 'Не соответствует сюжету'],
    ['quality', 'Размыто или артефакты'],
    ['other', 'Другое'],
  ],
  video: [
    ['face', 'Лицо не похоже на меня'],
    ['face_cut', 'Лицо обрезано или пропадает'],
    ['motion', 'Странное движение'],
    ['body', 'Искажены руки или тело'],
    ['outfit', 'Не тот образ или одежда'],
    ['scene', 'Не соответствует сюжету'],
    ['other', 'Другое'],
  ],
  animate: [
    ['face', 'Лицо меняется'],
    ['motion', 'Странное движение'],
    ['quality', 'Размыто или артефакты'],
    ['other', 'Другое'],
  ],
  song: [
    ['audio', 'Не нравится звучание или голос'],
    ['quality', 'Плохо слышно слова'],
    ['other', 'Другое'],
  ],
}

/**
 * «Переделать»: одна бесплатная попытка, пока результат не скачан (48 часов). Пользователь
 * отмечает, что не так, — агент разбирает журнал генерации и пересоздаёт с исправлениями.
 */
export function RedoPanel({ job, onStarted }: { job: Job; onStarted: (jobId: string) => void }) {
  const [open, setOpen] = useState(false)
  const [reasons, setReasons] = useState<RedoReason[]>([])
  const [frames, setFrames] = useState<number[]>([])
  const [comment, setComment] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const [diagnosis, setDiagnosis] = useState<string>()
  const photo = job.kind === 'photo'

  const toggle = <T,>(list: T[], v: T) =>
    list.includes(v) ? list.filter((x) => x !== v) : [...list, v]

  async function submit() {
    setBusy(true)
    setError(undefined)
    try {
      const res = await redoJob(job.id, { reasons, comment: comment.trim(), frames })
      setDiagnosis(res.diagnosis)
      window.setTimeout(() => onStarted(res.id), 2200)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Не удалось запустить переделку')
      setBusy(false)
    }
  }

  if (!open)
    return (
      <div className="chamfer-sm bg-canvas-raised grid gap-2 p-4">
        <p className="text-body text-ink">
          Что-то не так? ИИ может ошибаться — одна переделка бесплатно.
        </p>
        <p className="text-caption text-ink-muted">
          Доступна, пока вы не скачали результат, в течение 48 часов.
        </p>
        <StudioButton variant="outline" onClick={() => setOpen(true)}>
          <span className="inline-flex items-center gap-2">
            <RefreshCw size={16} aria-hidden="true" /> Переделать
          </span>
        </StudioButton>
      </div>
    )

  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22 }}
      className="chamfer ticks bg-canvas-raised grid gap-4 p-5"
      aria-label="Переделать"
    >
      <h2 className="font-display text-ink text-xl">Что исправить?</h2>
      <fieldset className="grid gap-2">
        <legend className="text-caption text-ink-muted mb-1">Отметьте, что не так</legend>
        <div className="flex flex-wrap gap-2">
          {reasonsFor[job.kind].map(([id, label]) => (
            <button
              key={id}
              type="button"
              aria-pressed={reasons.includes(id)}
              onClick={() => setReasons((r) => toggle(r, id))}
              className={cn(
                'chamfer-sm min-h-11 px-4 text-left transition-colors duration-[140ms]',
                reasons.includes(id)
                  ? 'bg-accent-fill text-accent-ink'
                  : 'bg-canvas-sunken text-ink hover:bg-canvas-overlay',
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </fieldset>
      {photo && job.results.length > 1 ? (
        <fieldset className="grid gap-2">
          <legend className="text-caption text-ink-muted mb-1">
            Какие кадры переделать (ничего не отмечено — все)
          </legend>
          <div className="grid grid-cols-5 gap-2">
            {job.results.map((r, i) => (
              <button
                key={r.src}
                type="button"
                aria-pressed={frames.includes(i)}
                aria-label={`Кадр ${i + 1}`}
                onClick={() => setFrames((f) => toggle(f, i))}
                className={cn(
                  'relative overflow-hidden outline-offset-2',
                  frames.includes(i) ? 'outline-accent outline-2' : 'opacity-70 hover:opacity-100',
                )}
              >
                <img src={r.src} alt="" className="aspect-[3/4] w-full object-cover" />
                <span className="absolute top-1 left-1 bg-black/55 px-1.5 text-xs text-white tabular-nums">
                  {i + 1}
                </span>
              </button>
            ))}
          </div>
        </fieldset>
      ) : null}
      <label className="grid gap-1">
        <span className="text-caption text-ink-muted">Подробнее (необязательно)</span>
        <textarea
          className="border-line bg-canvas text-ink min-h-20 border p-3"
          maxLength={500}
          value={comment}
          placeholder="Например: на третьем кадре другой разрез глаз и слишком тёмный свет"
          onChange={(e) => setComment(e.target.value)}
        />
      </label>
      <AnimatePresence>
        {diagnosis ? (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <Alert tone="success" title="Переделка запущена">
              {diagnosis}
            </Alert>
          </motion.div>
        ) : null}
      </AnimatePresence>
      {error ? (
        <Alert tone="danger" title="Переделка">
          {error}
        </Alert>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <StudioButton disabled={busy || reasons.length === 0} onClick={() => void submit()}>
          {busy ? 'Разбираем, что пошло не так…' : 'Переделать бесплатно'}
        </StudioButton>
        <StudioButton variant="quiet" disabled={busy} onClick={() => setOpen(false)}>
          Отмена
        </StudioButton>
      </div>
    </motion.section>
  )
}
