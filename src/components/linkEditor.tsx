import { useState } from 'react'
import { useWindows, type WindowData } from '@/store/windows'

export default function LinkEditor({ win }: { win: WindowData }) {
  const updateWindow = useWindows((s) => s.updateWindow)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [label, setLabel] = useState('')
  const [url, setUrl] = useState('')

  function closeDialog() {
    setDialogOpen(false)
    setLabel('')
    setUrl('')
  }

  function addLink(e: React.FormEvent) {
    e.preventDefault()
    const href = url.trim()
    if (!href) return
    updateWindow(win.id, {
      links: [...win.links, { label: label.trim() || href, href }],
    })
    closeDialog()
  }

  return (
    <>
      <div className="link-area">
        <ul className="link-list">
          {win.links.map((link, i) => (
            <li key={`${link.href}-${i}`}>
              <a href={link.href} target="_blank" rel="noreferrer">
                {link.label}
              </a>
            </li>
          ))}
        </ul>
      </div>

      {dialogOpen && (
        <div className="dialog-overlay" onMouseDown={closeDialog}>
          <form
            className="dialog"
            onSubmit={addLink}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <h3>Add Link</h3>
            <label>
              Label
              <input
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="My link"
                autoFocus
              />
            </label>
            <label>
              URL
              <input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://example.com"
              />
            </label>
            <div className="dialog-actions">
              <button type="button" onClick={closeDialog}>
                Cancel
              </button>
              <button type="submit">Add</button>
            </div>
          </form>
        </div>
      )}
    </>
  )
}
