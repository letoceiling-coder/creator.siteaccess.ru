export const motionTokens = {
  duration: {
    fast: 0.14,
    base: 0.22,
    slow: 0.36,
  },
  ease: {
    standard: [0.2, 0, 0, 1],
    enter: [0.22, 1, 0.36, 1],
    exit: [0.4, 0, 1, 1],
  },
  rise: 12,
  press: 0.98,
} as const

export const motionCss = {
  fast: '140ms',
  base: '220ms',
  slow: '360ms',
} as const
