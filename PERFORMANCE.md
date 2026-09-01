# WikiBoard — Performance Optimizations

Every optimization in the codebase, explained as **Problem → Solution** with file references.

---

## 1. Drag & Resize Gesture Isolation

**Files:** `src/utils/window/drag.ts`, `src/utils/window/resize.ts`, `src/utils/window/onEdge.ts`

---

### All setup on mousedown, not first mousemove

**Problem:** Class changes (`classList.add("dragging")`), `gesture-active` on body, cursor change, and z-index promotion were happening inside `beginDragging()` on the first `mousemove`. This forces a synchronous style recalculation across all 100+ windows right when the user expects the window to start moving. The browser must recalculate styles for every window (because `.gesture-active` applies `pointer-events: none` to all siblings) and paint the result — all before the first animation frame the user sees.

**Solution:** All heavy work moves to the `mousedown` handler. By the time the browser fires the first `mousemove`, the style recalculation has already completed during the "click" moment. The user never perceives a delay because the expensive work happens before they expect movement.

- `drag.ts:35-40` — `classList.add("dragging")`, `classList.add("gesture-active")`, cursor, z-index
- `resize.ts:45-51` — same pattern

---

### Zustand setState deferred to mouseup

**Problem:** Zustand's `setState()` triggers React reconciliation across every component that subscribes to the store. With 100 windows, calling `setState({ maxZIndex })` during drag start forces React to diff 100 `WindowData` objects at the exact moment the user expects smooth movement. Even with `memo()`, React still runs the comparison logic on all 100 components.

**Solution:** During the gesture, only `target.style.zIndex = String(nextZ)` is written (direct DOM, no React). Zustand is not updated until mouseup, meaning zero React re-renders for the entire duration of the drag/resize. The store syncs when the gesture ends, at which point there's no performance pressure.

- `drag.ts:39-40` — `target.style.zIndex` on mousedown (direct DOM)
- `drag.ts:81` — `useWindows.setState({ maxZIndex: nextZ })` on mouseup only
- `resize.ts:50-51` — `target.style.zIndex` on mousedown
- `resize.ts:129` — `useWindows.setState({ maxZIndex: nextZ })` on mouseup only

---

### GPU-composited transform

**Problem:** Writing `element.style.left` or `element.style.top` triggers layout recalculation. The browser must reflow the element's position, then reflow all elements that depend on it, then repaint the dirty region. With 100+ windows, each position change can affect overlapping regions and trigger cascading repaints.

**Solution:** Writing `element.style.transform = translate3d(dx, dy, 0)` skips layout entirely. The browser promotes the element to a GPU compositing layer, and the transform is applied by the compositor thread (a separate process from the main thread). The main thread is free to continue processing JavaScript while the GPU handles visual movement. `translate3d` specifically (vs `translate`) signals to the browser that the element should be promoted to its own layer.

- `drag.ts:59` — `target.style.transform = \`translate3d(${dx}px, ${dy}px, 0)\``
- `resize.ts:73` — same for west/north edge resize

---

### Bounded rAF batching

**Problem:** Browsers fire `mousemove` events at the display's refresh rate — 60Hz on most screens, 120Hz+ on high-refresh displays. Writing to the DOM on every mousemove means 60-120+ DOM writes per second, each potentially triggering style recalculation and repaint.

**Solution:** A `framePending` / `frameRequested` flag ensures at most one `requestAnimationFrame` callback is queued at a time. When a mousemove fires and a frame is already pending, the code stores the latest `mouseX`/`mouseY` and skips queueing another rAF. When the pending frame fires, it uses whatever the latest mouse position is. No matter how many mousemove events fire between frames, only one transform write happens per frame.

- `drag.ts:42-69` — `framePending` flag, rAF in `onMouseMove`
- `resize.ts:56-88` — `frameRequested` flag, rAF in `onMouseMove`

---

### Mouse position cached, not read from DOM

