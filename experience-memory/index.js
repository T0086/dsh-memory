import { randomUUID } from 'node:crypto'
import { Config } from './src/config.js'
import { createStore } from './src/store.js'
import { grams, overlap, score, freshness } from './src/score.js'

export { Config }

export const inject = ['commands']

const NOISE = /Current runtime context\.|Time sampled while preparing turn|Current DSH file policy:|Current DeepSeek Harness implementation checkout:|<system-reminder>/
const EMOTION = /(开心|高兴|快乐|难过|伤心|生气|愤怒|焦虑|紧张|累了|疲惫|害怕|惊喜|感动|委屈|烦|爽|痛快)/
const WISH = /(我|我的|我喜欢|我不喜欢|记住|以后|每次|总是|从不|别|不要|想要)/

function dshHome() {
  return process.env.DSH_HOME || String(process.env.USERPROFILE || '')
}

function dayKey(ts) {
  const d = new Date(ts)
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`
}

function textOf(content) {
  if (!Array.isArray(content)) return ''
  return content
    .filter((block) => block && block.type === 'text' && typeof block.text === 'string')
    .map((block) => block.text)
    .join('\n')
    .trim()
}

/** 是否值得记一条：长度、命令、Harness 噪声、代码块都排除。 */
function shouldRemember(text) {
  const t = String(text || '').trim()
  if (t.length < 4 || t.length > 300) return false
  if (t.startsWith('/') || NOISE.test(t)) return false
  if (/^```|^\s*[{[]/.test(t)) return false
  return true
}

function importanceOf(text) {
  let value = 0.4
  if (text.length >= 10) value += 0.1
  if (text.length >= 40) value += 0.1
  if (WISH.test(text)) value += 0.2
  if (/[?？]$/.test(text)) value -= 0.1
  return Math.max(0, Math.min(1, value))
}

export function apply(ctx, config = {}) {
  const settings = { ...Config({}), ...config }
  const store = createStore()
  const recalledBySession = new Map()

  function remember(sessionId, text) {
    if (!settings.enabled) return null
    if (!shouldRemember(text)) return null

    const data = store.load(sessionId)
    const now = Date.now()
    const today = dayKey(now)
    const todayCount = data.memories.filter((m) => dayKey(m.ts) === today).length
    if (todayCount >= Math.max(1, settings.dailyQuota)) return null

    const recent = data.memories.slice(-10)
    if (recent.some((m) => String(m.text).slice(0, 80) === text.slice(0, 80))) return null

    return store.append(sessionId, {
      id: randomUUID(),
      text,
      ts: now,
      importance: importanceOf(text),
      emotion: EMOTION.test(text) ? 0.8 : 0.1,
      lastRecallTs: 0,
    })
  }

  /** 按证据 + 综合分挑出该注入的记忆。 */
  function recall(sessionId, query) {
    const data = store.load(sessionId)
    if (!data.memories.length) return []
    const queryGrams = grams(query)
    if (!queryGrams.size) return []
    const now = Date.now()
    const scored = []
    for (const memory of data.memories) {
      const evidence = overlap(queryGrams, memory.text)
      if (evidence < settings.evidenceGate) continue
      const total = score(memory, now, settings)
      if (total < settings.threshold) continue
      scored.push({ memory, total })
    }
    scored.sort((a, b) => b.total - a.total)

    const picked = []
    let chars = 0
    for (const { memory } of scored) {
      if (picked.length >= Math.max(1, settings.maxItems)) break
      if (chars + memory.text.length > Math.max(120, settings.maxChars)) continue
      picked.push(memory)
      chars += memory.text.length
    }
    return picked
  }

  ctx.on('session/event', (session, event) => {
    if (!session || !session.id) return
    if (session.header && session.header.origin === 'subagent') return
    if (event.type !== 'user/message') return
    const text = textOf(event.data && event.data.content)
    if (!text) return
    remember(session.id, text)
  })

  // 每次 step 前，如果本轮用户消息命中了记忆，就把命中片段作为上下文带进去。
  ctx.on('agent/pre-step', async (payload, next) => {
    const decision = await next()
    if (decision.kind === 'reject' || !settings.enabled) return decision
    const agent = payload && payload.agent
    if (!agent || !agent.session) return decision
    const session = agent.session
    if (session.header && session.header.origin === 'subagent') return decision

    const messages = Array.isArray(decision.messages) ? decision.messages : []
    let query = ''
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      const message = messages[i]
      if (message && message.role === 'user') { query = textOf(message.content); break }
    }
    if (!query) return decision

    let picked = []
    try { picked = recall(session.id, query) } catch { return decision }
    if (!picked.length) return decision

    recalledBySession.set(session.id, Date.now())
    try { store.markRecalled(session.id, new Set(picked.map((m) => m.id))) } catch { /* 活化失败不影响注入 */ }

    const lines = picked.map((m) => `- ${new Date(m.ts).toISOString().slice(0, 10)} ${m.text}`)
    return {
      ...decision,
      messages: [...messages, {
        id: randomUUID(),
        role: 'user',
        content: [{
          type: 'text',
          text: `【记忆片段·只在命中时出现】\n${lines.join('\n')}\n（以上是过往经历里与当前话题相关的几条，自然引用即可，不必逐条复述。）`,
        }],
        source: { kind: 'memory' },
      }],
    }
  })

  try {
    ctx.commands.register({
      name: 'memory',
      description: '经历记忆：查看、搜索、删除；它只记经历，不碰人格',
      input: { hint: '[list|search 词|forget 词|stat]' },
      handler: ({ agent, rawInput }) => {
        const sid = agent && agent.id
        if (!sid) return { kind: 'error', text: '没有可用的会话。' }
        const arg = String(rawInput || '').trim()
        const data = store.load(sid)
        const now = Date.now()

        if (!arg || arg === 'list' || arg === '列表') {
          const rows = [...data.memories].sort((a, b) => score(b, now, settings) - score(a, now, settings)).slice(0, 10)
          if (!rows.length) return { kind: 'success', text: '这个会话还没有经历记忆。' }
          const lines = rows.map((m) => `- ${new Date(m.ts).toISOString().slice(0, 10)} [${(freshness(m, now, settings) * 100).toFixed(0)}%] ${m.text}`)
          return { kind: 'success', text: `经历记忆 ${data.memories.length} 条（按鲜活度排序，最多显示 10 条）：\n${lines.join('\n')}` }
        }

        if (arg.startsWith('search ') || arg.startsWith('搜索 ')) {
          const query = arg.replace(/^(search|搜索)\s+/, '')
          const picked = recall(sid, query)
          if (!picked.length) return { kind: 'success', text: '没有命中相关记忆。' }
          return { kind: 'success', text: '命中的记忆：\n' + picked.map((m) => `- ${new Date(m.ts).toISOString().slice(0, 10)} ${m.text}`).join('\n') }
        }

        if (arg.startsWith('forget ') || arg.startsWith('删除 ')) {
          const keyword = arg.replace(/^(forget|删除)\s+/, '').trim()
          if (!keyword) return { kind: 'error', text: '用法：/memory forget <关键词>' }
          const removed = store.remove(sid, (m) => m.text.includes(keyword) || m.id.startsWith(keyword))
          return { kind: 'success', text: removed ? `已删除 ${removed} 条记忆。` : '没有匹配的记忆。' }
        }

        if (arg === 'stat' || arg === '统计') {
          const today = dayKey(now)
          const todayCount = data.memories.filter((m) => dayKey(m.ts) === today).length
          const last = recalledBySession.get(sid)
          return {
            kind: 'success',
            text: [
              `这个会话共 ${data.memories.length} 条经历记忆。`,
              `今日已记 ${todayCount} / ${settings.dailyQuota} 条。`,
              last ? `最近一次召回：${new Date(last).toISOString().slice(11, 19)}` : '最近一次召回：还没有。',
              `数据目录：${dshHome()}\\experience-memory\\sessions\\`,
            ].join('\n'),
          }
        }

        return { kind: 'error', text: '用法：/memory [list|search 词|forget 词|stat]' }
      },
    })
  } catch (err) {
    try { ctx.logger?.warn?.('[experience-memory] command:', err) } catch { /* 命令注册失败不影响记忆本身 */ }
  }
}
