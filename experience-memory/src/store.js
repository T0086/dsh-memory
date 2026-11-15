import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

function dshHome() {
  return process.env.DSH_HOME || join(homedir(), '.dsh')
}

/** 一个会话一份 JSON：经历记忆和人格数据完全分开存。 */
export function createStore() {
  const root = () => join(dshHome(), 'experience-memory', 'sessions')

  function fileOf(sessionId) {
    return join(root(), `${String(sessionId).replace(/[^\w.-]+/g, '_')}.json`)
  }

  function load(sessionId) {
    try {
      const data = JSON.parse(readFileSync(fileOf(sessionId), 'utf8'))
      if (data && Array.isArray(data.memories)) return data
    } catch { /* 没有或坏了：当作空 */ }
    return { version: 1, sessionId, memories: [] }
  }

  function save(sessionId, data) {
    try {
      mkdirSync(root(), { recursive: true })
      const file = fileOf(sessionId)
      const tmp = `${file}.tmp`
      writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8')
      renameSync(tmp, file)
    } catch { /* 写不了不影响对话 */ }
  }

  function append(sessionId, memory) {
    const data = load(sessionId)
    data.memories.push(memory)
    save(sessionId, data)
    return memory
  }

  function markRecalled(sessionId, ids) {
    const data = load(sessionId)
    const now = Date.now()
    for (const memory of data.memories) {
      if (ids.has(memory.id)) memory.lastRecallTs = now
    }
    save(sessionId, data)
  }

  function remove(sessionId, predicate) {
    const data = load(sessionId)
    const before = data.memories.length
    data.memories = data.memories.filter((memory) => !predicate(memory))
    if (data.memories.length !== before) save(sessionId, data)
    return before - data.memories.length
  }

  return { load, save, append, markRecalled, remove }
}