**Problem:** Reading `element.getBoundingClientRect()` or `element.offsetLeft` forces a synchronous layout reflow. Reading these inside a mousemove handler and then writing to the DOM creates a "layout thrash" — read forces layout, write invalidates layout, next read forces layout again. At 60-120Hz, this is catastrophic.

**Solution:** `mouseX`/`mouseY` are stored in local variables on every mousemove. The actual position calculation runs inside the rAF callback (which runs before the next paint), using cached start positions (`baseLeft`, `baseTop`) and the latest mouse coordinates. No DOM reads needed during the gesture.

- `drag.ts:43-44, 63-64` — `mouseX`/`mouseY` updated on event, read in rAF
- `resize.ts:53-54` — same pattern

---

### Edge margin guard

**Problem:** Without a 5px dead zone, clicking 1px inside a window's edge starts a drag instead of a resize, causing the window to jump unexpectedly. The user intended to resize but got a drag.

**Solution:** 5px edge margin checked synchronously on mousedown before any setup work. Clicks within 5px of an edge are ignored by drag, allowing resize to handle them.

- `drag.ts:19-25` — 5px margin check before drag setup
- `resize.ts:7-15` — same `isNearEdge` check before resize setup

---

### Competing handler flags

**Problem:** Without mutual exclusion, the browser could try to start a resize while a drag is in progress, or update cursor styles while the user is mid-gesture. Each competing handler triggers additional style calculations and DOM writes.

**Solution:** `isDraggingWindow` and `isResizingWindow` are module-level boolean flags. Resize bails immediately if drag is active (`if (isDraggingWindow || isResizingWindow) return`), and vice versa. `OnEdge` also checks both flags to skip cursor updates during gestures.

- `drag.ts:4` — `export let isDraggingWindow = false`
- `resize.ts:5` — `export let isResizingWindow = false`
- `resize.ts:22` — `if (isDraggingWindow || isResizingWindow) return`
- `onEdge.ts:25, 44` — early bail on both flags

---

### Minimum size enforcement

**Problem:** Without a minimum, a user could drag an edge inward until the window is 0px wide, creating a degenerate element that still occupies layout space and may cause rendering artifacts or invisible windows.

**Solution:** 100px minimum width/height enforced inside the rAF callback. Checks like `startWidth - dx > 100` prevent the window from shrinking below the threshold.

- `resize.ts:71-86` — minimum size checks in rAF callback

---

## 2. CSS Containment & Compositing

**File:** `src/index.css`

---

### `contain: strict` on `.window`

**Problem:** Without containment, when a Shadow DOM article loads an image (changing its height), the browser must reflow *every element that could depend on that window's position*. With 100+ absolutely-positioned windows, a single image load in one window can trigger reflow across all siblings — a cascade that makes the entire page sluggish.

**Solution:** `contain: strict` (shorthand for `size layout style paint`) tells the browser:
- **Size** — the element's size is known without looking at children (384x384px)
- **Layout** — internal layout cannot affect any element outside it
- **Style** — CSS counters/quotes cannot leak out
- **Paint** — content is painted only within its bounds

The browser knows the image load cannot affect anything outside the window and skips sibling reflow entirely. This is the single most impactful CSS optimization for multi-window layouts.

```css
.window {
  contain: strict;
}
```

---

### `contain: content` on `.window-content`

**Problem:** When a Wikipedia article finishes loading and images appear, the content area reflows. Without inner containment, this reflow could propagate to the window frame — causing the titlebar to shift or the border to flicker.

**Solution:** `contain: content` establishes layout and style containment for the content area. Changes inside the article (image loads, font rendering, table reflow) cannot affect the window's outer frame. The reflow is confined to the scrollable content area.

```css
.window-content {
  contain: content;
}
```

---

### `will-change: transform` only during gesture

