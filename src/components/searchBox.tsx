import { useEffect, useRef, useState } from 'react'
import { useWindows } from '../store/windows'
import { prefetchArticles } from '../utils/articleCache'

type Suggestion = { title: string; url: string }

export default function SearchBox() {
  const addWindow = useWindows((s) => s.addWindow)
  const [query, setQuery] = useState('')
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [open, setOpen] = useState(false)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    const q = query.trim()
    const timer = setTimeout(async () => {
      if (!q) {
        setSuggestions([])
        setOpen(false)
        return
      }
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
        setOpen(true)
        prefetchArticles(titles.slice(0, 3))
      } catch {
        /* aborted or failed */
      }
    }, 200)

    return () => clearTimeout(timer)
  }, [query])

  function openArticle(title: string, url: string) {
    addWindow({ title, url })
    setQuery('')
    setSuggestions([])
    setOpen(false)
  }

  function search(e: React.FormEvent) {
    e.preventDefault()
    const top = suggestions[0]
    if (top) {
      openArticle(top.title, top.url)
      return
    }
    const q = query.trim()
    if (!q) return
    openArticle(
      q,
      `https://en.wikipedia.org/wiki/Special:Search?search=${encodeURIComponent(q)}`,
    )
  }

  return (
    <div className="fixed top-2.5 left-1/2 -translate-x-1/2 z-[9999] inline-block">
      <form className="flex gap-1 mb-2" onSubmit={search}>
        <input
          className="py-1 px-2 text-[13px] w-60"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => suggestions.length > 0 && setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          placeholder="Search Wikipedia…"
        />
        <button className="py-1 px-3 text-[13px] cursor-pointer" type="submit">Search</button>
      </form>

      {open && (
        <ul className="absolute top-full left-0 z-[1000] m-0 p-0 list-none bg-white border border-[#999] rounded min-w-60 max-h-[300px] overflow-y-auto" style={{ boxShadow: '0 4px 12px rgba(0,0,0,0.15)' }}>
          {suggestions.map((s, i) => (
            <li key={s.url} className={i > 0 ? 'border-t border-[#eee]' : ''}>
              <button
                type="button"
                className="block w-full text-left py-1.5 px-2.5 text-[13px] bg-transparent border-none cursor-pointer hover:bg-[#f0f0f0]"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => openArticle(s.title, s.url)}
              >
                {s.title}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
