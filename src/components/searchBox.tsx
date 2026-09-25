import { useEffect, useRef, useState } from 'react'
import { useWindows } from '../store/windows'
import { prefetchArticles } from '../utils/articleCache'

type Suggestion = { title: string; url: string }

export default function SearchBox() {
  const addWindow = useWindows((s) => s.addWindow)
  const [query, setQuery] = useState('')
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [visible, setVisible] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [loading, setLoading] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 'f' || e.key === 'F')) {
        e.preventDefault()
        setVisible(true)
        setTimeout(() => {
          inputRef.current?.focus()
          inputRef.current?.select()
        }, 0)
      } else if (e.key === 'Escape' && visible) {
        setVisible(false)
      }
    }
    window.addEventListener('keydown', handleKeyDown, true)
    return () => window.removeEventListener('keydown', handleKeyDown, true)
  }, [visible])

  useEffect(() => {
    const q = query.trim()
    if (!q) {
      const resetTimer = setTimeout(() => {
        setSuggestions([])
        setSelectedIndex(0)
        setLoading(false)
      }, 0)
      return () => clearTimeout(resetTimer)
    }

    const timer = setTimeout(async () => {
      setLoading(true)
      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller
      try {
        const res = await fetch(
          `https://en.wikipedia.org/w/api.php?action=opensearch&format=json&origin=*&limit=8&search=${encodeURIComponent(q)}`,
          { signal: controller.signal },
        )
        if (!res.ok) return
        const [, titles, , urls]: [string, string[], string[], string[]] =
          await res.json()
        setSuggestions(
          titles.map((title, i) => ({ title, url: urls[i] })),
        )
        setSelectedIndex(0)
        prefetchArticles(titles.slice(0, 3))
      } catch {
        /* aborted or failed */
      } finally {
        setLoading(false)
      }
    }, 180)

    return () => clearTimeout(timer)
  }, [query])

  function openArticle(title: string, url: string) {
    addWindow({ title, url })
    setQuery('')
    setSuggestions([])
    setVisible(false)
  }

  async function handleFormSubmit(e: React.FormEvent) {
    e.preventDefault()
    const q = query.trim()
    if (!q) return

    if (suggestions.length > 0 && selectedIndex >= 0 && selectedIndex < suggestions.length) {
      const item = suggestions[selectedIndex]
      openArticle(item.title, item.url)
      return
    }

    abortRef.current?.abort()
    try {
      const res = await fetch(
        `https://en.wikipedia.org/w/api.php?action=opensearch&format=json&origin=*&limit=1&search=${encodeURIComponent(q)}`,
      )
      if (res.ok) {
        const [, titles, , urls]: [string, string[], string[], string[]] =
          await res.json()
        if (titles[0] && urls[0]) {
          openArticle(titles[0], urls[0])
          return
        }
      }
    } catch {
      /* ignore fetch or abort errors */
    }

    const formattedTitle = q.replace(/ /g, '_')
    openArticle(
      q,
      `https://en.wikipedia.org/wiki/${encodeURIComponent(formattedTitle)}`,
    )
  }

  const handleInputKeyDown = (e: React.KeyboardEvent) => {
    if (suggestions.length === 0) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIndex((prev) => (prev + 1) % suggestions.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIndex((prev) => (prev - 1 + suggestions.length) % suggestions.length)
    }
  }

  if (!visible) return null

  return (
    <div
      className="fixed inset-0 z-[99999] flex items-start justify-center pt-[10vh] bg-black/30 backdrop-blur-[8px] transition-all duration-200"
      onClick={() => setVisible(false)}
    >
      <div
        className="w-[660px] max-w-[92vw] bg-white/90 backdrop-blur-2xl border border-black/10 shadow-[0_24px_60px_rgba(0,0,0,0.18)] rounded-2xl overflow-hidden flex flex-col animate-[spotlight-in_0.15s_cubic-bezier(0.16,1,0.3,1)]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search Header Input */}
        <form className="flex items-center px-5 py-4 border-b border-gray-200/50" onSubmit={handleFormSubmit}>
          {loading ? (
            <svg className="w-5 h-5 text-gray-500 mr-3.5 flex-shrink-0 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          ) : (
            <svg className="w-5 h-5 text-gray-400 mr-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          )}
          <input
            ref={inputRef}
            className="flex-1 text-xl bg-transparent text-gray-900 placeholder-gray-400/80 border-none outline-none font-sans font-normal tracking-tight"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleInputKeyDown}
            placeholder="Spotlight Search Wikipedia…"
            autoFocus
          />
          <span className="px-2.5 py-1 text-xs font-semibold text-gray-400 bg-black/5 rounded border border-black/5 uppercase tracking-wider">
            Wikipedia
          </span>
        </form>

        {/* Suggestions Body */}
        {query.trim() !== '' && suggestions.length > 0 && (
          <ul className="m-0 p-2 list-none max-h-[500px] overflow-y-auto">
            {suggestions.map((s, i) => {
              const isSelected = i === selectedIndex
              return (
                <li key={s.url} className="py-0.5">
                  <button
                    type="button"
                    className={`flex items-center justify-between w-full text-left py-3.5 px-4 rounded-xl text-base font-sans transition-all duration-100 border-none cursor-pointer ${
                      isSelected
                        ? 'bg-black/10 text-gray-900 font-normal shadow-[inset_0_1px_0_rgba(255,255,255,0.6)]'
                        : 'text-gray-700 hover:bg-black/5'
                    }`}
                    onMouseEnter={() => setSelectedIndex(i)}
                    onClick={() => openArticle(s.title, s.url)}
                  >
                    <span className="flex items-center gap-3.5 truncate">
                      <span className={`w-7 h-7 rounded-lg flex items-center justify-center font-serif text-sm font-bold ${isSelected ? 'bg-black/15 text-gray-900' : 'bg-black/5 text-gray-500'}`}>
                        W
                      </span>
                      <span className="truncate text-lg">{s.title}</span>
                    </span>
                    <span className={`text-sm ml-3 flex items-center gap-1.5 ${isSelected ? 'text-gray-700 font-medium' : 'text-gray-400 opacity-0 group-hover:opacity-100'}`}>
                      {isSelected ? (
                        <>
                          <span>Open Window</span>
                          <kbd className="px-2 py-0.5 text-xs font-sans bg-black/10 rounded">↵</kbd>
                        </>
                      ) : null}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