**Problem:** Each GPU layer consumes video memory (VRAM). Putting `will-change: transform` on all 100+ windows at rest would allocate 100+ separate GPU layers simultaneously — wasting memory and increasing compositor overhead for windows that aren't moving.

**Solution:** `will-change: transform` is only applied to `.window.dragging` and `.window.resizing`. The browser allocates one extra GPU layer only when a gesture starts and frees it when the gesture ends. At rest, windows share the default compositing group.

```css
.window.dragging,
.window.resizing {
  will-change: transform;
}
```

---

### `pointer-events: none` on drag/resize content

**Problem:** During a fast drag, the mouse can accidentally cross into the window's content area (Shadow DOM with Wikipedia articles). If the content contains cross-origin iframes (Wikipedia ads, embedded maps), the browser routes the mouse event into the iframe boundary — causing a 10-50ms stall as it negotiates the event across the origin boundary.

**Solution:** `pointer-events: none` on `.window-content` and `iframe` during `.dragging` / `.resizing` makes the content area "transparent" to mouse events. Events pass through to the element underneath without triggering iframe event routing.

```css
.window.dragging .window-content,
.window.resizing .window-content,
.window.dragging iframe,
.window.resizing iframe {
  pointer-events: none;
}
```

---

### Global gesture-active pointer-events block

**Problem:** This is the single biggest cause of jank during multi-window gestures. As the user drags a window across 100 overlapping windows, the browser continuously evaluates "which window is the mouse over?" by hit-testing against each window's DOM — including Shadow DOM content and potential cross-origin iframes. Each hit-test can trigger style recalculation. At 60Hz, that's 60 hit-tests × 100 windows = 6,000 hit-tests per second.

**Solution:** During any window gesture, ALL windows except the one being dragged/resized get `pointer-events: none !important`. The browser skips hit-testing entirely for non-active windows — reducing 6,000 hit-tests/sec to 60.

```css
body.gesture-active .window:not(.dragging):not(.resizing) {
  pointer-events: none;
}
body.gesture-active .window:not(.dragging):not(.resizing) iframe,
body.gesture-active .window:not(.dragging):not(.resizing) .window-content {
  pointer-events: none !important;
}
```

---

### No containment on base `.window`

**Problem:** If every window had its own compositing layer (via `contain: layout paint` on all of them), the browser's compositor would have to composite 100+ separate layers on every frame — even for windows that haven't changed.

**Solution:** The base `.window` class intentionally does NOT have `contain: layout paint`. Most windows remain in the default compositing group, allowing the browser to batch-paint them together in a single compositing pass. Only the active gesture window gets promoted via `will-change: transform`.

```css
.window {
  /* no contain property — deliberate */
}
```

---

## 3. React Rendering Optimizations

---

### `memo()` on all list items and heavy components

**Problem:** Without `memo()`, when any window's state changes (e.g., window #3 gets focused), React re-renders the entire `windows.map()` loop — all 100 `WindowItem` components, each re-executing hooks, evaluating JSX, and diffing the DOM.

**Solution:** `React.memo()` wraps each component and tells React: "if the props haven't changed (same reference), skip re-rendering entirely." With immutable Zustand updates that preserve references for unchanged windows (`return w`), only the 2 windows whose `WindowData` objects changed re-render. The other 98 are skipped.

- `App.tsx:51` — `WindowItem = memo(...)` — skips re-render for 99/100 windows
- `window.tsx:29` — `memo(function Window(...))`
- `staticPreview.tsx:139` — `memo(function StaticPreview(...))`
- `frozenPreview.tsx:10` — `memo(function FrozenPreview(...))`
- `articleView.tsx:19` — `memo(function ArticleView(...))`

---

### `useCallback` for stable handler references

**Problem:** Without `useCallback`, every render creates a new function object — `(pos) => updateWindow(w.id, pos)` is a new reference each time. The child `Window` component's `memo()` sees a new prop and re-renders, defeating the purpose of `memo()`.

