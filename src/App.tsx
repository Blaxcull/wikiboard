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

  function closeWindow(id: string) {
    deleteScroll(id)
    removeWindow(id)
    evictClosedWindowArticles()
  }

  return (
    <>
      <SearchBox />

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
