# Original Marquio mockup scenes

These base scenes were generated for this project with the built-in image generation tool on 15 October 2026. They are original generated scenes, not photographs or assets extracted from the private reference manual. The adjacent `.prompt.txt` files preserve the exact generation prompts.

Client artwork is a separate application layer. The base scenes intentionally contain no brand, text or client identity. Do not describe them as photographs of a real client's printed production.

- `card-stack.png`: original generated photographic business-card base, 1672 × 941 pixels; prompt in `card-stack.prompt.txt`.
- `framed-poster.png`: original generated photographic poster base, 1672 × 941 pixels; prompt in `framed-poster.prompt.txt`.
- `laptop.png`: original generated photographic display base, 1672 × 941 pixels; prompt in `laptop.prompt.txt`.

The source generation output was copied into this repository so the application never depends on a private Codex cache path. The canonical scene dimensions and image-pixel surface coordinates live in `src/mockups/scenes-data.json`; the runtime catalog consumes that source module. Photographs stay in this public directory, while the client artwork remains a separate asset.
