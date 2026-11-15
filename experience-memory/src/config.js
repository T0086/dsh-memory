import z from '@deepseek-ai/schemastery'

/**
 * 经历记忆的配置。原则：默认值照"会淡忘"的模型走，用户只需要调几个旋钮。
 */
export const Config = z.object({
  // 总开关（1 开 / 0 关）。
  enabled: z.number().default(1),
  // 每个会话每天最多记几条，防止把上下文塞满。
  dailyQuota: z.number().default(8),
  // 一次最多注入几条、总共不超过多少字。
  maxItems: z.number().default(6),
  maxChars: z.number().default(800),
  // 证据门槛：命中词的重合度低于它就不算"想想起来了"。
  evidenceGate: z.number().default(0.2),
  // 综合分门槛：低于它不注入。
  threshold: z.number().default(0.3),
  // 半衰期（天）：越久越淡，但不删。
  baseHalfLifeDays: z.number().default(30),
  emotionHalfLifeDays: z.number().default(7),
  // 打分权重，四项合计 1。
  baselineWeight: z.number().default(0.55),
  activationWeight: z.number().default(0.25),
  importanceWeight: z.number().default(0.15),
  emotionWeight: z.number().default(0.05),
})
