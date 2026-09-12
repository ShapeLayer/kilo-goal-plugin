# Kilo goal plugin

Adds Codex and Claude Code's `/goal` mode to Kilo Code.

## Install

Install the plugin globally and add it to Kilo's configuration in one step:

```sh
kilo plugin @shapelayer/kilo-goal-plugin --global
```

To install it only for the current project, omit `--global`:

```sh
kilo plugin @shapelayer/kilo-goal-plugin
```

Alternatively, add the package directly to a Kilo configuration file such as
`~/.config/kilo/kilo.jsonc` (global) or `.kilo/kilo.jsonc` (project):

```jsonc
{
  "plugin": ["@shapelayer/kilo-goal-plugin"]
}
```

Restart Kilo after installation. The plugin registers `/goal` in the command
picker for both the CLI and editor integrations.

## Commands

```text
/goal <objective>  Set or replace the current session goal
/goal              Show the current goal
/goal pause        Pause the goal
/goal resume       Resume the goal
/goal clear        Clear the goal
```