**Solution:** `useCallback(fn, deps)` returns the same function reference across re-renders if `deps` haven't changed. `handleActivate`, `handleClose`, `handlePositionChange` are stable per `w.id`, so `memo()` on the child `Window` can correctly skip re-renders.

- `App.tsx:58-68` — handlers memoized per `w.id`

---

### `useMemo` for derived style objects

**Problem:** `style={{ zIndex: w.zIndex }}` creates a new object on every render. React's `style` prop comparison is reference-based — a new object = new prop = re-render, even if `zIndex` is the same value.

**Solution:** `useMemo(() => ({ zIndex: w.zIndex }), [w.zIndex])` creates the object only when `w.zIndex` actually changes. Same reference = same prop = skip re-render.

- `App.tsx:56` — `useMemo(() => ({ zIndex: w.zIndex }), [w.zIndex])`

---

### `useRef` for one-time DOM positioning

**Problem:** Position (left/top/width/height) is managed imperatively via drag/resize handlers. If React re-applied position props on every re-render, it would fight with the imperative position changes — causing the window to "jump" back to its original position.

**Solution:** The `positioned.current` guard in the `ref` callback ensures position is written directly to the DOM element on first render only. Subsequent re-renders skip the positioning logic entirely.

- `window.tsx:43-61` — `positioned.current` guard in ref callback

---

### `useRef` for callback stability in useEffect

**Problem:** If `onLinkClick` / `onScrollChange` are in the `useEffect` dependency array, any parent re-render that creates new callback references would tear down the entire Shadow DOM (removing all event listeners, destroying the shadow root) and rebuild it from scratch. This is extremely expensive.

**Solution:** Callbacks are stored in `callbacksRef.current` instead of being included in the dependency array. The useEffect depends only on `[title, html, scrollTop]`. Event handlers read from `callbacksRef.current.onLinkClick(...)` which always has the latest function without triggering a useEffect re-run.

- `staticPreview.tsx:141-145` — `callbacksRef.current` pattern
- `staticPreview.tsx:197-224` — event handlers read from `callbacksRef.current`

---

### Zustand selector granularity

**Problem:** If every `WindowItem` subscribed to `s.windows` (the full array), a single `setActive` call would trigger 100 selector evaluations + 100 potential re-renders — even for components that don't need the changed data.

**Solution:** `useWindows((s) => s.setActive)` subscribes to only the action — not the windows array. Individual `WindowItem` components don't subscribe to the store at all; they receive data via props. Only the App root subscribes to `s.windows`.

- `App.tsx:52-54` — `useWindows((s) => s.setActive)` (action selector)
- `App.tsx:89` — `useWindows((s) => s.windows)` (full array, only in root)

---

## 4. Zustand Store Patterns

**File:** `src/store/windows.ts`

---

### Immutable updates with reference preservation

**Problem:** If every `setActive` call created new objects for ALL windows (even unchanged ones), React `memo()` would see new prop references for every window and re-render all 100 components.

**Solution:** Every action returns new objects via `.map()` but preserves references for unchanged windows via `return w`. When `setActive("window-3")` runs, windows #1, #2, #4–#100 keep their exact same `WindowData` object references. `memo()` sees the same `w` prop reference and skips re-render. Only 2 out of 100 windows re-render.

- `setActive:96-101` — `return w` for unchanged, `{ ...w, ... }` for changed

---

### Early returns to avoid unnecessary state copies

**Problem:** If `setActive(id)` is called with the already-active window's id, creating a new state object triggers 100 selector evaluations and React reconciliation — for zero visible change.

**Solution:** `if (target.active) return state` returns the current state object unchanged. Zustand detects that the state reference hasn't changed and skips all React notifications.

- `setActive:89-91` — `if (target.active) return state`
- `unfreezeWindow:121-122` — same pattern

---

### Batch window creation

**Problem:** Calling `addWindow()` 100 times creates 100 state updates, each triggering React reconciliation. 100 state updates × 100 component diffs = 10,000 comparison operations.

