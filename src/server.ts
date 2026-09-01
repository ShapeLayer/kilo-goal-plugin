import type { Plugin, PluginOptions } from "@kilocode/plugin"
import { tool } from "@kilocode/plugin/tool"
import { formatGoal, getGoal, saveGoal, type GoalStatus } from "./state.js"

const now = () => new Date().toISOString()
const clearWords = new Set(["clear", "stop", "off", "reset", "none", "cancel"])

type Options = {
  auto_continue?: boolean
  max_auto_turns?: number
  max_same_blocker_reports?: number
}

type SessionSelection = {
  agent?: string
  model?: { providerID: string; modelID: string }
}

function options(input: PluginOptions): Required<Options> {
  const configured = input as Options
  const limit = (value: unknown, fallback: number, minimum: number) =>
    typeof value === "number" && Number.isFinite(value) ? Math.max(minimum, Math.floor(value)) : fallback
  return {
    auto_continue: configured.auto_continue ?? true,
    max_auto_turns: limit(configured.max_auto_turns, 25, 1),
    max_same_blocker_reports: limit(configured.max_same_blocker_reports, 3, 2),
  }
}

async function setStatus(sessionID: string, status: GoalStatus, detail?: string) {
  const current = await getGoal(sessionID)
  if (!current) throw new Error("No goal is set for this session.")
  if (current.status === "cleared") throw new Error("This goal was cleared. Set a new goal instead.")
  if ((current.status === "complete" || current.status === "blocked") && status !== "cleared") {
    throw new Error(`A ${current.status} goal cannot be resumed. Set a new goal instead.`)
  }
  if (status === "complete" && !detail) throw new Error("Completing a goal requires verification evidence.")
  if (status === "blocked" && !detail) throw new Error("Blocking a goal requires a concrete blocker.")
  return saveGoal({
    ...current,
    status,
    updatedAt: now(),
    evidence: status === "complete" ? detail : current.evidence,
    blocker: status === "blocked" ? detail : current.blocker,
  })
}

function normalizeBlocker(reason: string) {
  return reason.trim().toLocaleLowerCase().replace(/\s+/g, " ")
}

