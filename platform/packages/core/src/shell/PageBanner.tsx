// Taken over from NPM components/pageBanner.tsx. Changes: app name, gradient and photos come from the app (ShellConfig.banner),
// the title of a resource from its manifest entry (`title`) instead of entityConfig.ts.
import { Link } from 'react-router-dom';
import { useResourceParams, useBreadcrumb } from '@refinedev/core';
import { theme } from 'antd';
import { useIsMobile } from '@rbp/ui';
import { usePageBannerOverride, usePageBannerSubtitleOverride, usePageBannerCrumbExtraOverride } from './pageBannerContext';
import { useShell } from './ShellContext';

export const PageBanner = () => {
  const { resource, action } = useResourceParams();
  const { breadcrumbs } = useBreadcrumb();
  const isMobile = useIsMobile();
  const { token } = theme.useToken();
  const { banner, appName } = useShell();
  const titleOverride = usePageBannerOverride();
  const subtitle = usePageBannerSubtitleOverride();
  const crumbExtra = usePageBannerCrumbExtraOverride();

  if (!resource?.name || breadcrumbs.length === 0) return null;

  const meta = resource.meta as { pageTitle?: string } | undefined;
  // A detail page without its own title (usePageBannerTitle) is titled with its resource, never with the generic "Show" / "Edit".
  const detail = !!action && action !== 'list';
  const title = titleOverride ?? meta?.pageTitle ?? breadcrumbs[breadcrumbs.length - (detail && breadcrumbs.length > 1 ? 2 : 1)].label;
  // useBreadcrumb appends a generic trailing "Show"/"Edit"/"Create" entry for any non-list action; the title says it already.
  const crumbs = detail ? breadcrumbs.slice(0, -1) : breadcrumbs;
  const image = banner.images?.[resource.name] ?? banner.defaultImage;
  const card = !image;
  // COMPASS: a detail page shows its record itself, the banner would only repeat it and cost room.
  if (card && detail) return null;
  const layers = image ? `${banner.gradient}, url(${image.src})` : banner.gradient;

  return (
    <div
      id="page-banner"
      style={{
        position: 'relative',
        // Without a photo (COMPASS): a rounded card inside the content padding, as high as its content (RADAR's vertical padding).
        // With photos (RADAR): the full-bleed band with a fixed minimum height.
        margin: card ? (isMobile ? '0 0 16px' : '0 0 24px') : isMobile ? '-12px -12px 16px' : '-12px -12px 24px',
        borderRadius: card ? token.borderRadiusLG : undefined,
        minHeight: card ? undefined : isMobile ? 108 : 168,
        // Side padding: card 16px inside the content's 12px, band 28px = where table and card text starts, so the title lines up with the text below.
        padding: isMobile ? '18px 16px' : card ? '28px 16px' : '28px 28px',
        display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: isMobile ? 4 : 8,
        backgroundImage: layers,
        backgroundSize: image ? `cover, ${image.size ?? 'cover'}` : 'cover',
        backgroundPosition: image ? `center, ${image.position ?? 'center'}` : 'center',
        backgroundRepeat: 'no-repeat, no-repeat',
        color: '#fff',
        overflow: 'hidden',
      }}
    >
      <span style={{ fontSize: isMobile ? 12 : 14, fontWeight: 400, opacity: 0.85, letterSpacing: 0.3 }}>
        <Link to="/" className="page-banner-crumb" style={{ color: 'inherit' }}>{appName}</Link>
        {crumbs.map((crumb, i) => (
          <span key={`${crumb.label}-${i}`}>
            {' / '}
            {crumb.href ? <Link to={crumb.href} className="page-banner-crumb" style={{ color: 'inherit' }}>{crumb.label}</Link> : crumb.label}
          </span>
        ))}
        {crumbExtra && <span>{` / ${crumbExtra}`}</span>}
      </span>
      <span style={{ fontSize: isMobile ? 22 : 34, fontWeight: 400, lineHeight: 1.15, letterSpacing: 0.4, textTransform: 'uppercase' }}>{title}</span>
      {subtitle && (
        <span style={{ fontSize: isMobile ? 12 : 14, fontWeight: 400, color: '#fff', lineHeight: 1.3, letterSpacing: 0.2 }}>{subtitle}</span>
      )}
    </div>
  );
};
