import { useContext } from 'react'
import { ThemeContext, type ThemeState } from './theme-context.ts'

export function useTheme(): ThemeState {
  const value = useContext(ThemeContext)
  if (!value) throw new Error('useTheme must be used within ThemeProvider')
  return value
}
