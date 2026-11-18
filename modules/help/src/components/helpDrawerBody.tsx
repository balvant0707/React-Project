// Ported 1:1 from COMPASS (app/src/components/helpDrawerBody.tsx).
import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Button, Input, List, Typography } from "antd";
import { ArrowLeftOutlined, ExportOutlined, SearchOutlined } from "@ant-design/icons";
import { useTranslation } from "react-i18next";
import { chapterForPath, getChapter, getChapters, searchHelp } from "../help/content";
import { HelpArticle, HelpResults, useHelpLanguage } from "../help/components";
import { resolveHref } from "../help/markdown";

// Content of the context help drawer: the chapter that explains the current page, a search box and a list of all
// chapters. Own choices (search hit, link to another chapter) last until the user moves to another page.
export default function HelpDrawerBody({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const lang = useHelpLanguage();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<{ slug: string; section?: string } | "all" | null>(null);
  useEffect(() => setPicked(null), [pathname]);

  const context = useMemo(() => chapterForPath(lang, pathname), [lang, pathname]);
  const hits = useMemo(() => (query.trim() ? searchHelp(lang, query, 20) : []), [lang, query]);

  const show = (slug: string, section?: string) => {
    setQuery("");
    setPicked({ slug, section: section || undefined });
  };
  const onLink = (href: string) => {
    if (href.startsWith("help:")) {
      const [slug, section] = href.slice(5).split("#");
      show(slug, section);
    } else navigate(resolveHref(href));
  };

  const selected = picked && picked !== "all" ? { chapter: getChapter(lang, picked.slug), section: picked.section } : picked === "all" ? null : context;
  const chapter = selected?.chapter;

  return (
    <div>
      <Input allowClear prefix={<SearchOutlined />} placeholder={t("help.searchPlaceholder")} value={query} onChange={(e) => setQuery(e.target.value)} style={{ marginBottom: 12 }} />
      {query.trim() ? (
        <HelpResults hits={hits} query={query} onOpen={show} />
      ) : chapter ? (
        <>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <Button size="small" type="text" icon={<ArrowLeftOutlined />} onClick={() => setPicked("all")}>{t("help.allTopics")}</Button>
            <Button
              size="small"
              type="link"
              icon={<ExportOutlined />}
              onClick={() => {
                onClose();
                navigate(`/help/${chapter.slug}${selected?.section ? `#${selected.section}` : ""}`);
              }}
            >
              {t("help.openManual")}
            </Button>
          </div>
          <HelpArticle chapter={chapter} section={selected?.section} onLink={onLink} title={<Typography.Title level={4} style={{ marginTop: 0 }}>{chapter.title}</Typography.Title>} />
        </>
      ) : (
        <List
          dataSource={getChapters(lang)}
          locale={{ emptyText: t("common.noData") }}
          renderItem={(c) => (
            <List.Item style={{ cursor: "pointer" }} onClick={() => show(c.slug)}>
              <List.Item.Meta title={c.title} description={c.summary} />
            </List.Item>
          )}
        />
      )}
    </div>
  );
}
