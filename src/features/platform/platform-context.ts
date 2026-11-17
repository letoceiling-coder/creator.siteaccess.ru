import { createContext } from 'react'
import type { PlatformSnapshot } from './snapshot.ts'

export const PlatformContext = createContext<PlatformSnapshot | null>(null)
