import {
  atom,
  Box,
  Callout,
  EmptyState,
  Heading,
  host,
  List,
  ListItem,
  on,
  plugin,
  Progress,
  read,
  Row,
  Separator,
  set,
  Stack,
  Text,
  type PanelContext
} from 'orca'
import { rowsOf, type PlanEntry, type Status, type TaskRow } from './plan'
import './protocol'

type Terminal = { id: string; title?: string }

const RAIL = 16
const ROW_GAP = 8

const sources = atom<Terminal[]>([])
const plans = atom<PlanEntry[]>([])
const picked = atom<string | null>(null)
const failure = atom<string | null>(null)

let latest = 0

// A chat has no terminal, so `workspace.changed` never names it; `agents.list` does, by the session id its plan file is named after.
async function chatsOf(): Promise<Terminal[]> {
  const { agents } = await host.call('agents.list')
  return agents.flatMap((agent) => (agent.terminalId === null && agent.sessionId ? [{ id: agent.sessionId, title: agent.title ?? undefined }] : []))
}

async function refresh(shown: readonly Terminal[]): Promise<void> {
  const turn = ++latest
  try {
    const all = [...shown, ...(await chatsOf())]
    const answer = all.length === 0 ? { plans: [] } : await plugin.request('plans.list', { terminals: all.map((t) => t.id) })
    if (turn !== latest) return
    set(sources, all)
    set(plans, answer.plans)
    set(failure, null)
  } catch (error) {
    if (turn !== latest) return
    set(failure, error instanceof Error ? error.message : String(error))
  }
}

export function setup(ctx: PanelContext): void {
  let shown: readonly Terminal[] = []
  ctx.subscriptions.push(
    on('workspace.changed', ({ context }) => {
      shown = context?.terminals ?? []
      void refresh(shown)
    }),
    // The worker stops when idle and its file watch stops with it, so an agent's status change is the second signal that a plan may have moved.
    on('agent.status.changed', () => void refresh(shown)),
    plugin.on('plans.changed', () => void refresh(shown))
  )
}

const toneOf = (status: Status) => (({ pending: 'neutral', in_progress: 'warning', done: 'accent', blocked: 'danger' }) as const)[status]

function Rail({ isDrawn, isGrown = false }: { isDrawn: boolean; isGrown?: boolean }) {
  return (
    <Box width={isGrown ? undefined : RAIL} grow={isGrown} shrink={false} direction="row" justify="center">
      {isDrawn ? <Separator orientation="vertical" /> : null}
    </Box>
  )
}

function TaskLine({ row }: { row: TaskRow }) {
  const isQuiet = row.status === 'done' || row.status === 'pending'
  return (
    <Row gap="none" align="stretch">
      {row.rails.map((isDrawn, depth) => (
        <Rail key={depth} isDrawn={isDrawn} />
      ))}
      <Box width={RAIL} shrink={false} direction="column" align="center">
        {/* A Box background in a tone is a faint tint, too dim for a mark this small, and the success tone glares as text; small text in the accent tone is the quietest filled mark a components panel can draw. */}
        <Text tone={toneOf(row.status)} muted={row.status === 'pending'} size="xs">
          {row.status === 'pending' ? '○' : '●'}
        </Text>
        {row.isJoined ? <Rail isDrawn isGrown /> : null}
      </Box>
      {/* The rows touch so that a rail runs unbroken from one into the next; the space between tasks is inside the row instead. */}
      <Box direction="column" paddingX="xs">
        <Text size="xs" muted={isQuiet} weight={row.status === 'in_progress' ? 'semibold' : 'regular'}>
          {row.title}
        </Text>
        {row.note ? (
          <Text size="xs" muted={row.status !== 'blocked'} tone={row.status === 'blocked' ? 'danger' : 'neutral'}>
            {row.note}
          </Text>
        ) : null}
        <Box height={ROW_GAP} />
      </Box>
    </Row>
  )
}

export default function Panel() {
  const list = read(plans)
  const error = read(failure)
  const names = new Map(read(sources).map((t) => [t.id, t.title]))
  const nameOf = (entry: PlanEntry) => names.get(entry.terminal) || entry.agent || entry.terminal
  const shown = list.find((e) => e.terminal === read(picked)) ?? list[0]
  if (!shown) {
    return (
      <Stack gap="md">
        {error ? <Callout tone="danger" title="Cannot read plans">{error}</Callout> : null}
        <EmptyState title="No plan yet" description="An agent's task plan shows here once it records one." icon="layers" />
      </Stack>
    )
  }
  const { plan } = shown
  return (
    <Stack gap="md">
      {error ? <Callout tone="danger" title="Cannot read plans">{error}</Callout> : null}
      {list.length > 1 ? (
        <List label="Agents with a plan">
          {list.map((entry) => (
            <ListItem
              key={entry.terminal}
              title={nameOf(entry)}
              description={`${entry.plan.percent}% · ${entry.plan.title}`}
              icon="agent"
              current={entry === shown}
              onPress={() => set(picked, entry.terminal)}
            />
          ))}
        </List>
      ) : null}
      <Stack gap="sm">
        <Heading level={3}>{plan.title}</Heading>
        <Progress label="Plan progress" labelHidden value={plan.percent} />
        <Text muted size="xs">{`${plan.percent}% · ${plan.done}/${plan.total} tasks`}</Text>
      </Stack>
      <Stack gap="none">
        {rowsOf(plan).map((row) => (
          <TaskLine key={row.id} row={row} />
        ))}
      </Stack>
    </Stack>
  )
}
