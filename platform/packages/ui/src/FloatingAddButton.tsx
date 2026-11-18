// Taken over from COMPASS components/crud.tsx. Phone: the page's main "new" action as a round button at the bottom right above
// the tabs, like Teams. The spacer keeps the last card of a list clear of it. Uses the action colour (primary unless the app sets one).
import { Button, ConfigProvider } from 'antd';
import { PlusOutlined } from '@ant-design/icons';

// The app's action colour for its main "new" button (COMPASS: CI red, as its RedPrimary); unset = the theme's primary.
// Set once before rendering, like setAppLanguages.
let actionColor: string | undefined;
export const setActionColor = (color: string | undefined) => {
  actionColor = color;
};

export const BOTTOM_TABS_HEIGHT = 56;

// `spacer`: an empty block that keeps the last card clear of the button (off when the caller reserves the room itself).
export const FloatingAddButton = ({ label, onClick, spacer = true }: { label: string; onClick: () => void; spacer?: boolean }) => (
  <>
    {spacer && <div aria-hidden style={{ height: 72 }} />}
    <ConfigProvider theme={actionColor ? { token: { colorPrimary: actionColor } } : undefined}>
    <Button
      type="primary"
      shape="circle"
      aria-label={label}
      title={label}
      icon={<PlusOutlined style={{ fontSize: 24 }} />}
      onClick={onClick}
      style={{ position: 'fixed', right: 16, bottom: `calc(${BOTTOM_TABS_HEIGHT + 16}px + var(--bar-gap))`, zIndex: 49, width: 56, height: 56, boxShadow: '0 4px 12px rgba(0, 0, 0, 0.25)' }}
    />
    </ConfigProvider>
  </>
);
