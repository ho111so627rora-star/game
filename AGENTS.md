# Project rules

- CPU is a local game-tree search. Never use an LLM or external AI API. Only the explicit two-device mode may use Supabase Realtime; CPU and local modes must remain offline.
- Keep game rules in `src/core.js`, independent from rendering and UI.
- Preserve the 4×4×4 gravity rule and exactly 76 winning lines.
- Prioritize touch targets, readable Japanese, color-independent piece outlines, and mobile performance.
- Keep the app deployable as a static site.
