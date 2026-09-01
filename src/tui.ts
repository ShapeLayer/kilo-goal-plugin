import type { TuiPlugin } from "@kilocode/plugin/tui"

const tui: TuiPlugin = async (api) => {
  // Kilo's compatibility command API makes /goal visible in the command palette.
  // Command handling and persistence live in the server entrypoint.
  api.command?.register(() => [{
    title: "Goal",
    value: "goal",
    description: "Set, inspect, pause, resume, or clear a persistent session goal",
    category: "Session",
    slash: { name: "goal", aliases: ["goal clear", "goal pause", "goal resume"] },
  }])
}

export default { id: "kilo-goal-plugin", tui }
