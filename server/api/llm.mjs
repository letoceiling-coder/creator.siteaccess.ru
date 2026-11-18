/**
 * Языковая модель для текстов и сценариев агента публикаций.
 * Сначала — бесплатные модели OpenRouter (только с нулевой ценой, через тот же прокси, что и
 * Telegram); если ключа нет, лимит исчерпан или модели недоступны — модель Ollama на сервере.
 */
import { execFile } from 'node:child_process'

const OPENROUTER = process.env.OPENROUTER_URL ?? 'https://openrouter.ai/api/v1'
const PROXY = process.env.OPENROUTER_PROXY ?? process.env.TELEGRAM_PROXY ?? ''
const OLLAMA = process.env.OLLAMA_URL ?? 'http://127.0.0.1:11434'
const MODELS_TTL = 6 * 3_600_000

/** Предпочтения среди бесплатных моделей: сильные в русском тексте — первыми. */
const PREFERRED = [
  'gemma-4-31b',
  'deepseek',
  'qwen',
  'nemotron-3-ultra',
  'gemma-4',
  'nemotron-3.5-super',
  'ernie',
  'llama',
  'mistral',
  'glm',
  'kimi',
]
/** Маленькие, «кодовые» и узкие модели плохо пишут анонсы — их не берём. */
const UNSUITABLE = /code|coder|nano|\b1\.7b\b|-1b\b|-3b\b|omni|guard|embed/i

const quote = (s) =>
  `"${String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\r/g, '\\r')}"`

/** Запрос через curl: ключ и тело — через stdin (не видны в списке процессов), прокси — как у Telegram. */
function curlJson(url, { key, body, timeoutSec }) {
  return new Promise((resolve, reject) => {
    const args = ['-s', '-m', String(timeoutSec), '-K', '-']
    if (PROXY) args.unshift('-x', PROXY)
    const lines = [`url = ${quote(url)}`, `header = ${quote(`Authorization: Bearer ${key}`)}`]
    // stdin занят настройками (-K), поэтому тело запроса — тоже строкой настроек.
    if (body)
      lines.push(
        'header = "Content-Type: application/json"',
        `data-binary = ${quote(JSON.stringify(body))}`,
      )
    const child = execFile('curl', args, { maxBuffer: 16 * 1024 * 1024 })
    let out = ''
    child.stdout.setEncoding('utf8')
    child.stdout.on('data', (d) => (out += d))
    child.on('error', reject)
    child.on('close', (code) => {
      if (code !== 0) return reject(new Error(`сеть (curl ${code})`))
      try {
        resolve(JSON.parse(out))
      } catch {
        reject(new Error('непонятный ответ'))
      }
    })
    child.stdin.end(lines.join('\n') + '\n')
  })
}

export function llmModule({ accounts, log }) {
  const cache = { at: 0, models: [] }

  const cfg = () => accounts.getSetting('integrations').openrouter ?? {}

  /** Бесплатные модели OpenRouter: явный список из админки или найденные по цене 0. */
  async function freeModels(key) {
    const manual = String(cfg().models ?? '')
      .split(/[\s,]+/)
      .filter((m) => m.endsWith(':free'))
    if (manual.length) return manual
    if (Date.now() - cache.at < MODELS_TTL && cache.models.length) return cache.models
    const res = await curlJson(`${OPENROUTER}/models`, { key, timeoutSec: 30 })
    const free = (res.data ?? []).filter(
      (m) =>
        m.id.endsWith(':free') &&
        !UNSUITABLE.test(m.id) &&
        Number(m.pricing?.prompt) === 0 &&
        Number(m.pricing?.completion) === 0 &&
        (m.context_length ?? 0) >= 8000 &&
        (m.architecture?.output_modalities ?? ['text']).includes('text'),
    )
    const rank = (id) => {
      const i = PREFERRED.findIndex((p) => id.includes(p))
      return i < 0 ? PREFERRED.length : i
    }
    cache.models = free
      .map((m) => m.id)
      .sort((a, b) => rank(a) - rank(b))
      .slice(0, 5)
    cache.at = Date.now()
    return cache.models
  }

  async function viaOpenRouter(messages, json) {
    const key = cfg().apiKey
    if (!cfg().enabled || !key) throw new Error('OpenRouter не подключён')
    const models = await freeModels(key)
    if (!models.length) throw new Error('нет бесплатных моделей')
    let last = new Error('нет ответа')
    for (const model of models) {
      try {
        const res = await curlJson(`${OPENROUTER}/chat/completions`, {
          key,
          timeoutSec: 90,
          body: {
            model,
            messages,
            temperature: 0.85,
            ...(json ? { response_format: { type: 'json_object' } } : {}),
          },
        })
        if (res.error) throw new Error(res.error.message ?? 'ошибка модели')
        const text = res.choices?.[0]?.message?.content
        if (!text) throw new Error('пустой ответ')
        return { text, model: `openrouter:${model}` }
      } catch (error) {
        last = new Error(`${model}: ${error.message}`)
      }
    }
    throw last
  }

  async function viaOllama(messages, json, model) {
    const res = await fetch(`${OLLAMA}/api/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      signal: AbortSignal.timeout(180_000),
      body: JSON.stringify({
        model,
        stream: false,
        think: false,
        ...(json ? { format: 'json' } : {}),
        options: { temperature: 0.85 },
        messages,
      }),
    })
    const data = await res.json()
    if (!data.message?.content) throw new Error(data.error ?? 'пустой ответ')
    return { text: data.message.content, model: `ollama:${model}` }
  }

  return {
    /** Ответ модели (JSON-объект при json=true) и то, какая модель ответила. */
    async chat(messages, { json = false, localModel } = {}) {
      let result
      try {
        result = await viaOpenRouter(messages, json)
      } catch (error) {
        if (!/не подключён/.test(error.message))
          log(`OpenRouter → серверная модель (${error.message})`)
        result = await viaOllama(messages, json, localModel)
      }
      if (!json) return result
      // Модели иногда оборачивают JSON в ```json … ```.
      const raw = result.text.replace(/^```(?:json)?\s*|\s*```$/g, '').trim()
      const start = raw.indexOf('{')
      const end = raw.lastIndexOf('}')
      return { ...result, data: JSON.parse(raw.slice(start, end + 1)) }
    },
  }
}