**Solution:** `spawnWindows()` pushes all windows into a local array, then calls `set()` once. 1 state update × 100 component diffs = 100 comparison operations — a 100x reduction.

- `spawnWindows:136-163` — single `set()` call for all windows

---

### `getState()` for synchronous reads outside React

**Problem:** Using `useWindows()` hooks in click handlers and cache eviction creates subscriptions that trigger re-renders on every state change — even though these operations only need the value at a single point in time.

**Solution:** `useWindows.getState()` reads the current store state synchronously, without subscribing. Used in `articleView.tsx:131` (click handler) and `articleCache.ts:14` (cache eviction).

---

## 5. Hot-Path Data Bypasses Zustand

---

### Scroll memory (module-level Map)

**File:** `src/utils/scrollMemory.ts`

**Problem:** Scroll events fire 60-120 times per second. If scroll positions were stored in Zustand, every scroll tick would trigger `setState()`, which triggers React reconciliation across all subscribed components. With 100 windows: 60-120 state updates × 100 component diffs = 6,000-12,000 comparison operations per second — for data that only needs to be read once (when a window unfreezes).

**Solution:** A module-level `Map<string, {x, y}>` stores scroll positions outside React/Zustand. `setScroll()` is a `Map.set()` — zero side effects, zero React overhead. Written on every scroll tick, read once when a window unfreezes.

- `scrollMemory.ts:7` — `const scrolls = new Map<string, ScrollPos>()`

---

### Article cache (module-level Map)

**File:** `src/utils/articleCache.ts`

**Problem:** Article data is read frequently (on every component mount, every URL change) but doesn't need to trigger re-renders when it changes. A Zustand store would add subscriber notification overhead for data that's purely a cache.

**Solution:** A module-level `Map<string, CacheEntry>` stores fetched article HTML. `getCachedArticle()` is a synchronous `Map.get()` — O(1) lookup with no async, no promise, no subscriber notification.

- `articleCache.ts:11` — `const cache = new Map<string, CacheEntry>()`

---

### Edge cursor cache

**File:** `src/utils/window/onEdge.ts`

**Problem:** Mousemove fires 60-120 times per second. Each mousemove triggers `OnEdge()` which computes the cursor. Most of the time, the cursor doesn't change (the mouse is far from any edge). Without caching, every mousemove writes `element.style.cursor = "default"` — a DOM write that triggers style recalculation.

**Solution:** A module-level `let lastCursor = ""` stores the last-computed value. `if (cursor !== lastCursor)` skips the DOM write when the cursor hasn't changed.

- `onEdge.ts:4-5` — `let lastCursor = ""`
- `onEdge.ts:31-34` — `if (cursor !== lastCursor)` guard

---

### Single document-level mousemove delegate

**File:** `src/utils/window/onEdge.ts:39-57`

**Problem:** Attaching a `mousemove` handler to each of the 100+ `.window` elements means 100 function calls on every mousemove, plus memory overhead for each listener.

**Solution:** A single `document.addEventListener("mousemove", ...)` handler handles cursor changes for all windows via `e.target.closest(".window")`. 1 listener instead of 100. The `closest()` DOM traversal is fast because windows are shallow (2-3 levels deep).

- `onEdge.ts:39-57` — `attachEdgeDelegate()` function

---

## 6. Wikipedia HTML Stripping

**File:** `src/utils/wiki.ts:35-64`

**Problem:** A full Wikipedia article can contain 2,000-5,000+ DOM nodes. With 100 windows, that's 200,000-500,000+ nodes the browser must layout, style, and paint. Navigation boxes, galleries, sidebars, and metadata are visual noise in a 384px window.

**Solution:** `cleanArticleHtml()` parses the HTML into a DOM tree, removes heavy elements via `STRIP_SELECTORS`, strips unnecessary attributes, and absolutizes URLs. The cleaned HTML has 30-60% fewer nodes.

