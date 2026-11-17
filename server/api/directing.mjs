/**
 * Режиссура фотосессии: каждый кадр снят «как профессиональный фотограф» — свой ракурс,
 * высота камеры, объектив, свет, поза, предмет и действие. Пять кадров одной локации
 * складываются в мини-историю: общий план, герой снизу, кадр сверху, портрет, момент.
 */

/** Реквизит и действия для каждой локации: [предмет в руках, где сесть, движение, эмоция]. */
const props = {
  'north-shore': [
    'a chunky wool scarf blowing in the wind',
    'a weathered driftwood log',
    'walking along the waterline with the wind in the hair',
    'calm, thoughtful',
  ],
  'desert-dawn': [
    'a light linen scarf lifted by the wind',
    'the crest of a sand dune',
    'walking barefoot down the dune slope',
    'free, serene',
  ],
  'alpine-lake': [
    'a steaming enamel mug of tea',
    'a wooden jetty edge with feet above the water',
    'stepping along the rocky shore',
    'peaceful',
  ],
  'pine-fog': [
    'a vintage film camera',
    'a moss-covered fallen trunk',
    'walking between the pine trunks through the fog',
    'mysterious, quiet',
  ],
  lavender: [
    'a small bouquet of lavender',
    'the ground between lavender rows',
    'walking through the rows touching the flowers',
    'joyful, dreamy',
  ],
  'winter-forest': [
    'a red knitted mitten holding a handful of snow',
    'a snow-covered bench',
    'walking through deep snow with snowflakes falling',
    'cheerful, rosy cheeks',
  ],
  'neon-roof': [
    'sunglasses held in one hand',
    'the edge of a rooftop ventilation box',
    'walking along the rooftop railing',
    'confident, cool',
  ],
  'old-town': [
    'a paper cup of coffee',
    'old stone steps',
    'walking under the arches',
    'relaxed, warm smile',
  ],
  'yellow-street': [
    'a yellow umbrella',
    'a concrete curb',
    'crossing the street mid-stride',
    'playful, energetic',
  ],
  'rail-platform': [
    'a leather travel bag',
    'a platform bench',
    'walking along the platform edge line',
    'pensive, anticipating',
  ],
  'dusk-bridge': [
    'a camera on a strap',
    'the bridge railing ledge',
    'walking along the bridge with city lights behind',
    'dreamy',
  ],
  'rain-window': [
    'a warm cup held with both hands',
    'a window seat with cushions',
    'wiping a clear spot on the misted glass',
    'cozy, introspective',
  ],
  'studio-flash': [
    'oversized sunglasses',
    'a minimal white cube stool',
    'a dynamic jump with clothes flying',
    'bold, high fashion attitude',
  ],
  'linen-window': [
    'a sheer linen curtain gathered in one hand',
    'a wide windowsill',
    'turning slowly as the curtain flows',
    'soft, tender',
  ],
  'autumn-coat': [
    'a bright maple leaf shaped like a heart held toward the camera',
    'a park bench covered with leaves',
    'walking through falling leaves',
    'warm, nostalgic',
  ],
  'editorial-grey': [
    'the lapel of a structured jacket',
    'a black bentwood chair turned backwards',
    'a sharp turn of the shoulder',
    'strong, editorial',
  ],
  'concrete-loft': [
    'a book',
    'a raw concrete window ledge',
    'walking through a beam of window light',
    'focused, calm',
  ],
  'mirror-wall': [
    'a lipstick or a pair of earrings',
    'a velvet pouf',
    'turning toward the reflection',
    'elegant, self-assured',
  ],
  'business-portrait': [
    'a closed laptop or a notebook',
    'the edge of a minimalist desk',
    'adjusting a jacket cuff',
    'approachable, competent',
  ],
  'meeting-room': [
    'a pen and documents',
    'a meeting table edge',
    'walking into the room through the glass door',
    'decisive, friendly',
  ],
  'coffee-shop': [
    'a latte with latte art',
    'a bar stool at the wooden counter',
    'reaching for a cup on the counter',
    'warm, genuine laugh',
  ],
  coworking: [
    'a tablet',
    'a soft lounge chair among plants',
    'walking past the big windows',
    'inspired, open',
  ],
  'study-room': [
    'an open antique book',
    'a leather armchair',
    'pulling a book from a tall shelf',
    'curious, absorbed',
  ],
  space: [
    'a helmet held under one arm',
    'the observation deck bench facing the planet',
    'floating weightlessly in the cabin',
    'awe, wonder',
  ],
  'spy-night': [
    'the collar of a trench coat pulled up',
    'a wet metal staircase',
    'walking fast through the steam',
    'tense, mysterious',
  ],
  'old-cinema': [
    'a striped box of popcorn',
    'a red velvet theatre seat',
    'walking down the aisle in the projector beam',
    'delighted, nostalgic',
  ],
  birthday: [
    'a cake with lit sparkler candles',
    'a sofa among balloons',
    'laughing in falling confetti',
    'happy, surprised',
  ],
  'new-year': [
    'a glass of sparkling drink and a sparkler',
    'a armchair by the decorated tree',
    'hanging an ornament on the tree',
    'magical, glowing',
  ],
  'sunset-terrace': [
    'a glass of lemonade with ice',
    'a rattan chair',
    'turning around under the string lights',
    'carefree, golden',
  ],
  graduation: [
    'a rolled diploma with a ribbon',
    'the steps of the university building',
    'throwing the cap into the air',
    'proud, elated',
  ],
}

