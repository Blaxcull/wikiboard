import { useCallback, useEffect, useState } from "react";
import type { WindowData } from "../store/windows";
import { useWindows } from "../store/windows";
import {
  extractTitle,
  fetchArticle,
  fetchArticleSummary,
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

  const [summaryHtml, setSummaryHtml] = useState<string | null>(() => {
    const cached = title ? getCachedArticle(title) : undefined;
    return cached?.summaryHtml ?? null;
  });
  const [summaryThumb, setSummaryThumb] = useState<string | null>(() => {
    const cached = title ? getCachedArticle(title) : undefined;
    return cached?.thumbnail ?? null;
  });
  const [summaryDesc, setSummaryDesc] = useState<string>("");

  const [fullHtml, setFullHtml] = useState<string | null>(() => {
    const cached = title ? getCachedArticle(title) : undefined;
    return cached?.html ?? null;
  });
  const [loading, setLoading] = useState<boolean>(() => {
    const cached = title ? getCachedArticle(title) : undefined;
    return !cached && Boolean(title);
  });

  if (prevUrl !== win.url) {
    setPrevUrl(win.url);
    setScroll(win.id, 0, 0);
    const cached = title ? getCachedArticle(title) : undefined;
    setSummaryHtml(cached?.summaryHtml ?? null);
    setSummaryThumb(cached?.thumbnail ?? null);
    setSummaryDesc("");
    setFullHtml(cached?.html ?? null);
    setLoading(!cached && Boolean(title));
  }

  const handleScrollChange = useCallback(
    (y: number) => setScroll(win.id, 0, y),
    [win.id],
  );

  useEffect(() => {
    let cancelled = false;
    const articleTitle = extractTitle(win.url);
    if (!articleTitle) return;

    const cached = getCachedArticle(articleTitle);
    if (cached) return;

    // Phase 1: fetch summary (~50ms)
    fetchArticleSummary(articleTitle)
      .then((summary) => {
        if (cancelled) return;
        setSummaryHtml(summary.extractHtml);
        setSummaryThumb(summary.thumbnail);
        setSummaryDesc(summary.description);
        setLoading(false);

        const existing = getCachedArticle(articleTitle);
        setCachedArticle(
          articleTitle,
          existing?.html ?? "",
          existing?.preview ?? "",
          summary.thumbnail,
          summary.extractHtml,
        );
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });

    // Phase 2: fetch full article (runs in parallel)
    fetchArticle(articleTitle)
      .then((html) => {
        if (cancelled) return;
        setFullHtml(html);
        const existing = getCachedArticle(articleTitle);
        setCachedArticle(
          articleTitle,
          html,
          existing?.preview ?? "",
          existing?.thumbnail ?? null,
          existing?.summaryHtml ?? null,
        );
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
    if (!current || current.links.some((l) => l.href === url)) return;
    updateWindow(win.id, {
      links: [...current.links, { label: wikiTitle.replace(/_/g, " "), href: url }],
    });
    addWindow({ title: wikiTitle.replace(/_/g, " "), url });
  }

  // Full article ready — render it
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

  // Summary available — render lightweight preview
  if (summaryHtml) {
    return (
      <div className="article-view">
        <div className="static-preview" style={{ overflow: "auto" }}>
          <div style={{ padding: 12 }}>
            {summaryThumb && (
              <img
                src={summaryThumb}
                alt={title}
                style={{ maxWidth: "100%", maxHeight: 160, objectFit: "cover", borderRadius: 4, marginBottom: 8 }}
              />
            )}
            <h2 style={{ margin: "0 0 4px", fontSize: "1.25rem", fontWeight: 600 }}>
              {title.replace(/_/g, " ")}
            </h2>
            {summaryDesc && (
              <p style={{ margin: "0 0 8px", fontSize: 12, color: "#666" }}>
                {summaryDesc}
              </p>
            )}
            <div
              dangerouslySetInnerHTML={{ __html: summaryHtml }}
              style={{ fontSize: 14, lineHeight: 1.5 }}
            />
          </div>
        </div>
      </div>
    );
  }

  // Still loading
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
}
