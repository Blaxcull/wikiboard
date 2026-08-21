import { useEffect, useRef, useState } from "react";
import type { WindowData } from "../store/windows";
import { useWindows } from "../store/windows";
import { buildSrcdoc, extractTitle, fetchArticle } from "../utils/wiki";

type Props = { win: WindowData };

export default function ArticleView({ win }: Props) {
  const updateWindow = useWindows((s) => s.updateWindow);
  const addWindow = useWindows((s) => s.addWindow);
  const setActive = useWindows((s) => s.setActive);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [srcdoc, setSrcdoc] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const title = extractTitle(win.url);
    const timer = setTimeout(() => {
      if (!title) {
        setSrcdoc("");
        setLoading(false);
        return;
      }
      setLoading(true);
      fetchArticle(title)
        .then((html) => {
          if (!cancelled) {
            setSrcdoc(buildSrcdoc(html, title));
            setLoading(false);
          }
        })
        .catch(() => {
          if (!cancelled) setLoading(false);
        });
    }, 0);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [win.url]);

  useEffect(() => {
    function onMessage(e: MessageEvent) {
      if (e.source !== iframeRef.current?.contentWindow) return;
      const data = e.data as { type?: string; title?: string };
      if (data?.type === "wiki-focus") {
        setActive(win.id);
        return;
      }
      if (data?.type !== "wiki-link" || !data.title) return;
      const title = data.title;
      const url = `https://en.wikipedia.org/wiki/${encodeURIComponent(title)}`;
      const current = useWindows
        .getState()
        .windows.find((w) => w.id === win.id);
      if (!current || current.links.some((l) => l.href === url)) return;
      updateWindow(win.id, {
        links: [...current.links, { label: title.replace(/_/g, " "), href: url }],
      });
      addWindow({ title: title.replace(/_/g, " "), url });
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [win.id, updateWindow, addWindow, setActive]);

  return (
    <div className={`article-view ${loading ? "loading" : ""}`}>
      {loading && <div className="article-loading">Loading article…</div>}
      <iframe
        ref={iframeRef}
        className="article-frame"
        title={win.title}
        srcDoc={srcdoc}
        onLoad={() => setLoading(false)}
      />
    </div>
  );
}
