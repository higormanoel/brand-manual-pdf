---
name: marquio
description: Use when a designer wants an editable brand manual, brand book, brand guidelines or a multipage brand PDF using Marquio Studio.
---

# Marquio

Invoke as `/marquio` in Claude Code. This adapter opens the same local application and canonical project as the other supported agent.

Read [the workflow](references/workflow.md) before collecting content or changing a project. Run `node "<this skill directory>/scripts/marquio.mjs" --help`; the installed launcher resolves the source repository independently of the working directory. Keep the source repository and its build available.

Collect optional briefing fields in small groups, record `skipped` choices once, and preserve supplied content. Suggestions stay `pending` until the designer approves them. Ask for client uploads and mockups, or offer the included templates and prompts. External image generation needs an available provider or an imported result; never claim a connection or generated result that does not exist.

Use the launcher for `studio`, `validate`, `generate`, `apply --batch`, `import-asset` and `export`. Each edit uses the latest confirmed `expectedRevision`, a unique `commandId` and real project IDs. Read the latest repository through its CLI/API; never overwrite the checkpoint JSON. Open the actual editable Studio and review its pages before delivering the final PDF, with the portable editable source.
