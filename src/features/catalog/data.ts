import cityNight from '@/assets/playground/city-night.jpg'
import coatEditorial from '@/assets/playground/coat-editorial.jpg'
import galleryLinen from '@/assets/playground/gallery-linen.jpg'
import galleryLook from '@/assets/playground/gallery-look.jpg'
import galleryStreet from '@/assets/playground/gallery-street.jpg'
import galleryStudio from '@/assets/playground/gallery-studio.jpg'
import portraitDay from '@/assets/playground/portrait-day.jpg'
import portraitNorth from '@/assets/playground/portrait-north.jpg'
import railStudio from '@/assets/playground/rail-studio.jpg'
import scenarioField from '@/assets/playground/scenario-field.jpg'
import scenarioRoom from '@/assets/playground/scenario-room.jpg'
import walkYellow from '@/assets/playground/walk-yellow.jpg'

export type CategoryId = 'all' | 'travel' | 'fashion' | 'business' | 'fiction'

export interface Scenario {
  id: string
  title: string
  tag: string
  category: Exclude<CategoryId, 'all'>
  frames: number
  cover: string
  gallery: string[]
  blurb: string
  eta: string
}

export const categories: { id: CategoryId; label: string }[] = [
  { id: 'all', label: 'Все' },
  { id: 'travel', label: 'Путешествия' },
  { id: 'fashion', label: 'Fashion' },
  { id: 'business', label: 'Деловое' },
  { id: 'fiction', label: 'Сюжеты' },
]

export const scenarios: Scenario[] = [
  {
    id: 'north',
    title: 'Северный берег',
    tag: 'Море',
    category: 'travel',
    frames: 5,
    cover: portraitNorth,
    gallery: [galleryStreet, scenarioField, galleryLinen, galleryLook],
    blurb: 'Холодный свет, ветер и длинные тени на пустом берегу.',
    eta: 'около 5 минут',
  },
  {
    id: 'dubai',
    title: 'Ночной Дубай',
    tag: 'Город',
    category: 'travel',
    frames: 5,
    cover: cityNight,
    gallery: [galleryStreet, galleryStudio, railStudio, walkYellow],
    blurb: 'Неон, стекло и огни высоток — вы на крыше, город внизу.',
    eta: 'около 5 минут',
  },
  {
    id: 'editorial',
    title: 'Editorial',
    tag: 'Fashion',
    category: 'fashion',
    frames: 5,
    cover: coatEditorial,
    gallery: [galleryLook, galleryLinen, galleryStudio, walkYellow],
    blurb: 'Журнальная съёмка: пальто, строгий свет, чистый фон.',
    eta: 'около 5 минут',
  },
  {
    id: 'yellow',
    title: 'Жёлтая улица',
    tag: 'Fashion',
    category: 'fashion',
    frames: 5,
    cover: walkYellow,
    gallery: [galleryStreet, galleryLook, railStudio, galleryLinen],
    blurb: 'Яркий акцент в серой городской прогулке.',
    eta: 'около 5 минут',
  },
  {
    id: 'portrait',
    title: 'Деловой портрет',
    tag: 'Деловое',
    category: 'business',
    frames: 5,
    cover: portraitDay,
    gallery: [galleryStudio, galleryLinen, scenarioRoom, galleryLook],
    blurb: 'Чистый студийный портрет для профиля, сайта и визитки.',
    eta: 'около 5 минут',
  },
  {
    id: 'room',
    title: 'Кабинет',
    tag: 'Сюжет',
    category: 'fiction',
    frames: 5,
    cover: scenarioRoom,
    gallery: [galleryStudio, galleryLook, scenarioField, railStudio],
    blurb: 'Тёплая комната, книги и тихий вечер как кадр из фильма.',
    eta: 'около 5 минут',
  },
]

export const samplePhotos = [portraitDay, coatEditorial, walkYellow]
export const heroDeck = [portraitNorth, cityNight, coatEditorial]
