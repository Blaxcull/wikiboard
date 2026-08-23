import { useCallback, useEffect, useState } from "react";
import type { WindowData } from "../store/windows";
import { useWindows } from "../store/windows";
import {
  extractTitle,
  fetchArticle,
  extractFirstParagraph,
  extractFirstImage,
} from "../utils/wiki";
import {
  getCachedArticle,
  setCachedArticle,
} from "../utils/articleCache";
import { getScroll, setScroll } from "../utils/scrollMemory";
import StaticPreview from "./staticPreview";

type Props = { win: WindowData };

export default function ArticleView({ win }: Props) {
  const updateWindow = useWindows((s) => s.updateWindow);
  const addWindow = useWindows((s) => s.addWindow);

  const title = extractTitle(win.url) ?? "";
  const [prevUrl, setPrevUrl] = useState(win.url);
  const [article, setArticle] = useState<{
    html: string | null;
    preview: string;
    thumbnail: string | null;
  }>(() => {
    const cached = title ? getCachedArticle(title) : undefined;
    return {
      html: cached?.html ?? null,
      preview: cached?.preview ?? "",
      thumbnail: cached?.thumbnail ?? null,
    };
  });
  const [loading, setLoading] = useState<boolean>(() => {
    const cached = title ? getCachedArticle(title) : undefined;
    return !cached && Boolean(title);
  });

  if (prevUrl !== win.url) {
    setPrevUrl(win.url);
    setScroll(win.id, 0, 0);
    const cached = title ? getCachedArticle(title) : undefined;
    setArticle({
      html: cached?.html ?? null,
      preview: cached?.preview ?? "",
      thumbnail: cached?.thumbnail ?? null,
    });
    setLoading(!cached && Boolean(title));
  }

  const handleScrollChange = useCallback(
    (y: number) => setScroll(win.id, 0, y),
    [win.id],
  );

  useEffect(() => {
    let cancelled = false;
    const articleTitle = extractTitle(win.url);
    if (!articleTitle || getCachedArticle(articleTitle) !== undefined) {
      return;
    }

    fetchArticle(articleTitle)
      .then((fetchedHtml) => {
        if (cancelled) return;
        const p = extractFirstParagraph(fetchedHtml);
        const img = extractFirstImage(fetchedHtml);
        setCachedArticle(articleTitle, fetchedHtml, p, img);
        setArticle({
          html: fetchedHtml,
          preview: p,
          thumbnail: img,
        });
        setLoading(false);
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [win.url]);

  function handleLinkClick(wikiTitle: string) {
    const url = `https://en.wikipedia.org/wiki/${encodeURIComponent(wikiTitle)}`;
    const current = useWindows.getState().windows.find((w) => w.id === win.id);
    if (!current || current.links.some((l) => l.href === url)) return;
    updateWindow(win.id, {
      links: [...current.links, { label: wikiTitle.replace(/_/g, " "), href: url }],
    });
    addWindow({ title: wikiTitle.replace(/_/g, " "), url });
  }

  return (
    <div className={`article-view ${loading ? "loading" : ""}`}>
      {loading && <div className="article-loading">Loading article…</div>}
      {article.html !== null ? (
        <StaticPreview
          title={title}
          html={article.html}
          scrollTop={getScroll(win.id)?.y ?? 0}
          onLinkClick={handleLinkClick}
          onScrollChange={handleScrollChange}
        />
      ) : (
        !loading && (
          <div className="discarded-note">
            <strong>{win.title.replace(/_/g, " ")}</strong>
            <p>Could not load article</p>
          </div>
        )
      )}
    </div>
  );
}
