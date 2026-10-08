const SOURCE = 'herdr:claude'
const AGENT = 'claude'

export const SETTLE_POLL_MS = 250
export const SETTLE_MARGIN_MS = 1000
export const SETTLE_LIMIT_MS = 10_000

export type HerdrPane = { bin: string; pane: string }

export const herdrPaneOf = (env: {
  herdr?: string
  pane?: string
  bin?: string
}): HerdrPane | undefined => {
  if (env.herdr !== '1' || !env.pane) return undefined
  return { bin: env.bin || 'herdr', pane: env.pane }
}

export const nextSeq = (nowMs: number, last: bigint) => {
  const now = BigInt(nowMs) * 1_000_000n
  return now > last ? now : last + 1n
}

const identity = ['--source', SOURCE, '--agent', AGENT]

export const pinArgv = ({ bin, pane }: HerdrPane, seq: bigint, sessionId: string) => [
  bin, 'pane', 'report-agent', pane, ...identity,
  '--state', 'idle', '--seq', String(seq), '--agent-session-id', sessionId,
]

export const releaseArgv = ({ bin, pane }: HerdrPane, seq: bigint) => [
  bin, 'pane', 'release-agent', pane, ...identity, '--seq', String(seq),
]

export const sessionArgv = ({ bin, pane }: HerdrPane, seq: bigint, sessionId: string) => [
  bin, 'pane', 'report-agent-session', pane, ...identity,
  '--seq', String(seq), '--agent-session-id', sessionId,
]

export const explainArgv = ({ bin, pane }: HerdrPane) => [bin, 'agent', 'explain', pane, '--json']

export const screenStateOf = (stdout: string) => {
  try {
    return (JSON.parse(stdout) as { state?: unknown }).state
  } catch {
    return undefined
  }
}
