import { useNavigate, useParams } from 'react-router'
import { Alert } from '@/components/ui/alert.tsx'
import { scenarios } from '@/features/catalog/data.ts'
import { usePaths } from '@/features/platform/use-paths.ts'
import {
  CatalogScreen,
  HomeScreen,
  JobScreen,
  ScenarioScreen,
  StubScreen,
  WizardScreen,
} from './screens.tsx'

function useScenario() {
  const { id } = useParams()
  return scenarios.find((s) => s.id === id)
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
  return (
    <WizardScreen
      scenario={scenario}
      onBack={() => void navigate(paths.photo(scenario.id))}
      onDone={() => void navigate(paths.job(scenario.id))}
    />
  )
}

export function JobPage() {
  const scenario = useScenario()
  const navigate = useNavigate()
  const paths = usePaths()
  if (!scenario) return <Missing />
  return <JobScreen scenario={scenario} onHome={() => void navigate(paths.home)} />
}

export function VideoPage() {
  return (
    <StubScreen
      title="Видеосценарии"
      text="Ролики из сцен уже в каталоге, запуск откроется позже."
    />
  )
}

export function CabinetPage() {
  return <StubScreen title="Кабинет" text="Здесь будут задачи и готовые кадры." />
}
