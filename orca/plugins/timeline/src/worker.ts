import { watch, type FSWatcher } from 'node:fs'
import { mkdir, readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import type { OrcaWorkerApi } from 'orca/worker'
import { fileOf, folderOf, parseExport, type PlanEntry } from './plan'
import './protocol'

const SETTLE_MS = 100

let watcher: FSWatcher | undefined
let settle: ReturnType<typeof setTimeout> | undefined

async function readPlans(home: string, terminals: readonly string[], kept: Map<string, PlanEntry>): Promise<PlanEntry[]> {
  const plans: PlanEntry[] = []
  for (const terminal of terminals) {
    const file = fileOf(home, terminal)
    if (file === null) continue
    const read = parseExport(await readFile(file, 'utf8').catch(() => null), terminal)
    const entry = read === undefined ? kept.get(terminal) : read
    if (entry) {
      kept.set(terminal, entry)
      plans.push(entry)
    } else {
      kept.delete(terminal)
    }
  }
  return plans
}

export default async function activate(orca: OrcaWorkerApi): Promise<void> {
  const kept = new Map<string, PlanEntry>()
  orca.panels.handle('plans.list', async ({ terminals }) => ({ plans: await readPlans(homedir(), terminals, kept) }))

  const folder = folderOf(homedir())
  try {
    await mkdir(folder, { recursive: true })
    watcher = watch(folder, () => {
      clearTimeout(settle)
      settle = setTimeout(() => orca.panels.post('plans.changed', {}), SETTLE_MS)
    })
    watcher.on('error', (error) => orca.log(`watch failed: ${String(error)}`))
  } catch (error) {
    orca.log(`cannot watch ${folder}: ${String(error)}`)
  }
}

export function deactivate(): void {
  clearTimeout(settle)
  watcher?.close()
  watcher = undefined
}
