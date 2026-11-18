// Ported 1:1 from COMPASS (app/src/pages/help/index.tsx).
import { useMemo } from "react";
import { useNavigate, useParams, useSearchParams, useLocation, Link } from "react-router-dom";
import { Card, Col, Empty, Input, Menu, Row, Select, Typography, theme as antdTheme } from "antd";
import { BookOutlined, SearchOutlined } from "@ant-design/icons";
import { useTranslation } from "react-i18next";
import { List as Page } from "@rbp/core"; // platform: the shell's list page (the banner carries the title)
import { useIsMobile } from "@rbp/ui";
import { getChapter, getChapters, searchHelp } from "../../help/content";
import { HelpArticle, HelpResults, useHelpLanguage } from "../../help/components";
import { idFor, resolveHref } from "../../help/markdown";

const { useToken } = antdTheme;

// The manual (/help, /help/:chapter#section). Search is its own box with ?q=; the same index also feeds the global
// search and the context help drawer (components/helpDrawer.tsx).
export const HelpPage = () => {
  const { t } = useTranslation();
  const { token } = useToken();
  const lang = useHelpLanguage();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const { chapter: slug } = useParams();
  const { hash } = useLocation();
  const [params, setParams] = useSearchParams();
  const query = params.get("q") ?? "";

  const chapters = getChapters(lang);
  const chapter = getChapter(lang, slug);
  const hits = useMemo(() => (query.trim() ? searchHelp(lang, query, 30) : []), [lang, query]);
  const section = hash.replace(/^#/, "") || undefined;

  const open = (to: string) => navigate(resolveHref(to));
  const setQuery = (value: string) => setParams(value ? { q: value } : {}, { replace: true });

  const search = (
    <Input
      allowClear
      prefix={<SearchOutlined />}
      placeholder={t("help.searchPlaceholder")}
      value={query}
      onChange={(e) => setQuery(e.target.value)}
      onPressEnter={(e) => e.currentTarget.blur()}
    />
  );

  let body;
  if (query.trim()) {
    body = (
      <>
        <Typography.Title level={4} style={{ marginTop: 0 }}>{t("help.searchResults", { count: hits.length })}</Typography.Title>
        <HelpResults hits={hits} query={query} onOpen={(c, s) => navigate(`/help/${c}${s ? `#${s}` : ""}`)} />
      </>
    );
  } else if (chapter) {
    const toc = chapter.sections.filter((s) => s.id !== "top");
    body = (
      <Row gutter={32} wrap={false}>
        <Col flex="auto" style={{ minWidth: 0, maxWidth: 820 }}>
          <HelpArticle chapter={chapter} section={section} onLink={open} title={<Typography.Title level={2} style={{ marginTop: 0 }}>{chapter.title}</Typography.Title>} />
        </Col>
        {!isMobile && toc.length > 0 && (
          <Col flex="220px" style={{ display: "none" }} className="help-toc">
            <div style={{ position: "sticky", top: 80 }}>
              <Typography.Text type="secondary" style={{ fontSize: 12, textTransform: "uppercase" }}>{t("help.onThisPage")}</Typography.Text>
              <ul style={{ listStyle: "none", padding: 0, margin: "8px 0 0" }}>
                {toc.map((s) => (
                  <li key={s.id} style={{ margin: "6px 0", fontSize: 13 }}>
                    <a
                      href={`#${s.id}`}
                      onClick={(e) => {
                        e.preventDefault();
                        document.getElementById(idFor(s.id))?.scrollIntoView({ block: "start", behavior: "smooth" });
                        navigate(`/help/${chapter.slug}#${s.id}`, { replace: true });
                      }}
                    >
                      {s.title}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          </Col>
        )}
      </Row>
    );
  } else if (slug) {
    body = <Empty description={t("common.notFound")} />;
  } else {
    body = (
      <Row gutter={[16, 16]}>
        {chapters.map((c) => (
          <Col key={c.slug} xs={24} md={12} xl={8}>
            <Link to={`/help/${c.slug}`}>
              <Card hoverable size="small" style={{ height: "100%" }} title={<><BookOutlined /> {c.title}</>}>
                <Typography.Text type="secondary">{c.summary}</Typography.Text>
              </Card>
            </Link>
          </Col>
        ))}
      </Row>
    );
  }

  return (
    <Page>
      <style>{`@media (min-width: 1280px) { .help-toc { display: block !important; } }`}</style>
      <Row gutter={24} wrap={isMobile}>
        <Col xs={24} lg={6} xl={5} style={{ marginBottom: 16 }}>
          <div style={{ position: isMobile ? "static" : "sticky", top: 72 }}>
            <div style={{ marginBottom: 12 }}>{search}</div>
            {isMobile ? (
              <Select
                style={{ width: "100%" }}
                value={slug}
                placeholder={t("help.allTopics")}
                options={chapters.map((c) => ({ value: c.slug, label: c.title }))}
                onChange={(value) => navigate(`/help/${value}`)}
              />
            ) : (
              <Menu
                mode="inline"
                selectedKeys={slug ? [slug] : ["overview"]}
                style={{ borderInlineEnd: `1px solid ${token.colorBorderSecondary}` }}
                items={[
                  { key: "overview", label: t("help.allTopics"), icon: <BookOutlined />, onClick: () => navigate("/help") },
                  ...chapters.map((c) => ({ key: c.slug, label: c.title, onClick: () => navigate(`/help/${c.slug}`) })),
                ]}
              />
            )}
          </div>
        </Col>
        <Col xs={24} lg={18} xl={19} style={{ minWidth: 0 }}>{body}</Col>
      </Row>
    </Page>
  );
};
