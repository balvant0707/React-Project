// From NPM App.tsx (MainContentArea): the banner spans the full width, the page content sits below it, the modules' panels
// (contentAside, NPM notes panel) beside it; on a phone they stack below the content.
import { Outlet } from 'react-router-dom';
import { useIsMobile } from '@rbp/ui';
import { PageBannerProvider } from './pageBannerContext';
import { PageBanner } from './PageBanner';
import { BottomTabs } from './BottomTabs';
import { useShell } from './ShellContext';

export const MainContentArea = () => {
  const isMobile = useIsMobile();
  const { contentAsides } = useShell();
  return (
    <PageBannerProvider>
      <PageBanner />
      <div style={{ display: 'flex', width: '100%', alignItems: 'flex-start', flexDirection: isMobile ? 'column' : 'row' }}>
        <div id="page-content" style={{ flex: 1, minWidth: 0, width: '100%', paddingRight: isMobile ? 0 : 12 }}>
          <Outlet />
        </div>
        {contentAsides.map((Aside, i) => <Aside key={i} />)}
      </div>
      <BottomTabs />
    </PageBannerProvider>
  );
};
