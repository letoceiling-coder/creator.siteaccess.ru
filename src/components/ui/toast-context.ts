import { createContext } from 'react'

export type ToastTone = 'info' | 'danger'

export interface ToastItem {
  id: string
  message: string
  tone: ToastTone
}

export interface ToastApi {
  push: (message: string, tone?: ToastTone) => void
}

export const ToastContext = createContext<ToastApi | null>(null)
