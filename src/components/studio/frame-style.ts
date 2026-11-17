export type Ratio = '9:16' | '16:9' | '1:1'

const ratios: Record<Ratio, [number, number]> = {
  '9:16': [9, 16],
  '16:9': [16, 9],
  '1:1': [1, 1],
}

/** Рамка точно в пропорциях ролика: ширина ограничена высотой, поэтому кадр не обрезается. */
export function frameStyle(ratio: Ratio, maxHeight = '68dvh') {
  const [w, h] = ratios[ratio]
  return { aspectRatio: `${w} / ${h}`, maxWidth: `min(100%, calc(${maxHeight} * ${w} / ${h}))` }
}
