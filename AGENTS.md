# WikiBoard — Master Prompt

## Project Overview

WikiBoard is a desktop-style window manager for browsing Wikipedia articles. It renders multiple freely positionable, resizable, draggable windows on a single page — each displaying a different Wikipedia article. Think of it as a tiling/cascading window manager (like old-school Windows) running entirely within a single browser tab, with Wikipedia as its content source.

Key features:
- Search Wikipedia with autocomplete; selecting a result opens a new window
- Windows can be dragged, resized, and closed
- Clicking links inside articles opens new windows for those articles
- Articles render in Shadow DOM with Wikipedia's own stylesheet (not iframes)
- Two-phase loading: fast summary first (~50ms), then full article HTML in parallel
- "Spawn 100 Windows" button fetches 100 random articles as a stress test
- In-memory article cache with LRU eviction
- Frozen window stubs for inactive windows (lightweight, no Shadow DOM)

## Tech Stack

| Layer | Technology | Version |
|---|---|---|
| Language | TypeScript | ~6.0.2 |
| UI Framework | React | ^19.2.7 (with React Compiler via Babel plugin) |
| Build Tool | Vite | ^8.1.1 |
| State Management | Zustand | ^5.0.15 |
| Linting | ESLint | ^10.6.0 (flat config, typescript-eslint, react-hooks, react-refresh) |
| Package Manager | pnpm | ^11.22.0 |
| Module System | ESM | `"type": "module"` in package.json |
| Target | ES2023 | |

## Project Structure

```
wikiboard/
├── index.html                    # Vite SPA entry, mounts #root, loads /src/main.tsx
├── package.json                  # Dependencies, scripts (dev, build, lint, preview)
├── vite.config.ts                # Vite + React plugin + Babel React Compiler + @ alias
├── eslint.config.js              # ESLint flat config (ignores dist/)
├── tsconfig.json                 # Root TS config, references app + node configs
├── tsconfig.app.json             # App TS config (ES2023, react-jsx, strict linting)
├── tsconfig.node.json            # Node TS config (for vite.config.ts only)
├── public/                       # Static assets
├── dist/                         # Build output
└── src/
    ├── main.tsx                  # React 19 entry point (StrictMode, createRoot)
    ├── App.tsx                   # Root component: SearchBox + Window list
    ├── index.css                 # All global CSS (324 lines, single file)
    ├── components/
    │   ├── window.tsx            # Generic floating window shell (titlebar + content)
    │   ├── articleView.tsx       # 2-phase article loader (summary → full HTML)
    │   ├── staticPreview.tsx     # Shadow DOM renderer for Wikipedia HTML
    │   ├── frozenPreview.tsx     # Lightweight stub for frozen/offscreen windows
    │   ├── searchBox.tsx         # Wikipedia search with autocomplete
    │   └── linkEditor.tsx        # Link list editor for windows with no URL
    ├── store/
    │   └── windows.ts            # Zustand store: window state management
    └── utils/
        ├── wiki.ts               # Wikipedia API calls, HTML cleaning, URL absolutization
        ├── articleCache.ts       # In-memory article cache with LRU eviction
        ├── scrollMemory.ts       # Per-window scroll position (module-level Map)
        └── window/
            ├── drag.ts           # Window drag logic (titlebar mousedown)
            ├── resize.ts         # Window resize logic (8-directional edge handles)
            └── onEdge.ts         # Cursor changes near window edges
```

## Architecture

### Data Flow

```
App.tsx (root)
  ├── SearchBox (search + autocomplete → addWindow)
  ├── "Spawn 100" button → spawnWindows
  └── windows.map() → Window (for each WindowData in store)
        ├── if url set: ArticleView
        │     ├── Phase 1: fetchArticleSummary → summary preview (fast)
        │     ├── Phase 2: fetchArticle → full HTML (parallel)
        │     └── StaticPreview (Shadow DOM + Wikipedia CSS)
        │           ├── Shadow root: <link> (Wikipedia CSS) + <style> (local overrides)
        │           ├── <div class="freeze"> → <h1 class="wiki-title"> + <div class="mw-parser-output">
        │           ├── Link click interception → opens new window
        │           └── Hover prefetch → prefetchArticles()
        └── if no url: LinkEditor (link list + add dialog)
```