const server: Plugin = async ({ client, directory }, pluginOptions) => {
  const config = options(pluginOptions ?? {})
  const autoTurns = new Map<string, number>()
  const continuations = new Set<string>()
  const selections = new Map<string, SessionSelection>()

  function goalSelection(sessionID: string): SessionSelection {
    return selections.get(sessionID) ?? {}
  }

  async function createGoal(sessionID: string, objective: string) {
    const createdAt = now()
    const goal = await saveGoal({ sessionID, objective, status: "active", createdAt, updatedAt: createdAt, ...goalSelection(sessionID) })
    autoTurns.set(sessionID, 0)
    return goal
  }

  async function reportBlocker(sessionID: string, reason: string) {
    const current = await getGoal(sessionID)
    if (!current) throw new Error("No goal is set for this session.")
    if (current.status !== "active" && current.status !== "paused") throw new Error(`Cannot report a blocker for a ${current.status} goal.`)
    const normalizedReason = normalizeBlocker(reason)
    if (!normalizedReason) throw new Error("A blocker reason is required.")
    const count = current.blockerReport?.normalizedReason === normalizedReason ? current.blockerReport.count + 1 : 1
    const reachedLimit = count >= config.max_same_blocker_reports
    const goal = await saveGoal({
      ...current,
      status: reachedLimit ? "blocked" : current.status,
      updatedAt: now(),
      blocker: reachedLimit ? reason.trim() : current.blocker,
      blockerReport: { reason: reason.trim(), normalizedReason, count, lastReportedAt: now() },
    })
    if (reachedLimit) return `${formatGoal(goal)}\n\nGoal blocked after ${count} reports of the same reason: ${reason.trim()}`
    return `${formatGoal(goal)}\n\nBlocker report ${count}/${config.max_same_blocker_reports}: ${reason.trim()}. Try a materially different path before reporting it again.`
  }

  async function continueGoal(sessionID: string) {
    if (!config.auto_continue || continuations.has(sessionID)) return
    const goal = await getGoal(sessionID)
    const turns = autoTurns.get(sessionID) ?? 0
    if (!goal || goal.status !== "active" || turns >= config.max_auto_turns) return
    continuations.add(sessionID)
    try {
      autoTurns.set(sessionID, turns + 1)
      await client.session.promptAsync({
        path: { id: sessionID },
        query: { directory },
        body: {
          agent: goal.agent,
          model: goal.model,
          parts: [{ type: "text", synthetic: true, text: `Continue working on the active goal: ${goal.objective}\n\nInspect the current state, make the next safe step, and do not declare completion without verified evidence.` }],
        },
      })
    } finally {
      continuations.delete(sessionID)
    }
  }

  return {
  "chat.message": async (input, output) => {
    const selection = { agent: input.agent, model: input.model }
    selections.set(input.sessionID, selection)
    const existing = await getGoal(input.sessionID)
    if (existing && existing.status !== "cleared") {
      await saveGoal({ ...existing, ...selection, updatedAt: now() })
    }
    const firstText = output.parts.find((part) => part.type === "text")
    if (!firstText || !firstText.text.trimStart().startsWith("/goal")) return
    const argument = firstText.text.trim().slice("/goal".length).trim()
    if (!argument) {
      output.parts = [{ type: "text", text: `The user asked to inspect the goal state.\n${formatGoal(await getGoal(input.sessionID))}` }] as typeof output.parts
      return
    }
    if (clearWords.has(argument.toLowerCase())) {
      output.parts = [{ type: "text", text: `The user cleared the goal.\n${formatGoal(await setStatus(input.sessionID, "cleared"))}` }] as typeof output.parts
      return
    }
    if (argument === "pause" || argument === "resume") {
      const goal = await setStatus(input.sessionID, argument === "pause" ? "paused" : "active")
      output.parts = [{ type: "text", text: `The user updated the goal.\n${formatGoal(goal)}` }] as typeof output.parts
      return
    }
    const goal = await createGoal(input.sessionID, argument)
    output.parts = [{ type: "text", text: `The user set this active goal:\n${formatGoal(goal)}\n\nWork toward it now. Do not mark it complete without verified evidence.` }] as typeof output.parts
  },
  tool: {
    get_goal: tool({
      description: "Get the active goal for this session.",
      args: {},
      async execute(_args, context) {
        return formatGoal(await getGoal(context.sessionID))
      },
    }),
    set_goal: tool({
      description: "Set one explicit, verifiable objective for this session. Use only when the user explicitly asks for a goal.",
      args: { objective: tool.schema.string().min(1).describe("The measurable completion condition") },
      async execute(args, context) {
        const goal = await createGoal(context.sessionID, args.objective.trim())
        void continueGoal(context.sessionID)
        return `${formatGoal(goal)}\n\nKeep working toward this goal. Do not mark it complete without concrete evidence.`
      },
    }),
    update_goal: tool({
      description: "Pause, resume, complete, or block the current goal. Completion requires evidence; blocking requires the specific blocker.",
      args: {
        status: tool.schema.enum(["active", "paused", "complete", "blocked"]),
        detail: tool.schema.string().optional().describe("Required evidence for complete or blocker for blocked"),
      },
      async execute(args, context) {
        return formatGoal(await setStatus(context.sessionID, args.status, args.detail))
      },
    }),
    report_goal_blocker: tool({
      description: "Report why progress is currently blocked. Repeating the same reason reaches the configured limit (default 3) and marks the goal blocked, returning that reason.",
      args: { reason: tool.schema.string().min(1).describe("The concrete reason progress cannot continue") },
      async execute(args, context) {
        return reportBlocker(context.sessionID, args.reason)
      },
    }),
    clear_goal: tool({
      description: "Clear the current goal when the user explicitly asks to stop or remove it.",
      args: {},
      async execute(_args, context) {
        return formatGoal(await setStatus(context.sessionID, "cleared"))
      },
    }),
  },
  "command.execute.before": async (input, output) => {
    if (input.command !== "goal") return
    const argument = input.arguments.trim()
    if (!argument) {
      output.parts = [{ type: "text", text: formatGoal(await getGoal(input.sessionID)) }] as typeof output.parts
      return
    }
    if (clearWords.has(argument.toLowerCase())) {
      output.parts = [{ type: "text", text: formatGoal(await setStatus(input.sessionID, "cleared")) }] as typeof output.parts
      return
    }
    if (argument === "pause" || argument === "resume") {
      const goal = await setStatus(input.sessionID, argument === "pause" ? "paused" : "active")
      if (goal.status === "active") void continueGoal(input.sessionID)
      output.parts = [{ type: "text", text: formatGoal(goal) }] as typeof output.parts
      return
    }
    const goal = await createGoal(input.sessionID, argument)
    void continueGoal(input.sessionID)
    output.parts = [{ type: "text", text: `${formatGoal(goal)}\n\nGoal set. Continue working toward it and provide verification before completing it.` }] as typeof output.parts
  },
  "experimental.session.compacting": async (input, output) => {
    const goal = await getGoal(input.sessionID)
    if (goal && (goal.status === "active" || goal.status === "paused")) output.context.push(`## Persistent goal\n${formatGoal(goal)}\nDo not lose this goal during compaction.`)
  },
  event: async ({ event }) => {
    if (event.type === "session.idle") await continueGoal(event.properties.sessionID)
  },
  }
}

export default { id: "kilo-goal-plugin", server }
