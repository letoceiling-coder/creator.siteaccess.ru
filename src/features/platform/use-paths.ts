import { usePlatform } from './use-platform.ts'

/** Ссылки строятся от корня платформы: `/photos`, `/telegram/photos`, `/max/photos`. */
export function platformBase(homePath: string): string {
  return homePath === '/' ? '' : homePath
}

export function usePaths() {
  const { homePath } = usePlatform()
  const base = platformBase(homePath)
  return {
    home: homePath,
    photos: `${base}/photos`,
    photo: (id: string) => `${base}/photos/${id}`,
    create: (id: string) => `${base}/photos/${id}/create`,
    job: (id: string) => `${base}/jobs/${id}`,
    video: `${base}/video`,
    videoItem: (id: string) => `${base}/video/${id}`,
    videoCreate: (id: string) => `${base}/video/${id}/create`,
    cabinet: `${base}/cabinet`,
  }
}

export type Paths = ReturnType<typeof usePaths>
