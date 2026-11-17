import { useNavigate, useParams } from 'react-router'
import { Alert } from '@/components/ui/alert.tsx'
import { scenarios } from '@/features/catalog/data.ts'
import { videoTemplates } from '@/features/catalog/video-data.ts'
import type { JobKind } from '@/features/jobs/api.ts'
import { useMedia } from '@/features/media/use-media.ts'
import { usePaths } from '@/features/platform/use-paths.ts'
import { CabinetScreen, JobScreen, WizardScreen, type CreateTarget } from './job-screens.tsx'
import { CatalogScreen, HomeScreen, ScenarioScreen } from './screens.tsx'
import { VideoCatalogScreen, VideoDetailScreen } from './video-screens.tsx'

function useScenario() {
  const { id } = useParams()
  return scenarios.find((s) => s.id === id)
}

function useTemplate() {
  const { id } = useParams()
  return videoTemplates.find((v) => v.id === id)
}

function Missing() {
  return (
    <div className="px-4 pt-8 md:px-6">
      <Alert tone="danger" title="Сценарий не найден">
        Он снят с публикации или адрес неверный. Вернитесь в каталог.
      </Alert>
    </div>
  )
}

/** Название и обложка задачи по её виду и id сценария/шаблона. */
function useDescribe() {
  const media = useMedia()
  return (kind: JobKind, target: string) => {
    if (kind === 'video') {
      const v = videoTemplates.find((t) => t.id === target)
      return v ? { title: v.title, cover: media.videos[v.id]?.poster ?? v.cover } : undefined
    }
    const s = scenarios.find((t) => t.id === target)
    return s ? { title: s.title, cover: s.cover } : undefined
  }
}

export function HomePage() {
  const navigate = useNavigate()
  const paths = usePaths()
  return (
    <HomeScreen
      onOpen={(id) => void navigate(paths.photo(id))}
      onCatalog={() => void navigate(paths.photos)}
    />
  )
}

export function CatalogPage() {
  const navigate = useNavigate()
  const paths = usePaths()
  return <CatalogScreen onOpen={(id) => void navigate(paths.photo(id))} />
}

export function ScenarioPage() {
  const scenario = useScenario()
  const navigate = useNavigate()
  const paths = usePaths()
  if (!scenario) return <Missing />
  return (
    <ScenarioScreen scenario={scenario} onCreate={() => void navigate(paths.create(scenario.id))} />
  )
}

export function CreatePage() {
  const scenario = useScenario()
  const navigate = useNavigate()
  const paths = usePaths()
  if (!scenario) return <Missing />
  const target: CreateTarget = {
    kind: 'photo',
    id: scenario.id,
    title: scenario.title,
    cover: scenario.cover,
    output: `${scenario.frames} кадров`,
    eta: scenario.eta,
  }
  return (
    <WizardScreen
      target={target}
      onBack={() => void navigate(paths.photo(scenario.id))}
      onDone={(jobId) => void navigate(paths.job(jobId))}
    />
  )
}

export function VideoCreatePage() {
  const template = useTemplate()
  const media = useMedia()
  const navigate = useNavigate()
  const paths = usePaths()
  if (!template) return <Missing />
  const target: CreateTarget = {
    kind: 'video',
    id: template.id,
    title: template.title,
    cover: media.videos[template.id]?.poster ?? template.cover,
    output: 'ролик 5 секунд с музыкой',
    eta: 'около 5 минут',
  }
  return (
    <WizardScreen
      target={target}
      onBack={() => void navigate(paths.videoItem(template.id))}
      onDone={(jobId) => void navigate(paths.job(jobId))}
    />
  )
}

export function JobPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const paths = usePaths()
  const describe = useDescribe()
  return (
    <JobScreen
      key={id}
      jobId={id}
      describe={describe}
      onCabinet={() => void navigate(paths.cabinet)}
      onRetry={(kind, target) =>
        void navigate(kind === 'video' ? paths.videoCreate(target) : paths.create(target))
      }
    />
  )
}

export function VideoPage() {
  const navigate = useNavigate()
  const paths = usePaths()
  return <VideoCatalogScreen onOpen={(id) => void navigate(paths.videoItem(id))} />
}

export function VideoItemPage() {
  const template = useTemplate()
  const navigate = useNavigate()
  const paths = usePaths()
  if (!template) return <Missing />
  return (
    <VideoDetailScreen
      template={template}
      onCatalog={() => void navigate(paths.video)}
      onCreate={() => void navigate(paths.videoCreate(template.id))}
    />
  )
}

export function CabinetPage() {
  const navigate = useNavigate()
  const paths = usePaths()
  const describe = useDescribe()
  return (
    <CabinetScreen
      describe={describe}
      onOpen={(id) => void navigate(paths.job(id))}
      onCatalog={() => void navigate(paths.photos)}
    />
  )
}
