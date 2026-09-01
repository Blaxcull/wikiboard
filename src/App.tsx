import { memo, useCallback, useEffect, useMemo, useRef } from 'react'
import Window from './components/window'
import LinkEditor from './components/linkEditor'
import SearchBox from './components/searchBox'
import ArticleView from './components/articleView'
import { useWindows, type WindowData } from './store/windows'
import { deleteScroll } from './utils/scrollMemory'
import { evictClosedWindowArticles } from './utils/articleCache'

function Fps() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let frames = 0;
    let last = performance.now();
    let raf: number;

    function loop(now: number) {
      frames++;
      if (now - last >= 1000) {
        if (ref.current) ref.current.textContent = `${frames} fps`;
        frames = 0;
        last = now;
      }
      raf = requestAnimationFrame(loop);
    }
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div
      ref={ref}
      style={{
        position: "fixed",
        top: 10,
        left: 10,
        zIndex: 9999,
        background: "rgba(0,0,0,0.75)",
        color: "#0f0",
        fontFamily: "monospace",
        fontSize: 14,
        padding: "4px 8px",
        borderRadius: 4,
        pointerEvents: "none",
      }}
    />
  );
}

const WindowItem = memo(function WindowItem({ w }: { w: WindowData }) {
  const setActive = useWindows((s) => s.setActive)
  const updateWindow = useWindows((s) => s.updateWindow)
  const removeWindow = useWindows((s) => s.removeWindow)

  const zIndexStyle = useMemo(() => ({ zIndex: w.zIndex }), [w.zIndex])

  const handleActivate = useCallback(() => setActive(w.id), [w.id, setActive])
  const handleClose = useCallback(() => {
    deleteScroll(w.id)
    removeWindow(w.id)
    evictClosedWindowArticles()
  }, [w.id, removeWindow])
  const handlePositionChange = useCallback(
    (pos: { x?: number; y?: number; width?: number; height?: number }) =>
      updateWindow(w.id, pos),
    [w.id, updateWindow],
  )

  return (
    <Window
      className={w.active ? 'active' : 'inactive'}
      style={zIndexStyle}
      titleBarContent={w.title}
      x={w.x}
      y={w.y}
      width={w.width}
      height={w.height}
      onActivate={handleActivate}
      onClose={handleClose}
      onPositionChange={handlePositionChange}
    >
      {w.url ? <ArticleView win={w} /> : <LinkEditor win={w} />}
    </Window>
  )
})

function App() {
  const windows = useWindows((s) => s.windows)
  const spawnWindows = useWindows((s) => s.spawnWindows)

  async function spawnWithRealTitles() {
    try {
      const res = await fetch(
        'https://en.wikipedia.org/w/api.php?action=query&list=random&rnnamespace=0&rnlimit=100&format=json&origin=*',
      )
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      const titles = data.query.random.map((r: { title: string }) => r.title)
      spawnWindows(100, 0, titles)
    } catch (e) {
      console.error('Failed to fetch random articles, spawning with fallback titles:', e)
      spawnWindows(100, 0)
    }
  }

  return (
    <>
      <Fps />
      <SearchBox />
      <button
        onClick={spawnWithRealTitles}
        style={{ position: 'fixed', top: 10, right: 10, zIndex: 9999 }}
      >
        Spawn 100 Windows
      </button>
      <button
        onClick={async () => {
          try {
            const res = await fetch(
              'https://en.wikipedia.org/w/api.php?action=query&list=random&rnnamespace=0&rnlimit=50&format=json&origin=*',
            )
            if (!res.ok) throw new Error(`HTTP ${res.status}`)
            const data = await res.json()
            const titles = data.query.random.map((r: { title: string }) => r.title)
            spawnWindows(50, 0, titles)
          } catch (e) {
            console.error('Failed to fetch random articles, spawning with fallback titles:', e)
            spawnWindows(50, 0)
          }
        }}
        style={{ position: 'fixed', top: 40, right: 10, zIndex: 9999 }}
      >
        Spawn 50 Windows
      </button>
      <button
        onClick={async () => {
          try {
            const res = await fetch(
              'https://en.wikipedia.org/w/api.php?action=query&list=random&rnnamespace=0&rnlimit=75&format=json&origin=*',
            )
            if (!res.ok) throw new Error(`HTTP ${res.status}`)
            const data = await res.json()
            const titles = data.query.random.map((r: { title: string }) => r.title)
            spawnWindows(75, 0, titles)
          } catch (e) {
            console.error('Failed to fetch random articles, spawning with fallback titles:', e)
            spawnWindows(75, 0)
          }
        }}
        style={{ position: 'fixed', top: 70, right: 10, zIndex: 9999 }}
      >
        Spawn 75 Windows
      </button>

      {windows.map((w) => (
        <WindowItem key={w.id} w={w} />
      ))}
    </>
  )
}

export default App