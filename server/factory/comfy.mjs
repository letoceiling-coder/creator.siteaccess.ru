/** Клиент ComfyUI: постановка задач, ожидание, получение файла. */
export const COMFY = process.env.COMFY_URL ?? 'http://127.0.0.1:8188'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

export async function freeVram() {
  const res = await fetch(`${COMFY}/system_stats`)
  const { devices } = await res.json()
  const gpu = devices.find((d) => d.type === 'cuda') ?? devices[0]
  return gpu.vram_free
}

/** Рабочий процесс Qwen-Image 2512 + Lightning 4 шага: фото по тексту. */
export function qwenImageWorkflow({ prompt, negative = '', width, height, seed, prefix }) {
  return {
    1: {
      class_type: 'UNETLoader',
      inputs: { unet_name: 'qwen_image_2512_fp8_e4m3fn.safetensors', weight_dtype: 'default' },
    },
    2: {
      class_type: 'CLIPLoader',
      inputs: {
        clip_name: 'qwen_2.5_vl_7b_fp8_scaled.safetensors',
        type: 'qwen_image',
        device: 'default',
      },
    },
    3: { class_type: 'VAELoader', inputs: { vae_name: 'qwen_image_vae.safetensors' } },
    4: {
      class_type: 'LoraLoaderModelOnly',
      inputs: {
        model: ['1', 0],
        lora_name: 'Qwen-Image-2512-Lightning-4steps-V1.0-fp32.safetensors',
        strength_model: 1,
      },
    },
    5: { class_type: 'ModelSamplingAuraFlow', inputs: { model: ['4', 0], shift: 3.1 } },
    6: { class_type: 'CLIPTextEncode', inputs: { clip: ['2', 0], text: prompt } },
    7: { class_type: 'CLIPTextEncode', inputs: { clip: ['2', 0], text: negative } },
    8: { class_type: 'EmptySD3LatentImage', inputs: { width, height, batch_size: 1 } },
    9: {
      class_type: 'KSampler',
      inputs: {
        model: ['5', 0],
        positive: ['6', 0],
        negative: ['7', 0],
        latent_image: ['8', 0],
        seed,
        steps: 4,
        cfg: 1,
        sampler_name: 'euler',
        scheduler: 'simple',
        denoise: 1,
      },
    },
    10: { class_type: 'VAEDecode', inputs: { samples: ['9', 0], vae: ['3', 0] } },
    11: { class_type: 'SaveImage', inputs: { images: ['10', 0], filename_prefix: prefix } },
  }
}

const OLLAMA = process.env.OLLAMA_URL ?? 'http://127.0.0.1:11434'

/**
 * ComfyUI делит видеокарту с Ollama (языковые модели других сервисов сервера). Модель Ollama
 * занимает до 21 ГБ из 24 — генерация падает по памяти. Перед задачей выгружаем модели Ollama
 * из GPU: при следующем запросе Ollama загрузит их снова.
 */
export async function releaseOllama() {
  try {
    const ps = await (await fetch(`${OLLAMA}/api/ps`, { signal: AbortSignal.timeout(3000) })).json()
    const loaded = (ps.models ?? []).filter((m) => (m.size_vram ?? 0) > 512 * 1024 * 1024)
    for (const m of loaded)
      await fetch(`${OLLAMA}/api/generate`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ model: m.name, keep_alive: 0 }),
        signal: AbortSignal.timeout(30_000),
      })
    if (loaded.length) await sleep(1500)
    return loaded.map((m) => m.name)
  } catch {
    return []
  }
}

/** Понятная ошибка ComfyUI вместо трассировки на десятки строк. */
function describe(message) {
  const [kind, data] = Array.isArray(message) ? message : []
  if (kind !== 'execution_error' || !data) return 'Ошибка генерации'
  if (
    /OutOfMemory/i.test(data.exception_type ?? '') ||
    /out of memory/i.test(data.exception_message ?? '')
  )
    return 'Не хватило видеопамяти GPU'
  const first = String(data.exception_message ?? '')
    .split('\n')[0]
    .slice(0, 200)
  return `Ошибка генерации (${data.node_type ?? 'узел'}): ${first}`
}

class GpuMemoryError extends Error {}