| Selector | What it removes | Why it's heavy |
|---|---|---|
| `.navbox`, `.vertical-navbox` | Navigation tables | Large, complex tables — often the biggest element in an article |
| `.sidebar`, `.portal` | Side navigation | Heavy nested lists |
| `.toc` | Table of contents | Redundant in 384px window |
| `.gallery` | Image galleries | 10-50+ images with captions |
| `.ambox`, `.mbox-small`, `.mbox`, `.article-alert`, `.alert` | Alert banners | Visual noise, no content value |
| `.mw-editsection` | Edit section links | Useless in read-only view |
| `.printfooter`, `.visualClear` | Print footer, clearing divs | No visual purpose |
| `#catlinks` | Category links bar | Heavy, low value |
| `.metadata`, `.noprint` | Hidden metadata | Invisible but still in DOM |
| `.sistersitebox` | Sister project links | Box with images |
| `script`, `noscript`, `meta`, `link[rel=dns-prefetch]`, `base` | Head elements | Dangerous or useless |
| `.shortdescription`, `.mw-empty-elt` | Empty/template elements | Clutter |

### Additional HTML cleaning

- **Attribute stripping** (`wiki.ts:105-120`) — removes `data-*`, `on*`, `typeof`, `about`, `resource`, `property` from all elements. Wikipedia-specific attributes not needed for rendering.
- **Lazy image loading** (`wiki.ts:122-125`) — adds `loading="lazy"` and `decoding="async"` to all `<img>` tags. Off-screen images don't block rendering.
- **URL absolutization** (`wiki.ts:127-137`) — all `href`, `src`, `srcset` absolutized to `https://en.wikipedia.org`. Shadow DOM doesn't inherit the document's base URL.
- **Figure grouping** (`wiki.ts:79-101`) — consecutive `<figure>` elements wrapped in a single container. Reduces layout complexity by treating image groups as one float.
- **Template style hoisting** (`wiki.ts:71-73`) — `<style>` elements inside `.mw-empty-elt` hoisted to parent before removal. Preserves Wikipedia's template styles.

---

## 7. Two-Phase Article Loading

**File:** `src/components/articleView.tsx:64-127`

---

### Phase 1: Summary (~50ms)

**Problem:** The full article HTML can be 50-200KB and takes 200-500ms to fetch. Showing a blank screen for 200-500ms while waiting feels broken.

**Solution:** `fetchArticleSummary` hits Wikipedia's REST API (`/api/rest_v1/page/summary/{title}`) which returns a lightweight JSON (1-5KB) with `extract_html` (first paragraph), `thumbnail`, and `description`. The user sees content in ~50ms.

---

### Phase 2: Full HTML (parallel)

**Problem:** The summary alone isn't enough — users want the full article eventually. Waiting for the summary to finish before starting the full fetch wastes time.

**Solution:** `fetchArticle` runs in parallel with Phase 1. When it arrives, cleaned HTML is rendered in a Shadow DOM with Wikipedia's CSS. The summary preview is replaced seamlessly.

---

### Cache-first initialization

**Problem:** Reopening a previously viewed article triggers both fetches again, wasting bandwidth and showing a loading state for content the user already saw.

**Solution:** All three states (`summaryHtml`, `summaryThumb`, `fullHtml`) are initialized synchronously from `getCachedArticle()` on mount. Cache hit = instant render, zero network requests.

- `articleView.tsx:26-43` — `useState` initializers read from cache

---

### Cancellation flag

**Problem:** A slow fetch for article A could update state after the user has already navigated to article B — causing a flash of wrong content.

**Solution:** A `cancelled` boolean in `useEffect` cleanup prevents stale `setState` calls. If the URL changes before the fetch completes, `.then()` checks `if (cancelled) return` and skips the update.

- `articleView.tsx:65, 88, 103, 109, 124`

---

