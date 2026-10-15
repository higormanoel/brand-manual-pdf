---
name: marquio
description: Use when a designer wants an editable brand manual, brand book, brand guidelines or a multipage brand PDF using Marquio Studio.
---

# Marquio

This source checkout contains Marquio Studio and both agent adapters. Build with `npm ci` and `npm run build`; install an adapter with `node bin/marquio.mjs install --agent codex|claude --target "<project-root>"`. Keep this repository and its build available after installation.

For work from this checkout, read [the shared designer workflow](integrations/shared/references/workflow.md) and use `node "<repository>/bin/marquio.mjs"` as the canonical command. Installed skills use their bundled launcher instead. The Codex adapter is [integrations/codex/SKILL.md](integrations/codex/SKILL.md); Claude Code uses [integrations/claude/SKILL.md](integrations/claude/SKILL.md).

Collect optional brief fields, preserve skipped choices and mark suggestions pending until designer approval. Use real IDs, expectedRevision and commandId through the CLI, never direct checkpoint edits. Open the editable Studio before final PDF delivery, and include a portable source backup. Use client uploads or included mockups/prompts; external generation requires an available provider or imported result.

The original workflow remains in [legacy/SKILL.md](legacy/SKILL.md); its template and script retain their original locations. Existing installed legacy checkouts are not modified automatically. See [README.md](README.md) for actual requirements and limitations.