async function runOnce(workflow, { timeoutMs, front }) {
  await releaseOllama()
  const res = await fetch(`${COMFY}/prompt`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ prompt: workflow, client_id: 'creator-factory', front }),
  })
  if (!res.ok)
    throw new Error(`ComfyUI отклонил задачу: ${res.status} ${(await res.text()).slice(0, 300)}`)
  const { prompt_id: id } = await res.json()
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    await sleep(1500)
    const h = await (await fetch(`${COMFY}/history/${id}`)).json()
    const entry = h[id]
    if (entry?.status?.status_str === 'error') {
      const text = describe(entry.status.messages?.find((m) => m[0] === 'execution_error'))
      throw text === 'Не хватило видеопамяти GPU' ? new GpuMemoryError(text) : new Error(text)
    }
    if (entry?.outputs) {
      const files = Object.values(entry.outputs).flatMap((o) => [
        ...(o.images ?? []),
        ...(o.gifs ?? []),
        ...(o.audio ?? []),
      ])
      if (files.length) return files
    }
  }
  throw new Error('Время ожидания генерации истекло')
}

export async function runWorkflow(workflow, { timeoutMs = 900_000, front = false } = {}) {
  try {
    return await runOnce(workflow, { timeoutMs, front })
  } catch (error) {
    // Память заняли между проверкой и запуском — освобождаем ещё раз и повторяем.
    if (!(error instanceof GpuMemoryError)) throw error
    await fetch(`${COMFY}/free`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ unload_models: true, free_memory: true }),
    }).catch(() => {})
    await sleep(5000)
    return runOnce(workflow, { timeoutMs, front })
  }
}

export async function download(file) {
  const q = new URLSearchParams({
    filename: file.filename,
    subfolder: file.subfolder ?? '',
    type: file.type ?? 'output',
  })
  const res = await fetch(`${COMFY}/view?${q}`)
  if (!res.ok) throw new Error(`Не удалось получить ${file.filename}`)
  return Buffer.from(await res.arrayBuffer())
}

/** ACE-Step 1.5 XL Turbo: инструментальный трек по описанию, темпу и тональности. */
export function aceMusicWorkflow({ tags, bpm, seconds, keyscale, seed, prefix }) {
  return {
    1: {
      class_type: 'UNETLoader',
      inputs: { unet_name: 'acestep_v1.5_xl_turbo_bf16.safetensors', weight_dtype: 'default' },
    },
    2: {
      class_type: 'DualCLIPLoader',
      inputs: {
        clip_name1: 'qwen_0.6b_ace15.safetensors',
        clip_name2: 'qwen_4b_ace15.safetensors',
        type: 'ace',
        device: 'default',
      },
    },
    3: { class_type: 'VAELoader', inputs: { vae_name: 'ace_1.5_vae.safetensors' } },
    4: { class_type: 'ModelSamplingAuraFlow', inputs: { model: ['1', 0], shift: 3 } },
    5: {
      class_type: 'TextEncodeAceStepAudio1.5',
      inputs: {
        clip: ['2', 0],
        tags,
        lyrics: '[Instrumental]',
        seed,
        bpm,
        duration: seconds,
        timesignature: '4',
        language: 'en',
        keyscale,
        generate_audio_codes: true,
        cfg_scale: 2,
        temperature: 0.85,
        top_p: 0.9,
        top_k: 0,
        min_p: 0,
      },
    },
    6: { class_type: 'ConditioningZeroOut', inputs: { conditioning: ['5', 0] } },
    7: { class_type: 'EmptyAceStep1.5LatentAudio', inputs: { seconds, batch_size: 1 } },
    8: {
      class_type: 'KSampler',
      inputs: {
        model: ['4', 0],
        positive: ['5', 0],
        negative: ['6', 0],
        latent_image: ['7', 0],
        seed,
        steps: 8,
        cfg: 1,
        sampler_name: 'euler',
        scheduler: 'simple',
        denoise: 1,
      },
    },
    9: { class_type: 'VAEDecodeAudio', inputs: { samples: ['8', 0], vae: ['3', 0] } },
    10: {
      class_type: 'SaveAudioMP3',
      inputs: { audio: ['9', 0], filename_prefix: prefix, quality: '320k' },
    },
  }
}