/**
 * Пять кадров с разной камерой. {prop}, {seat}, {move}, {mood} подставляются из реквизита.
 * Ракурсы и оптика — язык фотографа: так модель меняет позу и точку съёмки, а не копирует исходник.
 */
const shotList = [
  {
    name: 'Общий план',
    camera:
      'Establishing wide shot at eye level, 35mm lens, f/4, the person occupies one third of the frame, rule of thirds, environment tells the story',
    pose: 'standing naturally, weight on one leg, body turned slightly away, looking into the distance',
  },
  {
    name: 'Герой снизу',
    camera:
      'Low-angle hero shot, camera near the ground looking up, 24mm lens, dramatic perspective, sky or ceiling visible',
    pose: 'confident full-body pose, one hand in a pocket, chin slightly up, looking past the camera',
  },
  {
    name: 'Сверху',
    camera:
      'High-angle shot, camera above the person looking down, 35mm lens, the person looks up straight into the lens',
    pose: 'holding {prop} toward the camera with both hands, playful foreshortening',
  },
  {
    name: 'Портрет',
    camera:
      'Tight beauty portrait, 85mm lens at f/1.4, eye-level, creamy background bokeh, catchlights in the eyes',
    pose: 'one hand gently near the face, head slightly tilted, expression {mood}',
  },
  {
    name: 'Момент',
    camera:
      'Candid telephoto shot from a distance, 135mm lens, background compression, side view, natural motion blur in the background',
    pose: '{move}',
  },
  {
    name: 'Сидя',
    camera: 'Three-quarter shot from a slightly lower angle, 50mm lens, f/2',
    pose: 'sitting relaxed on {seat}, elbows on knees, genuine expression {mood}',
  },
]

const fill = (text, p) =>
  text
    .replaceAll('{prop}', p[0])
    .replaceAll('{seat}', p[1])
    .replaceAll('{move}', p[2])
    .replaceAll('{mood}', p[3])

/**
 * Кадры для локации: по умолчанию 5 (общий, снизу, сверху, портрет, момент).
 * Шестой («Сидя») подставляется вместо «Снизу» для деловых и интерьерных сцен.
 */
export function directShots(locationId, customProps) {
  // customProps — реквизит сюжета, если он задан в самом сюжете (photo-stories.mjs).
  const p = customProps ??
    props[locationId] ?? ['a meaningful object', 'a chair', 'walking naturally', 'natural, relaxed']
  const indoor = [
    'business-portrait',
    'meeting-room',
    'coffee-shop',
    'coworking',
    'study-room',
    'rain-window',
    'linen-window',
    'mirror-wall',
    'old-cinema',
    'birthday',
    'new-year',
  ].includes(locationId)
  const picks = indoor ? [0, 5, 2, 3, 4] : [0, 1, 2, 3, 4]
  return picks.map((i) => {
    const shot = shotList[i]
    return { name: shot.name, camera: fill(shot.camera, p), pose: fill(shot.pose, p) }
  })
}

/** Свет как у фотографа: под время суток, с рисующим и контровым светом. */
export const lighting = {
  day: 'soft natural daylight with a gentle fill, subtle rim light on the hair',
  dusk: 'golden hour backlight, warm rim light outlining the hair and shoulders, long soft shadows',
  night:
    'night scene lit by practical lights and neon, cinematic contrast, soft key light on the face',
}

export const camera =
  'Shot on a full-frame professional camera by an award-winning photographer, natural skin texture with pores, realistic hands with five fingers, accurate anatomy, subtle film grain, professional color grading'
