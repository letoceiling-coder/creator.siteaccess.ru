/** Знаки сервисов входа: одинаковый размер и форма, фирменный цвет внутри. */
const size = 24

export function YandexIcon() {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="12" fill="#FC3F1D" />
      <path
        d="M13.4 18.6h2.2V5.4h-3.2c-3.2 0-4.9 1.6-4.9 4 0 1.9.9 3.1 2.6 4.3L7 18.6h2.4l3.3-5-1.1-.8c-1.4-.9-2.1-1.7-2.1-3.3 0-1.4 1-2.3 2.8-2.3h1.1v11.4z"
        fill="#fff"
      />
    </svg>
  )
}

export function VkIcon() {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <rect width="24" height="24" rx="7" fill="#0077FF" />
      <path
        d="M12.8 16.8c-4.9 0-7.7-3.4-7.8-9h2.5c.1 4.1 1.9 5.9 3.3 6.2V7.8h2.3v3.6c1.4-.2 2.9-1.8 3.4-3.6h2.3c-.4 2.2-2 3.8-3.1 4.5 1.1.5 2.9 1.9 3.6 4.5h-2.6c-.5-1.7-1.9-3.1-3.6-3.3v3.3h-.3z"
        fill="#fff"
      />
    </svg>
  )
}

export function TelegramIcon() {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="12" fill="#229ED9" />
      <path
        d="M5.4 11.7l11.3-4.4c.5-.2 1 .1.8.9l-1.9 9c-.1.6-.5.8-1 .5l-2.9-2.1-1.4 1.3c-.2.2-.3.3-.6.3l.2-3 5.4-4.9c.2-.2 0-.3-.3-.1l-6.7 4.2-2.9-.9c-.6-.2-.6-.6.1-.8z"
        fill="#fff"
      />
    </svg>
  )
}

export function MaxIcon() {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <defs>
        <linearGradient id="max-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#3EA1FF" />
          <stop offset="1" stopColor="#8B3DFF" />
        </linearGradient>
      </defs>
      <rect width="24" height="24" rx="7" fill="url(#max-g)" />
      <path
        d="M6.5 16.5V7.5h2.1l3.4 4.6 3.4-4.6h2.1v9h-2.2v-5.6L12 15.1l-3.3-4.2v5.6z"
        fill="#fff"
      />
    </svg>
  )
}

/** Знак сервиса по его id; для неизвестного — ничего. */
export function BrandIcon({ id }: { id: string }) {
  if (id === 'yandex') return <YandexIcon />
  if (id === 'vk') return <VkIcon />
  if (id === 'telegram') return <TelegramIcon />
  if (id === 'max') return <MaxIcon />
  return null
}
