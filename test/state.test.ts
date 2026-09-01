import { expect, test } from "bun:test"
import { mkdtemp } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { getGoal, readGoals, saveGoal } from "../src/state.js"

test("persists a goal by session ID", async () => {
  const directory = await mkdtemp(join(tmpdir(), "kilo-goal-plugin-"))
  const path = join(directory, "goals.json")
  const goal = {
    sessionID: "session-1",
    objective: "tests pass",
    status: "active" as const,
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
    agent: "code",
    model: { providerID: "poe", modelID: "openai/gpt-5.3-codex" },
  }

  await saveGoal(goal, path)
  expect((await readGoals(path)).goals[goal.sessionID]).toEqual(goal)

  const previous = process.env.KILO_GOAL_STATE_PATH
  process.env.KILO_GOAL_STATE_PATH = path
  expect(await getGoal(goal.sessionID)).toEqual(goal)
  if (previous === undefined) delete process.env.KILO_GOAL_STATE_PATH
  else process.env.KILO_GOAL_STATE_PATH = previous
})

test("preserves simultaneous writes for different sessions", async () => {
  const directory = await mkdtemp(join(tmpdir(), "kilo-goal-plugin-"))
  const path = join(directory, "goals.json")
  const createdAt = "2026-09-01T00:00:00.000Z"
  const goals = ["session-1", "session-2"].map((sessionID) => ({
    sessionID,
    objective: `finish ${sessionID}`,
    status: "active" as const,
    createdAt,
    updatedAt: createdAt,
  }))

  await Promise.all(goals.map((goal) => saveGoal(goal, path)))

  expect(await readGoals(path)).toEqual({
    version: 1,
    goals: Object.fromEntries(goals.map((goal) => [goal.sessionID, goal])),
  })
})
