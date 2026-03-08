# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Language

Always respond and work in English, even if the user's prompt is written in another language.

## Development Commands

```bash
DEV_PORTS=4321                                # Astro dev server port
START_COMMAND="npm run dev"                   # Start development server
PREDEV_COMMAND=""                             # No pre-start setup needed
VERIFY_COMMAND="npm run build"               # Build verifies everything compiles

# Common commands:
# npm install            — Install dependencies
# npm run dev            — Start dev server (http://localhost:4321)
# npm run build          — Build static site to dist/
# npm run preview        — Preview production build locally
```

**Important:** `npm run build` must pass before closing any task.

## Environment Setup

Install dependencies with `npm install`. No environment variables required — this is a static site.

## Architecture

**Static marketing website** for Arsenale (arsenalepam.com) built with Astro 5 + Tailwind CSS 4.

- **Framework:** Astro 5 (static output, zero JS by default)
- **Styling:** Tailwind CSS 4 via `@tailwindcss/vite`
- **Pages:** `src/pages/` — index, features, demo, security, docs
- **Layouts:** `src/layouts/BaseLayout.astro` — shared HTML shell with SEO
- **Components:** `src/components/` — Header, Footer, home sections, feature cards
- **Assets:** `src/assets/` — logos and images (processed by Astro)
- **Public:** `public/` — favicon, icons, robots.txt, CNAME
- **Build output:** `dist/` — static HTML/CSS/JS for deployment
- **Deployment:** GitHub Pages via `.github/workflows/deploy-pages.yml`

## Key Patterns

### Task Files

Tasks are split across three files by status:

| File | Status | Symbol |
|------|--------|--------|
| `to-do.txt` | Pending tasks | `[ ]` |
| `progressing.txt` | In-progress tasks | `[~]` |
| `done.txt` | Completed tasks | `[x]` |

When a task changes status, move it to the corresponding file.

### Idea Files

Ideas are stored separately from tasks and must be explicitly approved before entering the task pipeline:

| File | Purpose |
|------|---------|
| `ideas.txt` | Ideas awaiting evaluation |
| `idea-disapproved.txt` | Rejected ideas archive |

Use `/idea-create` to add ideas, `/idea-approve` to promote an idea to a task, `/idea-refactor` to update ideas based on codebase changes, and `/idea-disapprove` to reject an idea. Ideas must never be picked up directly by `/task-pick`.

## Cross-Platform Notes

This framework supports **Windows, macOS, and Linux** with automatic OS detection.

- **Python command:** All scripts and skills reference `python3`. On Windows where only `python` is available, substitute `python` for `python3` in all commands. Windows users should also update the `python3` reference in `.claude/settings.json` to `python`.
- **Port management:** `scripts/app_manager.py` automatically uses the correct OS tools — `lsof`/`ss` on Unix, `netstat`/`taskkill` on Windows.
- **File search:** `scripts/task_manager.py find-files` provides cross-platform file discovery (replaces Unix `find`).

### File Naming Conventions

| Layer | Pattern | Example |
|-------|---------|---------|
| Pages | `*.astro` in `src/pages/` | `features.astro` |
| Layouts | `*.astro` in `src/layouts/` | `BaseLayout.astro` |
| Components | `PascalCase.astro` in `src/components/` | `Header.astro` |
| Styles | `*.css` in `src/styles/` | `global.css` |
| Static assets | any in `public/` | `favicon.ico` |
| Processed assets | any in `src/assets/` | `logo-transparent.png` |