/** Загрузка картинки во входную папку ComfyUI, возвращает имя для LoadImage. */
export async function uploadImage(buffer, name) {
  const form = new FormData()
  form.append('image', new Blob([buffer], { type: 'image/png' }), name)
  form.append('overwrite', 'true')
  const res = await fetch(`${COMFY}/upload/image`, { method: 'POST', body: form })
  if (!res.ok) throw new Error(`Загрузка картинки не удалась: ${res.status}`)
  return (await res.json()).name
}

/** Wan 2.2 14B image-to-video с LoRA на 4 шага: короткий ролик из кадра. */
export function wanVideoWorkflow({
  image,
  prompt,
  negative = '',
  width,
  height,
  frames = 81,
  seed,
  prefix,
  finish = false,
}) {
  const lora = (model, name) => ({
    class_type: 'LoraLoaderModelOnly',
    inputs: { model, lora_name: name, strength_model: 1 },
  })
  return {
    1: {
      class_type: 'UNETLoader',
      inputs: {
        unet_name: 'wan2.2_i2v_high_noise_14B_fp8_scaled.safetensors',
        weight_dtype: 'default',
      },
    },
    2: {
      class_type: 'UNETLoader',
      inputs: {
        unet_name: 'wan2.2_i2v_low_noise_14B_fp8_scaled.safetensors',
        weight_dtype: 'default',
      },
    },
    3: {
      class_type: 'CLIPLoader',
      inputs: {
        clip_name: 'umt5_xxl_fp8_e4m3fn_scaled.safetensors',
        type: 'wan',
        device: 'default',
      },
    },
    4: { class_type: 'VAELoader', inputs: { vae_name: 'wan_2.1_vae.safetensors' } },
    5: lora(['1', 0], 'wan2.2_i2v_lightx2v_4steps_lora_v1_high_noise.safetensors'),
    6: lora(['2', 0], 'wan2.2_i2v_lightx2v_4steps_lora_v1_low_noise.safetensors'),
    7: { class_type: 'ModelSamplingSD3', inputs: { model: ['5', 0], shift: 5 } },
    8: { class_type: 'ModelSamplingSD3', inputs: { model: ['6', 0], shift: 5 } },
    9: { class_type: 'CLIPTextEncode', inputs: { clip: ['3', 0], text: prompt } },
    10: { class_type: 'CLIPTextEncode', inputs: { clip: ['3', 0], text: negative } },
    11: { class_type: 'LoadImage', inputs: { image } },
    12: {
      class_type: 'WanImageToVideo',
      inputs: {
        positive: ['9', 0],
        negative: ['10', 0],
        vae: ['4', 0],
        width,
        height,
        length: frames,
        batch_size: 1,
        start_image: ['11', 0],
      },
    },
    13: {
      class_type: 'KSamplerAdvanced',
      inputs: {
        model: ['7', 0],
        add_noise: 'enable',
        noise_seed: seed,
        steps: 4,
        cfg: 1,
        sampler_name: 'euler',
        scheduler: 'simple',
        positive: ['12', 0],
        negative: ['12', 1],
        latent_image: ['12', 2],
        start_at_step: 0,
        end_at_step: 2,
        return_with_leftover_noise: 'enable',
      },
    },
    14: {
      class_type: 'KSamplerAdvanced',
      inputs: {
        model: ['8', 0],
        add_noise: 'disable',
        noise_seed: seed,
        steps: 4,
        cfg: 1,
        sampler_name: 'euler',
        scheduler: 'simple',
        positive: ['12', 0],
        negative: ['12', 1],
        latent_image: ['13', 0],
        start_at_step: 2,
        end_at_step: 10000,
        return_with_leftover_noise: 'disable',
      },
    },
    15: { class_type: 'VAEDecode', inputs: { samples: ['14', 0], vae: ['4', 0] } },
    // finish: Real-ESRGAN ×2 и RIFE 4.9 ×2 (16 → 32 кадра/с) — ролик как после постпродакшна.
    ...(finish
      ? {
          18: { class_type: 'UpscaleModelLoader', inputs: { model_name: 'RealESRGAN_x2plus.pth' } },
          19: {
            class_type: 'ImageUpscaleWithModel',
            inputs: { upscale_model: ['18', 0], image: ['15', 0] },
          },
          20: {
            class_type: 'RIFE VFI',
            inputs: {
              frames: ['19', 0],
              ckpt_name: 'rife49.pth',
              clear_cache_after_n_frames: 10,
              multiplier: 2,
              fast_mode: true,
              ensemble: true,
              scale_factor: 1,
              dtype: 'float16',
              torch_compile: false,
              batch_size: 1,
            },
          },
        }
      : {}),
    16: {
      class_type: 'CreateVideo',
      inputs: { images: [finish ? '20' : '15', 0], fps: finish ? 32 : 16 },
    },
    17: {
      class_type: 'SaveVideo',
      inputs: { video: ['16', 0], filename_prefix: prefix, format: 'auto', codec: 'auto' },
    },
  }
}

