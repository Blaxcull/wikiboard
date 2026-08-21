import { useEffect, useRef, useState } from 'react'
import { useWindows } from '../store/windows'

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
    <div className="search-wrap">
      <form className="search-box" onSubmit={search}>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => suggestions.length > 0 && setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          placeholder="Search Wikipedia…"
        />
        <button type="submit">Search</button>
      </form>

      {open && (
        <ul className="suggest">
          {suggestions.map((s) => (
            <li key={s.url}>
              <button
                type="button"
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
