/**
 * Модерация пользовательских сюжетов и песен. Два слоя:
 * 1) быстрый фильтр по словам (RU/EN) — режет очевидное без запроса к модели;
 * 2) проверка языковой моделью по правилам студии. Если модель недоступна — отказ
 *    (fail-closed): лучше попросить повторить, чем пропустить запрещённое.
 * Тот же быстрый фильтр проверяет и то, что написал сам агент (промпты, текст песни).
 */

// \b в JavaScript не видит кириллицу: границы слов для русского — через (?<![а-яё]).
const ru = (body) => `(?<![а-яё])(?:${body})`
const rule = (parts) => new RegExp(parts.join('|'), 'i')

const RULES = [
  [
    'sexual',
    rule([
      ru(
        'порн|эрот|секс|интим|голая|голый|обнаж|раздет|раздева|нагот|нагая|нагой|стриптиз|минет|оргазм|похот|пошлост|сиськ|трусы|трусики|нижн\\S*\\s+бель|лифчик|бюстгальтер|купальник|бикини|фетиш|бдсм|проститу|эскорт',
      ),
      '\\b(porn\\w*|sex|sexy|sexual\\w*|erotic\\w*|nude|nudes|naked|nudity|topless|bottomless|nsfw|lingerie|underwear|bikini|bra|panties|thong|stripper|striptease|fetish|bdsm|hentai|xxx|seductive|sensual|orgasm|genitals?|nipples?|breasts?|cleavage|boobs?|butt|escort|onlyfans)\\b',
    ]),
  ],
  [
    'minors',
    rule([
      ru(
        'детск\\S*\\s*(порн|эрот)|(ребён|ребен|девочк|мальчик|школьн)\\S*\\s+(в\\s+)?(белье|бельё|постел|раздет|голы)',
      ),
      '\\b(loli|lolita|underage|child\\w*\\s+(nude|sexy|porn\\w*))\\b',
    ]),
  ],
  [
    'violence',
    rule([
      ru(
        'убий|убива|расчлен|расстрел|казн(ь|и|ить|ят)(?![а-яё])|пытк|кровав|кровищ|труп(ы|а|ов|ом)?(?![а-яё])|суицид|самоубий|изнасил|резня|теракт',
      ),
      '\\b(gore|gory|bloody|bloodbath|corpses?|dismember\\w*|murder\\w*|suicide|self-harm|tortur\\w*|beheading|massacre|rape|raped)\\b',
    ]),
  ],
  [
    'extremism',
    rule([
      ru('нацис|нацизм|свастик|третий\\s*рейх|игил|джихад|террорист|фашист|гитлер'),
      '\\b(nazis?|nazism|swastika|third reich|isis|jihad\\w*|terrorists?|kkk|hitler|white power)\\b',
    ]),
  ],
  [
    'drugs',
    rule([
      ru('наркот|кокаин|героин|метамфет|мефедрон|амфетамин|закладк'),
      '\\b(cocaine|heroin|meth|methamphetamine|drug dealer|snorting)\\b',
    ]),
  ],
  [
    'real_people',
    rule([
      ru('путин|зеленск|трамп|байден|навальн|илон\\s*маск|тейлор\\s*свифт|дипфейк'),
      '\\b(putin|zelensky|zelenskyy|trump|biden|elon musk|taylor swift|deepfake)\\b',
    ]),
  ],
]

const MESSAGES = {
  sexual: 'Студия не создаёт откровенные и эротические сюжеты, бельё и наготу.',
  minors: 'Сюжеты с детьми в недопустимом контексте запрещены.',
  violence: 'Сцены насилия, крови и жестокости студия не создаёт.',
  extremism: 'Экстремистская символика и призывы к ненависти запрещены.',
  drugs: 'Наркотики и их употребление в сюжетах запрещены.',
  real_people:
    'Нельзя создавать сюжеты с известными людьми и политиками — только с вами на ваших фото.',
  other: 'Этот сюжет нарушает правила студии.',
}

/** Быстрая проверка по словам. */
export function quickCheck(text) {
  const value = String(text ?? '')
  for (const [category, re] of RULES)
    if (re.test(value)) return { ok: false, category, message: MESSAGES[category] }
  return { ok: true }
}

export const RULES_TEXT =
  'Запрещено: сексуальный и эротический контент, нагота, бельё, купальники, откровенные позы и намёки; ' +
  'любые дети в романтическом или сексуальном контексте; насилие, кровь, оружие против людей, самоповреждение; ' +
  'экстремизм, ненависть, нацистская символика; наркотики; незаконные действия; известные люди, политики, ' +
  'знаменитости и дипфейки реальных людей (кроме самого пользователя на его фото); политическая агитация; ' +
  'образы противоположного пола (мужчина в женской одежде и наоборот). ' +
  'Разрешено: красивые, добрые, кинематографичные, праздничные, путешествия, мода (одетые), спорт, фэнтези, профессии, романтика пары без интима.'

/** Полная проверка: слова + языковая модель. Возвращает { ok, category?, message? }. */
export async function moderate(llm, text, { localModel } = {}) {
  const quick = quickCheck(text)
  if (!quick.ok) return quick
  let verdict
  try {
    const { data } = await llm.chat(
      [
        {
          role: 'system',
          content: `Ты модератор AI-фотостудии. Проверь запрос пользователя на соответствие правилам. ${RULES_TEXT} Отвечай только JSON {"allowed": true|false, "category": "sexual|minors|violence|extremism|drugs|real_people|other|none", "reason": "коротко по-русски"}. Если сомневаешься — allowed=false.`,
        },
        { role: 'user', content: String(text).slice(0, 2000) },
      ],
      { json: true, localModel },
    )
    verdict = data
  } catch {
    return {
      ok: false,
      category: 'unavailable',
      message: 'Проверка сюжета сейчас недоступна. Попробуйте через минуту.',
    }
  }
  if (verdict?.allowed === true) return { ok: true }
  const category = MESSAGES[verdict?.category] ? verdict.category : 'other'
  return { ok: false, category, message: MESSAGES[category] }
}