### State Management (Zustand)

Single Zustand store in `store/windows.ts`:

**State:**
- `windows: WindowData[]` — array of all window objects
- `maxZIndex: number` — tracks highest z-index for bring-to-front

**WindowData type:**
```typescript
type WindowData = {
  id: string;                    // crypto.randomUUID()
  url: string;                   // Wikipedia URL or "" (empty = LinkEditor)
  title: string;                 // Display title (without underscores)
  links: WindowLink[];           // Collected navigation links
  active: boolean;               // Currently focused window
  lastFocusedAt: number;         // Timestamp for LRU policy
  frozen: boolean;               // When true, shows FrozenPreview stub
  zIndex?: number;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
};
```

**Actions:**
- `addWindow(data?)` — creates new window with cascading position (5px offset, wraps at 500px)
- `removeWindow(id)` — removes window by id
- `setActive(id)` — brings window to front, sets z-index, marks active/inactive
- `updateWindow(id, patch)` — partial update any window fields
- `freezeWindow(id)` / `unfreezeWindow(id)` — toggle frozen state
- `spawnWindows(count, startIdx, titles?)` — batch-create N windows

**Cascading positions:** New windows appear diagonally offset (5px per window, wrapping at 500px). Formula: `offset = (windowCount++ * 5) % 500`, position = `80 + offset`.

### Article Loading Pipeline

1. **Summary fetch** (`fetchArticleSummary`): Wikipedia REST API `/api/rest_v1/page/summary/{title}` — returns `extract_html`, `thumbnail`, `description` (~50ms)
2. **Full HTML fetch** (`fetchArticle`): Wikipedia REST API `/api/rest_v1/page/html/{title}` — returns full article HTML
3. **HTML cleaning** (`cleanArticleHtml`): Strips scripts, data attributes, noscript, style, meta; absolutizes all URLs to `https://en.wikipedia.org` origin; adds `loading="lazy"` and `decoding="async"` to images
4. **Shadow DOM rendering** (`StaticPreview`): Injects cleaned HTML + Wikipedia stylesheet + local override styles into shadow root

### Wikipedia API Endpoints Used

| Endpoint | Used In | Purpose |
|---|---|---|
| `/w/api.php?action=opensearch` | `searchBox.tsx` | Search autocomplete |
| `/w/api.php?action=query&list=random` | `App.tsx` | 100 random articles |
| `/api/rest_v1/page/summary/{title}` | `wiki.ts` | Fast article summary |
| `/api/rest_v1/page/html/{title}` | `wiki.ts` | Full article HTML |
| `/w/load.php?modules=site.styles,mediawiki.page.media,skins.vector.styles` | `staticPreview.tsx` | Wikipedia's CSS for Shadow DOM |

All API calls use `origin=*` for CORS.

### Shadow DOM Architecture

`staticPreview.tsx` renders Wikipedia articles inside a Shadow DOM for style isolation:

```
<div class="static-preview">  ← React host element
  #shadow-root (open)
    <link rel="stylesheet" href="WIKI_STYLESHEET_URL">  ← Wikipedia's CSS
    <style>SHADOW_STYLES</style>  ← Local overrides (if no adoptedStyleSheets)
    <div class="freeze">
      <h1 class="wiki-title">{title}</h1>
      <div class="mw-parser-output">{cleaned HTML}</div>
    </div>
```

**Style loading strategy:**
- If `adoptedStyleSheets` is supported: uses a shared `CSSStyleSheet` (created once, reused across all instances)
- Fallback: injects `<style>` tag with `SHADOW_STYLES`
- Wikipedia's remote CSS loaded via `<link>` tag for proper article rendering

