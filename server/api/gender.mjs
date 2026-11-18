/**
 * Правило студии: образ героя соответствует его полу. Мужчина — мужская одежда и стилинг,
 * женщина — женская. Никаких образов противоположного пола (платье на мужчине и т. п.).
 */

/** Женская одежда и стилинг — недопустимы в образе мужчины. */
export const FEMININE_WEAR =
  /\b(dress(es)?|gown|skirt|mini ?skirt|heels?|high heels|stilettos?|pumps|lipstick|make-?up|mascara|eyeliner|blush|blouse|bra|bralette|corset|lace|tiara|veil|bridal|bride|tutu|purse|handbag|clutch|earrings?|necklace|pearls?|leggings|tights|stockings|pantyhose|updo|feminine|girly|camisole|crop top|ballet flats)\b/i

/** Признаки сюжета, задуманного для героини или героя. */
const FEMALE_STORY =
  /\b(bride|bridal|dress|skirt|tiara|veil|ballerina|princess|queen|she|her|woman|women|girl|lady|maiden|mermaid)\b|невест|принцесс|балерин|девушк|королев|русалк|женск/i
const MALE_STORY =
  /\b(groom|tuxedo|beard|he|his|gentleman|boy|king|knight)\b|жених|джентльмен|рыцар|мужск|король/i

/** Для кого сюжет: 'female', 'male' или 'any'. */
export function storyGender(story) {
  const text = [
    story.title,
    story.scene,
    story.blurb,
    ...(story.props ?? []),
    ...(story.beats ?? []).flatMap((b) => [b.ru, b.still, b.motion]),
  ]
    .filter(Boolean)
    .join(' ')
  const female = FEMALE_STORY.test(text)
  const male = MALE_STORY.test(text)
  if (female && !male) return 'female'
  if (male && !female) return 'male'
  return 'any'
}

/** Уточнение промпта для известного пола героя. */
export function genderClause(gender) {
  return gender === 'male'
    ? "He is a man and wears men's clothing with masculine styling, no makeup."
    : "She is a woman and wears women's clothing with feminine styling."
}

/** Негатив против образов противоположного пола. */
export function genderNegative(gender) {
  return gender === 'male'
    ? 'woman, female clothing, dress, skirt, high heels, makeup, lipstick, earrings, cross-dressing, androgynous'
    : 'man, beard, mustache, masculine face, cross-dressing'
}

/**
 * Для задач пользователя пол не задан — его видит модель на загруженных фото.
 * Фраза добавляется в каждый промпт генерации.
 */
export const genderFromReference =
  "Clothing, hairstyle and styling strictly match the gender of the person in the reference photos: a man wears men's clothing with masculine styling, a woman wears women's clothing with feminine styling."

/** Негатив для задач пользователя. */
export const crossDressingNegative =
  'cross-dressing, man wearing a dress, man wearing a skirt, man with makeup, man in high heels, woman with a beard'