## 8. Shadow DOM Style Sharing

**File:** `src/components/staticPreview.tsx:5-34`

---

### Single CSSStyleSheet fetched once

**Problem:** Without sharing, every Shadow DOM would independently fetch and parse the same 100KB+ CSS file. With 100 windows: 100 network requests × 100KB = 10MB of redundant CSS transfers, plus 100 independent CSS parse operations.

**Solution:** `ensureWikiStyleSheet()` fetches Wikipedia's stylesheet once on module load, converts it to a `CSSStyleSheet` via `new CSSStyleSheet()` + `sheet.replaceSync(css)`, and stores it as a module-level singleton. Zero duplicate fetches.

---

### Shared via adoptedStyleSheets

**Problem:** Even with a singleton stylesheet, if each Shadow DOM injected its own `<style>` tag, the browser would parse the CSS 100 times and store 100 copies of the rule set in memory.

**Solution:** Every shadow root receives the same `CSSStyleSheet` object via `root.adoptedStyleSheets = [wikiSheet]`. The browser stores one CSS rule set and shares it across all 100+ shadow roots. Memory-efficient and parse-once.

---

### Fallback for unsupported browsers

**Problem:** `adoptedStyleSheets` is not available in all browsers.

**Solution:** Falls back to injecting `<style>` tags with `SHADOW_STYLES` and `FALLBACK_STYLES` string constants. Doesn't include Wikipedia's full CSS, but provides essential overrides.

- `staticPreview.tsx:157-164` — shadow DOM innerHTML with inline `<style>` tags
- `staticPreview.tsx:167-177` — `adoptedStyleSheets` assignment with async fallback

---

## 9. Article Cache with LRU Eviction

**File:** `src/utils/articleCache.ts`

---

### Eviction on close and write

**Problem:** Without eviction, the cache grows unboundedly. Opening 1000 articles over a session keeps all 1000 cached — wasting memory for articles no longer displayed.

**Solution:** `evictClosedWindowArticles()` deletes cache entries for articles no longer displayed in any open window. Called on every `setCachedArticle()` and every window close. Only currently-visible articles stay cached.

---

### Synchronous reads

**Problem:** If cache lookups were async (like a Zustand selector or a fetch), they'd add latency to every component mount and URL change.

**Solution:** `getCachedArticle(title)` is a `Map.get()` — O(1) lookup, no async, no promise, no subscriber notification. Used in `useState` initializers (which must be synchronous) and `useEffect` for instant cache hits.

---

## 10. Prefetch System

**File:** `src/utils/articleCache.ts:48-64`

---

### Worker pool with bounded concurrency

**Problem:** Prefetching 100 titles fires 100 simultaneous fetch requests — overwhelming the browser's connection pool (limited to 6 concurrent connections per domain) and causing TCP queueing delays. The browser stalls waiting for connections to free up.

**Solution:** `prefetchArticles(titles, concurrency=4)` runs up to 4 parallel fetch workers. Uses a queue + worker pattern. Skips already-cached titles. Keeps the connection pool healthy.

---

### Where prefetching is triggered

- **Search autocomplete hover** — top 3 suggestions prefetched. By the user clicks, the article is cached.
- **Wiki link hover** — hovering any `<a>` in a Shadow DOM article triggers `prefetchArticles([wikiTitle])`. By the user clicks, the article is cached.
- **Link editor** — prefetched when adding links.

---

## 11. Frozen Window Stubs

**File:** `src/components/frozenPreview.tsx`

---

### Lightweight instead of Shadow DOM

**Problem:** A full `StaticPreview` creates a Shadow DOM, injects 100KB+ of CSS, attaches click/hover/scroll listeners, sets up a ResizeObserver, and renders cleaned Wikipedia HTML. For windows the user isn't looking at, this is wasted memory and CPU.

