import { clsx, type ClassValue } from 'clsx'
import { extendTailwindMerge } from 'tailwind-merge'

const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      text: ['caption', 'body', 'title', 'display'],
      color: [
        'canvas',
        'canvas-sunken',
        'canvas-raised',
        'canvas-overlay',
        'ink',
        'ink-muted',
        'line',
        'line-strong',
        'accent',
        'accent-fill',
        'accent-ink',
        'danger',
        'danger-fill',
        'danger-ink',
        'success',
        'success-fill',
        'success-ink',
        'focus',
        'wash',
      ],
    },
  },
})

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}
