import { randomUUID } from "node:crypto"
import { mkdir, readFile, rename, writeFile } from "node:fs/promises"
import { dirname, join } from "node:path"

export type GoalStatus = "active" | "paused" | "complete" | "blocked" | "cleared"

export type Goal = {
  sessionID: string
  objective: string
  status: GoalStatus
  createdAt: string
  updatedAt: string
  /** Agent and model chosen for the session when the goal was created. */
  agent?: string
  model?: { providerID: string; modelID: string }
  evidence?: string
  blocker?: string
  blockerReport?: {
    reason: string
    normalizedReason: string
    count: number
    lastReportedAt: string
  }
}

type GoalFile = { version: 1; goals: Record<string, Goal> }

// Writes are whole-file read/modify/write operations. Keep them serial per path
// so concurrent sessions in this plugin process cannot overwrite each other.
const writes = new Map<string, Promise<void>>()

export function statePath() {
  return process.env.KILO_GOAL_STATE_PATH ?? join(process.env.XDG_STATE_HOME ?? join(process.env.HOME ?? ".", ".local", "state"), "kilo-goal-plugin", "goals.json")
}

export async function readGoals(path = statePath()): Promise<GoalFile> {
  try {
    const parsed = JSON.parse(await readFile(path, "utf8")) as GoalFile
    return parsed.version === 1 && parsed.goals ? parsed : { version: 1, goals: {} }
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { version: 1, goals: {} }
    throw error
  }
}

export async function saveGoal(goal: Goal, path = statePath()) {
  const previous = writes.get(path) ?? Promise.resolve()
  let release!: () => void
  const current = new Promise<void>((resolve) => { release = resolve })
  writes.set(path, current)

  await previous
  try {
    const data = await readGoals(path)
    data.goals[goal.sessionID] = goal
    await mkdir(dirname(path), { recursive: true })
    const temporary = `${path}.${process.pid}.${randomUUID()}.tmp`
    await writeFile(temporary, `${JSON.stringify(data, null, 2)}\n`, "utf8")
    await rename(temporary, path)
  } finally {
    release()
    if (writes.get(path) === current) writes.delete(path)
  }
  return goal
}

export async function getGoal(sessionID: string) {
  return (await readGoals()).goals[sessionID]
}

export function formatGoal(goal: Goal | undefined) {
  if (!goal || goal.status === "cleared") return "No goal set for this session."
  const details = [
    `Goal: ${goal.objective}`,
    `Status: ${goal.status}`,
    `Started: ${goal.createdAt}`,
  ]
  if (goal.evidence) details.push(`Evidence: ${goal.evidence}`)
  if (goal.blocker) details.push(`Blocker: ${goal.blocker}`)
  return details.join("\n")
}
