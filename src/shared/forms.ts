import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'

export const displayNameSchema = z.object({
  displayName: z.string().min(2, 'Минимум 2 символа'),
})

export type DisplayNameValues = z.infer<typeof displayNameSchema>

export const displayNameResolver = zodResolver(displayNameSchema)
