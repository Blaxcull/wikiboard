import { useState } from 'react'
import { useWindows } from '@/store/windows'

export default function SearchBox() {
  const addWindow = useWindows((s) => s.addWindow)
  const [query, setQuery] = useState('')

  function search(e: React.FormEvent) {
    e.preventDefault()
    const q = query.trim()
    if (!q) return
    addWindow({
      title: q,
      url: `https://en.wikipedia.org/wiki/Special:Search?search=${encodeURIComponent(q)}`,
    })
    setQuery('')
  }

  return (
    <form className="search-box" onSubmit={search}>
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search…"
      />
      <button type="submit">Search</button>
    </form>
  )
}