**Solution:** `FrozenPreview` renders ~200 bytes of plain HTML: title, thumbnail (`loading="lazy"`), 4-line snippet, and a "hover to load" hint. No Shadow DOM, no CSS injection, no event listeners. Orders of magnitude cheaper.

---

### Wake on interaction

**Problem:** Frozen windows need to become full articles when the user interacts with them.

**Solution:** `onMouseEnter` and `onWheel` trigger `onWakeUp()` which swaps the frozen stub back to a full `StaticPreview`. The full article loads from cache (instant) or fetches from Wikipedia.

- `frozenPreview.tsx:22-27` — `onMouseEnter` and `onWheel` handlers

---

## 12. Window Spawn Batching

**File:** `src/store/windows.ts:136-163`, `src/App.tsx:92-104`

**Problem:** Calling `addWindow()` 100 times creates 100 state updates, each triggering React reconciliation. 100 state updates × 100 component diffs = 10,000 comparison operations.

**Solution:** `spawnWindows()` builds all 100 windows in a local array, then calls `set()` once. Titles are fetched from Wikipedia's random API before spawning. 1 state update × 100 component diffs = 100 comparison operations — a 100x reduction.

- `App.tsx:92-104` — fetches 100 random titles, then calls `spawnWindows(100, 0, titles)`
- `windows.ts:136-163` — single `set()` call for all windows

---

## 13. FPS Counter

**File:** `src/App.tsx:10-49`

**Problem:** If the FPS counter used React state (`setFrames(f + 1)`), it would trigger a React re-render 60 times per second — adding overhead to the very thing it's trying to measure.

**Solution:** A `requestAnimationFrame` loop counts frames. The count is written directly to the DOM via `ref.current.textContent` — bypassing React entirely. `pointerEvents: "none"` on the overlay ensures it doesn't intercept mouse events.

---

## Summary Table

| # | Optimization | Problem it solves | Solution |
|---|---|---|---|
| 1 | Mousedown-first setup | Style recalc on first mousemove causes visible lag | Move all class/cursor/z-index work to mousedown |
| 2 | Zustand deferred to mouseup | 100 component diffs during gesture | Direct DOM z-index, sync store on mouseup |
| 3 | `translate3d` transform | `left`/`top` triggers layout recalc | GPU-composited transform, no layout |
| 4 | rAF batching | 60-120 DOM writes per second | 1 write per frame, coalesce events |
| 5 | Cached mouse position | `getBoundingClientRect()` forces layout | Read from variables, not DOM |
| 6 | `contain: strict` | Image load cascades reflow to all siblings | Isolates layout/paint/style/size per window |
| 7 | `will-change` during gesture only | 100+ GPU layers at rest wastes VRAM | Layer only when actively moving |
| 8 | `pointer-events: none` during gesture | Cross-origin iframe event routing stalls | Skip hit-testing on non-active windows |
| 9 | `memo()` on WindowItem | All 100 windows re-render on any change | Skip re-render for unchanged props |
| 10 | Module-level Maps | Scroll/cache at 60-120Hz triggers React | Bypass Zustand entirely for hot paths |
| 11 | HTML stripping | 2000-5000 nodes per article × 100 windows | Remove 30-60% of DOM before rendering |
| 12 | Shared CSSStyleSheet | 100 × 100KB CSS fetches + parses | 1 fetch, 1 parse, shared via adoptedStyleSheets |
| 13 | Two-phase loading | 200-500ms blank screen | Summary in ~50ms, full article in parallel |
| 14 | LRU cache eviction | Unbounded memory growth | Evict articles no longer in any window |
| 15 | Batch spawn | 100 state updates × 100 diffs = 10,000 ops | 1 state update × 100 diffs = 100 ops |
| 16 | Prefetch bounded to 4 | 100 simultaneous fetches overwhelm connections | Worker pool, 4 concurrent, skip cached |
| 17 | Frozen stubs | Full Shadow DOM for unseen windows | ~200 byte HTML stub, wake on hover |