**Local overrides (`SHADOW_STYLES`)** cover: thumbnails (`.thumb`, `.thumbinner`), infoboxes (`.infobox`), sideboxes, references, typography, tables (`.wikitable`), and other Wikipedia-specific elements.

### Caching

**Article cache** (`articleCache.ts`):
- Module-level `Map<string, CacheEntry>` (not Zustand — too hot for reactive state)
- `CacheEntry`: `{ html, preview, thumbnail, summaryHtml }`
- `evictClosedWindowArticles()`: removes entries for articles no longer displayed in any open window
- `prefetchArticles(titles, concurrency=15)`: parallel fetch with worker pool

**Scroll memory** (`scrollMemory.ts`):
- Module-level `Map<string, {x, y}>` — per-window scroll position
- NOT in Zustand — scroll events fire too frequently
- Written on every scroll tick, read once when window unfreezes

### Window Drag/Resize

- **Drag** (`window/drag.ts`): Mousedown on titlebar → calculates shift offset → mousemove updates position via `requestAnimationFrame` → mouseup commits final position. Edge margin (5px) prevents drag when near window edges.
- **Resize** (`window/resize.ts`): Mousedown on window body → detects cursor direction from `OnEdge` → 8-directional resize (n, s, e, w, ne, nw, se, sw). Minimum size: 100px. Freezes iframe dimensions during resize to prevent reflow.
- **Gesture isolation**: During drag/resize, `body.gesture-active` class disables iframe pointer events globally. `isDraggingWindow` and `isResizingWindow` flags prevent competing handlers.

### Freeze/Unfreeze System

The system is designed for LRU-based resource management (not fully wired up yet):
- `lastFocusedAt` tracks recency
- `frozen: boolean` on each window
- `FrozenPreview` shows title + thumbnail + snippet (no Shadow DOM, lightweight)
- Hovering or scrolling on a frozen window triggers `unfreezeWindow()`
- `unfreezeWindow` restores z-index, marks active, resets `lastFocusedAt`

## File Reference

### Entry Points

| File | Purpose |
|---|---|
| `index.html` | Vite SPA shell, mounts `#root` |
| `src/main.tsx` | React 19 entry (StrictMode, createRoot) |
| `src/App.tsx` | Root component: SearchBox + Window list + Spawn button |

### Components

| File | Purpose |
|---|---|
| `src/components/window.tsx` | Generic window frame: titlebar (draggable) + content area. Handles drag/resize/activate/close. |
| `src/components/articleView.tsx` | 2-phase article loader. Summary → full HTML. Routes to StaticPreview or summary preview. |
| `src/components/staticPreview.tsx` | Shadow DOM renderer. Injects Wikipedia CSS + cleaned HTML. Handles link clicks, hover prefetch, scroll restore. |
| `src/components/frozenPreview.tsx` | Lightweight stub: title + thumbnail + snippet. Hover/wheel to wake. |
| `src/components/searchBox.tsx` | Search input + autocomplete dropdown. Queries Wikipedia OpenSearch API. Prefetches top 3 suggestions. |
| `src/components/linkEditor.tsx` | Link list editor for windows with no URL. Displays collected links + add dialog. |

### Utilities

| File | Purpose |
|---|---|
| `src/utils/wiki.ts` | Wikipedia API layer: `extractTitle`, `fetchArticleSummary`, `fetchArticle`, `cleanArticleHtml`, `escapeHtml`. Exports `WIKI_STYLESHEET_URL`. |
| `src/utils/articleCache.ts` | In-memory article cache: `getCachedArticle`, `setCachedArticle`, `evictClosedWindowArticles`, `prefetchArticles`. |
| `src/utils/scrollMemory.ts` | Per-window scroll positions: `getScroll`, `setScroll`, `deleteScroll`. |
| `src/utils/window/drag.ts` | Window drag via titlebar mousedown. Exports `isDraggingWindow` flag. |
| `src/utils/window/resize.ts` | 8-directional window resize. Exports `isResizingWindow` flag. |
| `src/utils/window/onEdge.ts` | Cursor changes near window edges (5px margin). |

