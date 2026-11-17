import type { ReactNode } from 'react'
import { cn } from '@/shared/cn.ts'

export function StandardCard({
  eyebrow,
  title,
  children,
}: {
  eyebrow?: string
  title: string
  children: ReactNode
}) {
  return (
    <article className="chamfer ticks bg-canvas-raised grid gap-3 p-5">
      {eyebrow ? (
        <p className="text-caption tracking-label text-ink-muted uppercase">{eyebrow}</p>
      ) : null}
      <h3 className="font-display text-title text-ink">{title}</h3>
      <div className="text-body text-ink-muted">{children}</div>
    </article>
  )
}

export function InteractiveCard({
  title,
  children,
  action,
  onClick,
}: {
  title: string
  children: ReactNode
  action: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="chamfer ticks bg-canvas-raised hover:bg-canvas-overlay transition-studio grid w-full gap-3 p-5 text-left active:scale-[0.98] motion-reduce:active:scale-100"
    >
      <h3 className="font-display text-title text-ink">{title}</h3>
      <p className="text-body text-ink-muted">{children}</p>
      <span className="text-caption text-accent font-medium">{action}</span>
    </button>
  )
}

export function FeatureCard({
  index,
  title,
  children,
}: {
  index: string
  title: string
  children: ReactNode
}) {
  return (
    <article className="chamfer ticks bg-canvas-overlay flex min-h-52 flex-col justify-between gap-8 p-5">
      <span className="font-display text-title text-accent">{index}</span>
      <div className="grid gap-2">
        <h3 className="font-display text-title text-ink">{title}</h3>
        <p className="text-body text-ink-muted">{children}</p>
      </div>
    </article>
  )
}

export function MediaCard({
  title,
  meta,
  src,
  alt,
}: {
  title: string
  meta: string
  src: string
  alt: string
}) {
  return (
    <article className="chamfer ticks bg-canvas-raised overflow-hidden">
      <div className="bg-canvas-sunken relative aspect-[4/3]">
        <img
          src={src}
          alt={alt}
          loading="lazy"
          decoding="async"
          className="absolute inset-0 size-full object-cover"
        />
      </div>
      <div className="grid gap-1 p-5">
        <h3 className="font-display text-title text-ink">{title}</h3>
        <p className="text-caption text-ink-muted">{meta}</p>
      </div>
    </article>
  )
}

export function SelectableCard({
  title,
  meta,
  src,
  alt,
  selected,
  onSelect,
}: {
  title: string
  meta: string
  src: string
  alt: string
  selected: boolean
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      data-active={selected}
      aria-pressed={selected}
      onClick={onSelect}
      className={cn(
        'chamfer ticks transition-studio w-full overflow-hidden text-left active:scale-[0.98] motion-reduce:active:scale-100',
        selected ? 'bg-accent-fill [&_span]:text-accent-ink' : 'bg-canvas-raised',
      )}
    >
      <div className="bg-canvas-sunken relative aspect-[3/4]">
        <img
          src={src}
          alt={alt}
          loading="lazy"
          decoding="async"
          className="absolute inset-0 size-full object-cover"
        />
      </div>
      <div className="grid gap-1 p-4">
        <span className="text-caption tracking-label text-ink-muted uppercase">
          {selected ? 'Выбрано' : 'Сценарий'}
        </span>
        <span className="font-display text-title text-ink">{title}</span>
        <span className="text-caption text-ink-muted">{meta}</span>
      </div>
    </button>
  )
}

export function GlassCard({
  title,
  meta,
  src,
  alt,
}: {
  title: string
  meta: string
  src: string
  alt: string
}) {
  return (
    <article className="chamfer relative overflow-hidden">
      <div className="bg-canvas-sunken relative aspect-[3/4]">
        <img
          src={src}
          alt={alt}
          loading="lazy"
          decoding="async"
          className="absolute inset-0 size-full object-cover"
        />
      </div>
      <div className="surface-glass chamfer-sm absolute inset-x-3 bottom-3 grid gap-1 p-4">
        <h3 className="font-display text-title text-ink">{title}</h3>
        <p className="text-caption text-ink-muted">{meta}</p>
      </div>
    </article>
  )
}
