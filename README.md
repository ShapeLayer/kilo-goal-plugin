# Kilo goal plugin

Adds Codex and Claude Code's `/goal` mode to Kilo Code.

## Install

```sh
git clone https://github.com/ShapeLayer/kilo-goal-plugin.git
cd kilo-goal-plugin
bun install
bun run build
```

Add the plugin to Kilo's configuration file (`.kilo/opencode.jsonc`).

```jsonc
{
  "plugin": ["/path/to/kilo-goal-plugin"]
}
```

To use `/goal` from the command picker, also copy the workflow file.

```sh
mkdir -p ~/.config/kilo/commands
cp templates/goal.md ~/.config/kilo/commands/goal.md
```

## Commands

```text
/goal <objective>  Set or replace the current session goal
/goal              Show the current goal
/goal pause        Pause the goal
/goal resume       Resume the goal
/goal clear        Clear the goal
```
