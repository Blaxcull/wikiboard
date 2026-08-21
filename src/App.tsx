import Window from './components/window'
import LinkEditor from './components/linkEditor'
import SearchBox from './components/searchBox'
import { useWindows } from './store/windows'

function App() {
  const windows = useWindows((s) => s.windows)
  const removeWindow = useWindows((s) => s.removeWindow)
  const setActive = useWindows((s) => s.setActive)

  return (
    <>
      <SearchBox />

      {windows.map((w) => (
        <Window
          key={w.id}
          className={w.active ? 'active' : 'inactive'}
          titleBarContent={w.title}
          onActivate={() => setActive(w.id)}
          onClose={() => removeWindow(w.id)}
        >
          <LinkEditor win={w} />
        </Window>
      ))}
    </>
  )
}

export default App
