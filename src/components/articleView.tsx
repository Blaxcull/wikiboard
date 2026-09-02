import { memo, useCallback, useEffect, useState } from "react";
import type { WindowData } from "../store/windows";
import { useWindows } from "../store/windows";
import {
  extractTitle,
  fetchArticle,
  fetchFileUrl,
} from "../utils/wiki";
import {
  getCachedArticle,
  setCachedArticle,
} from "../utils/articleCache";
import { getScroll, setScroll } from "../utils/scrollMemory";
import StaticPreview from "./staticPreview";

type Props = { win: WindowData };

const ArticleView = memo(function ArticleView({ win }: Props) {
  const updateWindow = useWindows((s) => s.updateWindow);
  const addWindow = useWindows((s) => s.addWindow);

  const title = extractTitle(win.url) ?? "";
  const [prevUrl, setPrevUrl] = useState(win.url);

  const [fullHtml, setFullHtml] = useState<string | null>(() => {
    const cached = title ? getCachedArticle(title) : undefined;
    return cached?.html ?? null;
  });
  const [loading, setLoading] = useState<boolean>(() => {
    const cached = title ? getCachedArticle(title) : undefined;
    return !cached && Boolean(title);
  });

  const [fileInfo, setFileInfo] = useState<{ url: string; width: number; height: number } | null>(null);

  if (prevUrl !== win.url) {
    setPrevUrl(win.url);
    setScroll(win.id, 0, 0);
    const cached = title ? getCachedArticle(title) : undefined;
    setFullHtml(cached?.html ?? null);
    setLoading(!cached && Boolean(title));
    setFileInfo(null);
  }

  const handleScrollChange = useCallback(
    (y: number) => setScroll(win.id, 0, y),
    [win.id],
  );

  useEffect(() => {
    let cancelled = false;
    const articleTitle = extractTitle(win.url);
    if (!articleTitle) return;

    if (articleTitle.startsWith("File:")) {
      fetchFileUrl(articleTitle).then((info) => {
        if (!cancelled) setFileInfo(info);
      }).catch(() => {});
      return;
    }

    if (articleTitle.startsWith("Special:") || articleTitle.startsWith("Help:") || articleTitle.startsWith("Wikipedia:")) {
      setLoading(false);
      return;
    }

    const cached = getCachedArticle(articleTitle);
    if (cached) return;

    fetchArticle(articleTitle)
      .then((html) => {
        if (cancelled) return;
        setFullHtml(html);
        setLoading(false);
        setCachedArticle(articleTitle, html, "", null);
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [win.url]);

  function handleLinkClick(wikiTitle: string) {
    const url = `https://en.wikipedia.org/wiki/${wikiTitle.replace(/ /g, "_")}`;
    const current = useWindows.getState().windows.find((w) => w.id === win.id);
    if (!current) return;
    if (!current.links.some((l) => l.href === url)) {
      updateWindow(win.id, {
        links: [...current.links, { label: wikiTitle.replace(/_/g, " "), href: url }],
      });
    }
    addWindow({ title: wikiTitle.replace(/_/g, " "), url });
  }

  if (fullHtml) {
    return (
      <div className="article-view">
        <StaticPreview
          title={title}
          html={fullHtml}
          scrollTop={getScroll(win.id)?.y ?? 0}
          onLinkClick={handleLinkClick}
          onScrollChange={handleScrollChange}
        />
      </div>
    );
  }

  if (title.startsWith("File:")) {
    return (
      <div className="article-view">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", background: "#f8f9fa" }}>
          {fileInfo ? (
            <img
              src={fileInfo.url}
              alt={title.replace(/_/g, " ")}
              style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }}
            />
          ) : (
            <div className="discarded-note">
              <strong>{title.replace(/_/g, " ")}</strong>
              <p>Loading image…</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (title.startsWith("Special:") || title.startsWith("Help:") || title.startsWith("Wikipedia:")) {
    return (
      <div className="article-view">
        <div className="discarded-note">
          <strong>{title.replace(/_/g, " ")}</strong>
          <p>Not an article</p>
          <p style={{ fontSize: 11, color: "#999" }}>{title.split(":")[0]} pages can't be displayed</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`article-view ${loading ? "loading" : ""}`}>
      {loading && <div className="article-loading">Loading article…</div>}
      {!loading && (
        <div className="discarded-note">
          <strong>{title.replace(/_/g, " ")}</strong>
          <p>Could not load article</p>
        </div>
      )}
    </div>
  );
});

export default ArticleView;