/**
 * Qwen-Image-Edit 2511 + Lightning 4 шага: человек с загруженного фото переносится в сцену.
 * `images` — имена до трёх загруженных файлов (LoadImage); первое задаёт размер результата.
 */
export function qwenEditWorkflow({
  images,
  prompt,
  negative = '',
  seed,
  prefix,
  width,
  height,
  upscale,
  fast = true,
}) {
  // fast — Lightning 4 шага (быстро); без него 20 шагов с CFG: лицо точнее, но в ~4 раза дольше.
  const load = {}
  const encode = { clip: ['2', 0], prompt, vae: ['3', 0] }
  const negEncode = { clip: ['2', 0], prompt: negative, vae: ['3', 0] }
  images.slice(0, 3).forEach((name, i) => {
    load[`2${i}`] = { class_type: 'LoadImage', inputs: { image: name } }
    load[`3${i}`] = {
      class_type: 'ImageScaleToTotalPixels',
      inputs: {
        image: [`2${i}`, 0],
        upscale_method: 'lanczos',
        megapixels: 1,
        resolution_steps: 1,
      },
    }
    encode[`image${i + 1}`] = [`3${i}`, 0]
    negEncode[`image${i + 1}`] = [`3${i}`, 0]
  })
  return {
    1: {
      class_type: 'UNETLoader',
      inputs: { unet_name: 'qwen_image_edit_2511_fp8mixed.safetensors', weight_dtype: 'default' },
    },
    2: {
      class_type: 'CLIPLoader',
      inputs: {
        clip_name: 'qwen_2.5_vl_7b_fp8_scaled.safetensors',
        type: 'qwen_image',
        device: 'default',
      },
    },
    3: { class_type: 'VAELoader', inputs: { vae_name: 'qwen_image_vae.safetensors' } },
    4: {
      class_type: 'LoraLoaderModelOnly',
      inputs: {
        model: ['1', 0],
        lora_name: 'Qwen-Image-Edit-2511-Lightning-4steps-V1.0-bf16.safetensors',
        strength_model: 1,
      },
    },
    5: {
      class_type: 'ModelSamplingAuraFlow',
      inputs: { model: fast ? ['4', 0] : ['1', 0], shift: 3 },
    },
    6: { class_type: 'CFGNorm', inputs: { model: ['5', 0], strength: 1 } },
    ...load,
    7: { class_type: 'TextEncodeQwenImageEditPlus', inputs: encode },
    8: { class_type: 'TextEncodeQwenImageEditPlus', inputs: negEncode },
    9:
      width && height
        ? { class_type: 'EmptySD3LatentImage', inputs: { width, height, batch_size: 1 } }
        : { class_type: 'VAEEncode', inputs: { pixels: ['30', 0], vae: ['3', 0] } },
    10: {
      class_type: 'KSampler',
      inputs: {
        model: ['6', 0],
        positive: ['7', 0],
        negative: ['8', 0],
        latent_image: ['9', 0],
        seed,
        steps: fast ? 4 : 20,
        cfg: fast ? 1 : 4,
        sampler_name: 'euler',
        scheduler: 'simple',
        denoise: 1,
      },
    },
    11: { class_type: 'VAEDecode', inputs: { samples: ['10', 0], vae: ['3', 0] } },
    ...(upscale
      ? {
          13: { class_type: 'UpscaleModelLoader', inputs: { model_name: upscale } },
          14: {
            class_type: 'ImageUpscaleWithModel',
            inputs: { upscale_model: ['13', 0], image: ['11', 0] },
          },
        }
      : {}),
    12: {
      class_type: 'SaveImage',
      inputs: { images: [upscale ? '14' : '11', 0], filename_prefix: prefix },
    },
  }
}
