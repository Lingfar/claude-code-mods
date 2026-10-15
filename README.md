# claude-code-mods

A small [Claude Code](https://claude.com/claude-code) mod, made for the desktop app's Code tab (it also works in the terminal).

| Mod | What it shows |
| --- | --- |
| `usage-band` | Your plan limits in the prompt footer: `5h ◔ 23% ↻2h13 │ 7j ◕ 91% ↻3j` (orange from 75 %, red from 90 %). |

## Install

Run this in a terminal `claude` session (the desktop Code tab does not accept `/plugin`, but mods installed at the user scope load there too):

```
/plugin install usage-band --marketplace Lingfar/claude-code-mods
```

Answer `y` to add the marketplace, then pick the **user** scope. New sessions, desktop ones included, load the mod.

To update later:

```
/plugin marketplace update claude-code-mods
```

## Run from a clone

To edit a mod and see the change, load it from its folder instead of installing it.

```bash
git clone git@github.com:Lingfar/claude-code-mods.git ~/.claude/mods
```

Then list the mod folders in `~/.claude/settings.json` (`:` separates paths on macOS and Linux, `;` on Windows):

```json
{
  "env": {
    "CLAUDE_CODE_PLUGIN_DIRS": "~/.claude/mods/usage-band"
  }
}
```

For a single terminal session, `claude --plugin-dir ~/.claude/mods/usage-band` does the same.

Before committing a change:

```bash
claude plugin validate usage-band
claude plugin test usage-band
```

## Notes

- Built against Claude Code 2.1.295. The mods API is early access and may change between releases.
