---
description: Set, inspect, pause, resume, or clear a persistent session goal
---

# Goal mode

Help the user manage one persistent, verifiable goal for this session.

1. If the user has not supplied an objective, ask for one measurable completion condition and how it will be verified.
2. Use `set_goal` only after the user explicitly supplies that objective.
3. Use `get_goal` to report the current goal and `update_goal` to pause, resume, complete, or block it.
4. Do not mark a goal `complete` without concrete verification evidence. When progress is blocked, call `report_goal_blocker` with the concrete reason. The same reason reported repeatedly blocks the goal and returns that reason. Use `update_goal` with `blocked` only for an immediate, confirmed blocker.
5. Once an active goal is set, work on it now; continue safely until it is complete, blocked, paused, or its auto-turn limit is reached.
