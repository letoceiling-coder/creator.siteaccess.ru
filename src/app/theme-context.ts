import { createContext } from 'react'

export type ThemeName = 'light' | 'dark'

export interface ThemeState {
  theme: ThemeName
  setTheme: (theme: ThemeName) => void
  toggleTheme: () => void
}

export const ThemeContext = createContext<ThemeState | null>(null)