### Config

| File | Purpose |
|---|---|
| `vite.config.ts` | Vite + React plugin + Babel React Compiler preset + `@` alias |
| `tsconfig.app.json` | ES2023, react-jsx, strict linting, `@/*` path alias |
| `eslint.config.js` | Flat config: JS recommended + typescript-eslint + react-hooks + react-refresh |

## Commands

```bash
pnpm dev          # Start Vite dev server
pnpm build        # TypeScript check + Vite build (output: dist/)
pnpm lint         # Run ESLint
pnpm preview      # Preview production build
```

Build includes `tsc -b` (TypeScript project references build) before Vite build.

## Code Conventions

### TypeScript
- Target: ES2023
- Module: ESNext with bundler resolution
- Strict linting: `noUnusedLocals`, `noUnusedParameters`, `noFallthroughCasesInSwitch`
- `verbatimModuleSyntax: true` — type-only imports must use `import type`
- `erasableSyntaxOnly: true` — no enums, namespaces, or parameter properties
- Path alias: `@/` maps to `./src/`

### React
- React 19 with React Compiler (automatic memoization via Babel plugin)
- Functional components only (no class components)
- Hooks for state: `useState`, `useEffect`, `useRef`, `useCallback`
- No React Router — navigation is window-based (each window is a route)

### CSS
- Single global CSS file: `src/index.css` (324 lines)
- No CSS modules, no CSS-in-JS, no Tailwind
- Shadow DOM styles defined as string constant in `staticPreview.tsx` (`SHADOW_STYLES`)
- Wikipedia-specific element styling handled in shadow root

### State Management
- Zustand for all window state (single store)
- Module-level Maps for hot-path data (scroll positions, article cache) — too frequent for reactive state
- Direct state access via `useWindows.getState()` for synchronous reads outside React

### File Naming
- Components: camelCase (`articleView.tsx`, `staticPreview.tsx`)
- Utilities: camelCase (`wiki.ts`, `articleCache.ts`, `scrollMemory.ts`)
- Window utilities: subdirectory `utils/window/` (`drag.ts`, `resize.ts`, `onEdge.ts`)
- Types: defined inline or in the file that uses them (no separate types directory)

### Import Conventions
- Named imports for utilities: `import { extractTitle, fetchArticle } from "../utils/wiki"`
- Default imports for components: `import StaticPreview from "./staticPreview"`
- Relative paths within `src/`: `../utils/wiki`, `./components/window`
- `@/` alias available but not consistently used (mix of relative and alias)

### Styling Patterns
- Window layout: absolute positioning with `contain: layout paint` for performance
- Content areas: `height: calc(100% - 24px)` (24px titlebar) with `overflow: auto`
- Search suggestions: absolute dropdown with z-index 1000
- Dialogs: fixed overlay with centered modal
- Inactive windows: `content-visibility: auto` + `contain-intrinsic-size` for performance

## Key Patterns to Follow

1. **Always use Shadow DOM for article rendering** — never render Wikipedia HTML directly in the React DOM
2. **Prefetch on hover** — when hovering over wiki links, trigger `prefetchArticles()` for the target
3. **Scroll position memory** — save/restore scroll positions per window using `scrollMemory.ts`
4. **Cache articles globally** — use `articleCache.ts` and call `evictClosedWindowArticles()` when closing windows
5. **Gesture isolation** — during drag/resize, the `gesture-active` class on body disables iframe pointer events
6. **Two-phase loading** — show summary first (fast), then full article (slow) to avoid blank screens
7. **Cascading window positions** — use `nextCascadeOffset()` for new windows to avoid stacking
8. **z-index management** — always use `maxZIndex` counter from store, never hardcode z-index values
9. **Edge detection** — resize cursors only show within 5px of window edges, handled by `OnEdge`
10. **URL absolutization** — all Wikipedia URLs must be absolutized to `https://en.wikipedia.org` origin
11. **Performance reference** — see `PERFORMANCE.md` for full documentation of every optimization with explanations of what each one does to the browser
