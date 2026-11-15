export const DAY = 86400000

/** 中文按 2-gram 切，英文/数字按空白切词。 */
export function grams(text) {
  const s = String(text || '').toLowerCase()
  const out = new Set()
  for (const word of s.match(/[a-z0-9]{2,}/g) || []) out.add(word)
  for (let i = 0; i + 1 < s.length; i += 1) {
    const pair = s.slice(i, i + 2)
    if (/[\u4e00-\u9fa5]/.test(pair)) out.add(pair)
  }
  return out
}

/** 两份文本的重合度：命中词数 / 较小集合大小。 */
export function overlap(a, b) {
  const left = a instanceof Set ? a : grams(a)
  const right = b instanceof Set ? b : grams(b)
  if (!left.size || !right.size) return 0
  let hit = 0
  for (const g of left) if (right.has(g)) hit += 1
  return hit / Math.min(left.size, right.size)
}

/** 鲜活度：基础衰减 + 情绪加成；不删除，只是越来越难想起来。 */
export function freshness(memory, now, config) {
  const age = Math.max(0, now - (memory.ts || now))
  const base = Math.exp(-age / Math.max(1, config.baseHalfLifeDays) / DAY)
  const emotion = (memory.emotion || 0) * Math.exp(-age / Math.max(1, config.emotionHalfLifeDays) / DAY)
  return Math.min(1, base + emotion * 0.5)
}

/** 最近被想起来的程度：越久没被召回越低。 */
export function activation(memory, now) {
  if (!memory.lastRecallTs) return 0.5
  const age = Math.max(0, now - memory.lastRecallTs)
  return Math.exp(-age / (7 * DAY))
}

/** 综合分：鲜活度、活化、重要度、情绪。 */
export function score(memory, now, config) {
  return config.baselineWeight * freshness(memory, now, config)
    + config.activationWeight * activation(memory, now)
    + config.importanceWeight * (memory.importance || 0.5)
    + config.emotionWeight * (memory.emotion || 0)
}
