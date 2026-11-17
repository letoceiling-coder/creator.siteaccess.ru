/** 30 локаций × 5 планов = 150 фото. Сцены на английском: модель лучше понимает их. */
export const locations = [
  // Море и природа
  ['north-shore', 'Северный берег', 'a windswept northern beach at sunrise, wet sand, cold blue sea, low clouds', 'cold blue and silver light'],
  ['desert-dawn', 'Рассвет в пустыне', 'sand dunes at dawn with long soft shadows, rippled sand, clear sky', 'warm apricot and sand tones'],
  ['alpine-lake', 'Горное озеро', 'a mirror-calm alpine lake with mist over pine forest and snowy peaks', 'cool green and misty grey'],
  ['pine-fog', 'Хвойный лес в тумане', 'a pine forest in thick morning fog, light rays between trunks', 'muted green, soft diffused light'],
  ['lavender', 'Поле лаванды', 'a lavender field in Provence at golden hour, rows to the horizon', 'violet and golden light'],
  ['winter-forest', 'Зимний лес', 'a snowy birch forest on a bright frosty morning', 'white, pale blue, soft sun'],
  // Город
  ['neon-roof', 'Ночной город с крыши', 'a rooftop terrace at night above a glittering skyscraper skyline with neon glow', 'teal and magenta neon, deep night'],
  ['old-town', 'Старый город', 'a narrow old European stone street with arches and warm evening light', 'warm terracotta and amber'],
  ['yellow-street', 'Жёлтая улица', 'a grey modern city crosswalk with one bright yellow wall', 'neutral grey with a strong yellow accent'],
  ['rail-platform', 'Вокзальная платформа', 'an empty train station platform with perspective lines and overhead lights', 'desaturated steel and soft green'],
  ['dusk-bridge', 'Мост в сумерках', 'a long city bridge at blue hour with car lights and a river below', 'deep blue hour with warm lights'],
  ['rain-window', 'Дождь у окна', 'a cozy cafe window with rain streaks and blurred city lights outside', 'warm interior glow against cool rain'],
  // Fashion
  ['studio-flash', 'Студийная вспышка', 'a seamless colored studio backdrop with hard flash lighting and crisp shadow', 'bold solid color backdrop, high contrast'],
  ['linen-window', 'Лён и окно', 'a bright airy room with a large window and sheer linen curtains moving in the breeze', 'soft white and cream'],
  ['autumn-coat', 'Пальто на аллее', 'an autumn park alley with falling leaves and low sun', 'rust, ochre and olive'],
  ['editorial-grey', 'Редакционный фон', 'a clean grey paper backdrop with a single directional softbox light', 'minimal grey and charcoal'],
  ['concrete-loft', 'Бетонный лофт', 'a raw concrete loft with tall industrial windows and dust in the light', 'cool concrete grey with warm window light'],
  ['mirror-wall', 'Зеркальная стена', 'a mirrored wall in a bright modern interior with reflections', 'clean white, silver and soft glow'],
  // Деловое
  ['business-portrait', 'Деловой портрет', 'a clean neutral studio with a soft gradient backdrop', 'neutral grey-blue, soft key light'],
  ['meeting-room', 'Переговорная', 'a modern glass meeting room with a long wooden table and city view', 'cool daylight, wood and glass'],
  ['coffee-shop', 'Кофейня', 'a stylish coffee shop with a wooden counter and warm pendant lights', 'warm brown and amber'],
  ['coworking', 'Коворкинг', 'a bright coworking space with plants and big windows', 'fresh daylight, green accents'],
  // Сюжеты
  ['study-room', 'Кабинет с книгами', 'a cozy study with tall bookshelves, a green desk lamp and a leather chair', 'warm amber lamp light, deep wood'],
  ['space', 'Космос', 'a cinematic sci-fi scene in a spacecraft observation deck with a planet and stars outside', 'deep blue, violet and cool highlights'],
  ['spy-night', 'Шпионская ночь', 'a dark rainy alley at night with neon signs and steam, noir mood', 'noir black with red and teal neon'],
  ['old-cinema', 'Старый кинотеатр', 'a vintage movie theatre with red velvet seats and a projector beam', 'deep red velvet and golden beam'],
  // Праздник
  ['birthday', 'День рождения', 'a festive birthday room with balloons, confetti and candles on a cake', 'warm colorful party light'],
  ['new-year', 'Новый год', 'a cozy winter living room with a lit Christmas tree and garlands', 'warm gold lights, deep green and red'],
  ['sunset-terrace', 'Терраса на закате', 'a summer terrace with string lights at sunset and a sea view', 'golden hour with pink sky'],
  ['graduation', 'Выпускной', 'a sunny university courtyard with brick buildings and a festive crowd blurred', 'bright daylight, warm brick'],
].map(([id, title, scene, palette]) => ({ id, title, scene, palette }))

export const shots = [
  { kind: 'wide', ru: 'Общий план', text: 'full-body wide shot, the person is small in the environment, rule of thirds' },
  { kind: 'medium', ru: 'Средний план', text: 'waist-up medium shot, relaxed natural pose, looking slightly off camera' },
  { kind: 'close', ru: 'Крупный план', text: 'close-up portrait, shallow depth of field, 85mm lens, looking at camera' },
  { kind: 'detail', ru: 'Деталь', text: 'detail shot: hands, clothing texture or an object in the scene, no face visible, macro feel' },
  { kind: 'motion', ru: 'В движении', text: 'full-body candid shot while walking, slight motion, different light and time of day' },
]

/** Разные вымышленные люди, чтобы кадры не повторяли одно лицо. */
export const subjects = [
  'a woman in her late 20s with long brown hair',
  'a man in his early 30s with short dark hair and light stubble',
  'a woman in her 40s with a short silver-blonde bob',
  'a man in his 20s with curly hair',
  'a woman in her early 30s with dark skin and braided hair',
  'a man in his 50s with grey hair and glasses',
  'a young woman with freckles and red hair',
  'a man of East Asian appearance in his 30s',
  'a woman of South Asian appearance in her late 20s',
  'a woman in her 60s with elegant white hair',
]

export const style =
  'photorealistic, editorial photography, natural skin texture, realistic hands, cinematic color grading, high detail'
export const negative =
  'text, watermark, logo, signature, deformed hands, extra fingers, distorted face, blurry, oversaturated, cartoon, 3d render'

export function buildJobs() {
  const jobs = []
  locations.forEach((loc, li) => {
    shots.forEach((shot, si) => {
      const subject = subjects[(li * 3 + si) % subjects.length]
      jobs.push({
        id: `${loc.id}-${shot.kind}`,
        location: loc.id,
        kind: shot.kind,
        seed: 1000 + li * 17 + si * 101,
        prompt: `${subject}, ${shot.text}. Location: ${loc.scene}. Palette: ${loc.palette}. ${style}`,
      })
    })
  })
  return jobs
}
