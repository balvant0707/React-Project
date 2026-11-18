// From COMPASS components/header.tsx (the better base: language, phone account menu, hide-on-scroll). Changes: search, bell,
// help and similar elements come from the modules (headerItems / headerSearch) instead of being imported; PhotoAvatar (private avatars bucket)
// the photo component is ported with the people module. The backend status banner sits under the header as in COMPASS.
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGetIdentity, useLogout } from '@refinedev/core';
import { Button, Grid, Layout, Popover, Space, Switch, Typography, theme as antdTheme } from 'antd';
import { BulbFilled, BulbOutlined, LogoutOutlined, UserOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useColorMode, useIsMobile } from '@rbp/ui';
import { PhotoAvatar } from '../people/PersonAvatar';
import { LanguageSwitch } from '../login/LanguageSwitch';
import { useShell } from './ShellContext';
import { GlobalSearch } from './GlobalSearch';
import { BackendStatusBanner } from './BackendStatusBanner';

const { Text } = Typography;

type Identity = { id: string; name?: string; email?: string; photo_url?: string | null };

const PhoneAccount = ({ identity, onNavigate }: { identity: Identity | undefined; onNavigate: () => void }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { mode, toggleMode } = useColorMode();
  const { mutate: logout } = useLogout();
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, minWidth: 220 }}>
      <Space size={8}>
        <PhotoAvatar size="small" photo={identity?.photo_url} icon={<UserOutlined />} />
        <Text strong>{identity?.name ?? identity?.email}</Text>
      </Space>
      {/* An explicit entry: people did not find out that the name opens the profile. */}
      <Button icon={<UserOutlined />} onClick={() => { onNavigate(); navigate('/profile'); }} block>{t('nav.profile')}</Button>
      <Space style={{ justifyContent: 'space-between', width: '100%' }}>
        <LanguageSwitch />
        <Switch checkedChildren={<BulbFilled />} unCheckedChildren={<BulbOutlined />} checked={mode === 'dark'} onChange={toggleMode} />
      </Space>
      <Button icon={<LogoutOutlined />} onClick={() => logout()} block>{t('common.logout')}</Button>
    </div>
  );
};

export const Header = () => {
  const { token } = antdTheme.useToken();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  // Below xl the name and the sign-out label give way, so the header stays one row and the search keeps its room.
  const roomy = Grid.useBreakpoint().xl ?? false;
  const { mode, toggleMode } = useColorMode();
  const { data: identity } = useGetIdentity<Identity>();
  const { mutate: logout } = useLogout();
  const { title, headerItems, headerSearch } = useShell();
  const name = identity?.name ?? identity?.email;
  const [accountOpen, setAccountOpen] = useState(false);
  const [hidden, setHidden] = useState(false);
  const items = [...headerItems].sort((a, b) => a.order - b.order);

  // Phone: the header is pinned (iOS 26 paints the status area from the pinned element at the top edge); it slides out when
  // scrolling down and back in when scrolling up.
  useEffect(() => {
    if (!isMobile) return;
    let last = window.scrollY;
    const onScroll = () => {
      const y = window.scrollY;
      const header = document.getElementById('app-header')?.offsetHeight ?? 0;
      if (y <= header) setHidden(false);
      else if (y > last + 6) setHidden(true);
      else if (y < last - 6) setHidden(false);
      last = y;
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [isMobile]);

  if (isMobile) {
    return (
      <>
      <Layout.Header
        id="app-header"
        style={{
          display: 'flex', alignItems: 'center',
          padding: 'env(safe-area-inset-top) max(12px, env(safe-area-inset-right)) 0 max(12px, env(safe-area-inset-left))',
          height: 'calc(48px + env(safe-area-inset-top))', lineHeight: 'normal',
          background: token.colorBgContainer, borderBottom: `1px solid ${token.colorBorderSecondary}`,
          position: 'sticky', top: 0, zIndex: 40,
          transform: hidden && !accountOpen ? 'translateY(-100%)' : 'none', transition: 'transform 0.2s ease',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }} onClick={() => navigate('/')}>{title.expanded}</div>
        <Space size={0} style={{ marginLeft: 'auto' }}>
          {items.filter((i) => i.phone).map((i) => <span key={i.key}>{i.element}</span>)}
          <Popover trigger="click" placement="bottomRight" open={accountOpen} onOpenChange={setAccountOpen}
            content={<PhoneAccount identity={identity} onNavigate={() => setAccountOpen(false)} />}>
            <Button type="text" shape="circle" aria-label={name} style={{ padding: 0 }}>
              <PhotoAvatar size="small" photo={identity?.photo_url} icon={<UserOutlined />} />
            </Button>
          </Popover>
        </Space>
      </Layout.Header>
      <BackendStatusBanner top={0} />
      </>
    );
  }

  return (
    <>
    <Layout.Header
      id="app-header"
      style={{
        display: 'flex', justifyContent: 'flex-end', alignItems: 'center', padding: '8px 16px', minHeight: 56, height: 'auto', lineHeight: 'normal',
        background: token.colorBgContainer, borderBottom: `1px solid ${token.colorBorderSecondary}`, gap: 16,
        position: 'sticky', top: 0, zIndex: 10,
      }}
    >
      {headerSearch ?? <GlobalSearch />}
      <Space size="middle" style={{ flexWrap: 'nowrap', flexShrink: 0 }}>
        {items.map((i) => <span key={i.key}>{i.element}</span>)}
        <LanguageSwitch />
        <Switch checkedChildren={<BulbFilled />} unCheckedChildren={<BulbOutlined />} checked={mode === 'dark'} onChange={toggleMode} />
        {identity ? (
          <>
            <Space size={8} style={{ cursor: 'pointer' }} onClick={() => navigate('/profile')} title={t('nav.profile')}>
              <PhotoAvatar size="small" photo={identity.photo_url} icon={<UserOutlined />} />
              {roomy ? <Text style={{ whiteSpace: 'nowrap' }}>{name}</Text> : null}
            </Space>
            <Button icon={<LogoutOutlined />} onClick={() => logout()} type="text" aria-label={t('common.logout')} title={t('common.logout')}>{roomy ? t('common.logout') : null}</Button>
          </>
        ) : null}
      </Space>
    </Layout.Header>
    <BackendStatusBanner top={56} />
    </>
  );
};
