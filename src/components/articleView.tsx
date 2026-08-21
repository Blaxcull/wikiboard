import type { WindowData } from '../store/windows'

export default function ArticleView({ win }: { win: WindowData }) {
  return <iframe className="article-frame" src={win.url} title={win.title} />
}
