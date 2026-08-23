import Window from './components/window'
import LinkEditor from './components/linkEditor'
import SearchBox from './components/searchBox'
import ArticleView from './components/articleView'
import { useWindows } from './store/windows'
import { deleteScroll } from './utils/scrollMemory'
import { evictClosedWindowArticles } from './utils/articleCache'

function App() {
  const windows = useWindows((s) => s.windows)
  const removeWindow = useWindows((s) => s.removeWindow)
  const setActive = useWindows((s) => s.setActive)
  const updateWindow = useWindows((s) => s.updateWindow)
  const spawnWindows = useWindows((s) => s.spawnWindows)

  function closeWindow(id: string) {
    deleteScroll(id)
    removeWindow(id)
    evictClosedWindowArticles()
  }

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
      <SearchBox />
      <button
        onClick={spawnWithRealTitles}
        style={{ position: 'fixed', top: 10, right: 10, zIndex: 9999 }}
      >
        Spawn 100 Windows
      </button>

      {windows.map((w) => (
        <Window
          key={w.id}
          className={w.active ? 'active' : 'inactive'}
          style={{ zIndex: w.zIndex }}
          titleBarContent={w.title}
          x={w.x}
          y={w.y}
          width={w.width}
          height={w.height}
          onActivate={() => setActive(w.id)}
          onClose={() => closeWindow(w.id)}
          onPositionChange={(pos) => updateWindow(w.id, pos)}
        >
          {w.url ? <ArticleView win={w} /> : <LinkEditor win={w} />}
        </Window>
      ))}
    </>
  )
}

export default App