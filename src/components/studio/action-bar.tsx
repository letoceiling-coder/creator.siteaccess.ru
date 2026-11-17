import type { ReactNode } from 'react'

/** Закреплённые действия: на телефоне прибиты к низу, на широком экране идут в потоке. */
export function ActionBar({ children }: { children: ReactNode }) {
  return (
    <div className="from-canvas via-canvas/90 pointer-events-none fixed inset-x-0 bottom-0 z-20 bg-gradient-to-t to-transparent px-4 pt-10 pb-[max(1rem,env(safe-area-inset-bottom))] md:pointer-events-auto md:static md:bg-none md:px-0 md:pt-2 md:pb-0">
      <div className="pointer-events-auto mx-auto grid max-w-sm gap-2 md:mx-0">{children}</div>
    </div>
  )
}
