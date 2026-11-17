interface RadioOption {
  value: string
  label: string
  description?: string
}

interface RadioGroupProps {
  name: string
  label: string
  value: string
  options: readonly RadioOption[]
  onChange: (value: string) => void
}

export function RadioGroup({ name, label, value, options, onChange }: RadioGroupProps) {
  return (
    <fieldset className="grid gap-2">
      <legend className="text-caption text-ink font-medium">{label}</legend>
      <div className="grid gap-1">
        {options.map((option) => (
          <label key={option.value} className="flex min-h-11 items-center gap-3">
            <input
              type="radio"
              className="peer sr-only focus-visible:outline-none"
              name={name}
              value={option.value}
              checked={value === option.value}
              onChange={() => onChange(option.value)}
            />
            <span
              aria-hidden="true"
              className="border-line-strong peer-checked:border-accent-fill peer-focus-visible:outline-focus transition-studio chamfer-sm grid size-5 shrink-0 place-items-center border peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-3 peer-checked:[&>span]:scale-100"
            >
              <span className="bg-accent-fill size-2.5 scale-0 transition-transform duration-[var(--duration-fast)]" />
            </span>
            <span className="grid">
              <span className="text-body text-ink">{option.label}</span>
              {option.description ? (
                <span className="text-caption text-ink-muted">{option.description}</span>
              ) : null}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  )
}

export function SegmentedControl({ name, label, value, options, onChange }: RadioGroupProps) {
  return (
    <fieldset className="grid gap-2">
      <legend className="text-caption text-ink font-medium">{label}</legend>
      <div className="bg-canvas-sunken chamfer-sm inline-flex w-full p-1 sm:w-fit">
        {options.map((option) => (
          <label key={option.value} className="min-h-11 flex-1 sm:flex-none">
            <input
              type="radio"
              className="peer sr-only focus-visible:outline-none"
              name={name}
              value={option.value}
              checked={value === option.value}
              onChange={() => onChange(option.value)}
            />
            <span className="text-caption text-ink-muted peer-checked:bg-accent-fill peer-checked:text-accent-ink peer-focus-visible:outline-focus transition-studio chamfer-sm inline-flex min-h-11 w-full items-center justify-center px-4 peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2">
              {option.label}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  )
}
