import { memo, useState } from 'react'
import { useWindows, type WindowData } from '@/store/windows'

const LinkEditor = memo(function LinkEditor({ win }: { win: WindowData }) {
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
      <div className="min-h-full">
        <ul className="m-0 pl-5 list-disc">
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
        <div className="fixed inset-0 bg-[rgba(0,0,0,0.4)] flex items-center justify-center z-[100]" onMouseDown={closeDialog}>
          <form
            className="bg-white text-[#111] border-2 border-[#333] rounded-md p-4 w-[280px] flex flex-col gap-2.5"
            onSubmit={addLink}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <h3 className="m-0 text-sm font-semibold">Add Link</h3>
            <label className="flex flex-col gap-1 text-xs">
              Label
              <input
                className="py-1 px-2 text-xs border border-[#999] rounded"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="My link"
                autoFocus
              />
            </label>
            <label className="flex flex-col gap-1 text-xs">
              URL
              <input
                className="py-1 px-2 text-xs border border-[#999] rounded"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://example.com"
              />
            </label>
            <div className="flex justify-end gap-2 mt-1">
              <button className="py-1 px-3 text-xs cursor-pointer" type="button" onClick={closeDialog}>
                Cancel
              </button>
              <button className="py-1 px-3 text-xs cursor-pointer" type="submit">Add</button>
            </div>
          </form>
        </div>
      )}
    </>
  )
})

export default LinkEditor
