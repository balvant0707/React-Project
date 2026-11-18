import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { Button, Drawer, Grid, Layout, Menu, theme } from "antd";
import { LeftOutlined, LogoutOutlined, RightOutlined } from "@ant-design/icons";
import { CanAccess, useLogout, useMenu, useWarnAboutChange, type TreeMenuItem } from "@refinedev/core";
import { useThemedLayoutContext } from "@refinedev/antd";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Title } from "./Title";

// Taken over from COMPASS components/sider.tsx. Entries come from the module resources; fixed width.
// The sidebar. Entries and grouping come from the resources (navigation.tsx), every entry passes the access check.
// Open groups are kept in the browser.

const OPEN_KEY = "rbp.menu.open";
const WIDTH = 240; // fixed (docs/architecture.md section 6)
const PHONE_WIDTH = 260;
const readOpen = (): string[] => {
  try {
    const v = JSON.parse(localStorage.getItem(OPEN_KEY) ?? "[]");
    return Array.isArray(v) ? v.filter((k) => typeof k === "string") : [];
  } catch {
    return [];
  }
};
const writeOpen = (keys: string[]) => {
  try {
    localStorage.setItem(OPEN_KEY, JSON.stringify(keys));
  } catch {
    /* private window: only for this visit */
  }
};

export const Sider = () => {
  const { token } = theme.useToken();
  const { t } = useTranslation();
  const { siderCollapsed, setSiderCollapsed, mobileSiderOpen, setMobileSiderOpen } = useThemedLayoutContext();
  const { menuItems, selectedKey, defaultOpenKeys } = useMenu();
  const { warnWhen, setWarnWhen } = useWarnAboutChange();
  const { mutate: logout } = useLogout();
  const breakpoint = Grid.useBreakpoint();
  const isMobile = typeof breakpoint.lg === "undefined" ? false : !breakpoint.lg;

  const [openKeys, setOpenKeys] = useState<string[]>(readOpen);
  // Opening a page opens its group (defaultOpenKeys = the groups above the selected entry).
  const currentGroups = defaultOpenKeys.join("|");
  useEffect(() => {
    if (!currentGroups) return;
    setOpenKeys((keys) => {
      const missing = currentGroups.split("|").filter((k) => !keys.includes(k));
      if (!missing.length) return keys;
      const next = [...keys, ...missing];
      writeOpen(next);
      return next;
    });
  }, [currentGroups]);
  const onOpenChange = (keys: string[]) => {
    setOpenKeys(keys);
    writeOpen(keys);
  };

  const renderItems = (tree: TreeMenuItem[]): ReactNode[] =>
    tree.map((item) => {
      const label = item.label ?? item.meta?.label ?? item.name;
      const icon = item.meta?.icon;
      const children = item.children.filter((c) => !c.meta?.hide);
      return (
        <CanAccess key={item.key} resource={item.name} action="list" params={{ resource: item }}>
          {children.length > 0 ? (
            <Menu.SubMenu key={item.key} icon={icon} title={label}>
              {renderItems(children)}
            </Menu.SubMenu>
          ) : (
            <Menu.Item key={item.key} icon={icon}>
              <Link to={(item.meta?.menuLink as string | undefined) ?? item.list ?? ""}>{label}</Link>
            </Menu.Item>
          )}
        </CanAccess>
      );
    });

  const handleLogout = () => {
    if (warnWhen) {
      if (!window.confirm(t("nav.leaveUnsaved"))) return;
      setWarnWhen(false);
    }
    logout();
  };

  const menu = (
    <Menu
      mode="inline"
      className="sider-menu"
      selectedKeys={selectedKey ? [selectedKey] : []}
      // Collapsed, the groups open as flyouts; antd keeps that state itself.
      {...(siderCollapsed && !isMobile ? {} : { openKeys, onOpenChange })}
      style={isMobile ? { paddingTop: 8, border: "none", overflow: "auto", flex: 1, minHeight: 0 } : { paddingTop: 8, border: "none", overflow: "auto", height: "calc(100% - 72px)" }}
      onClick={() => setMobileSiderOpen(false)}
    >
      {renderItems(menuItems)}
      <Menu.Item key="logout" icon={<LogoutOutlined />} onClick={handleLogout}>
        {t("common.logout")}
      </Menu.Item>
    </Menu>
  );

  const titleBar = (collapsed: boolean, full = WIDTH): CSSProperties => ({
    width: collapsed ? 80 : full,
    padding: collapsed ? 0 : "0 16px",
    display: "flex",
    justifyContent: collapsed ? "center" : "flex-start",
    alignItems: "center",
    height: 64,
    backgroundColor: token.colorBgElevated,
    fontSize: 14,
  });

  // Phone: "More" in the bottom tabs opens the menu as a drawer, with the account block on top.
  if (isMobile) {
    return (
      <Drawer
        open={mobileSiderOpen}
        onClose={() => setMobileSiderOpen(false)}
        placement="left"
        closable={false}
        width={PHONE_WIDTH}
        styles={{ body: { padding: 0 } }}
      >
        <Layout>
          <Layout.Sider width={PHONE_WIDTH} style={{ height: "100dvh", backgroundColor: token.colorBgContainer }}>
            <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
              <div style={titleBar(false, PHONE_WIDTH)}>
                <Title collapsed={false} />
              </div>
              {menu}
            </div>
          </Layout.Sider>
        </Layout>
      </Drawer>
    );
  }

  const CollapseIcon = siderCollapsed ? RightOutlined : LeftOutlined;
  return (
    <>
      {/* Keeps the room of the fixed sider in the page flow. */}
      <div style={{ flex: "none", width: siderCollapsed ? 80 : WIDTH, transition: "all 0.2s" }} />
      <Layout.Sider
        width={WIDTH}
        collapsible
        collapsed={siderCollapsed}
        collapsedWidth={80}
        breakpoint="lg"
        onCollapse={(collapsed, type) => {
          if (type === "clickTrigger") setSiderCollapsed(collapsed);
        }}
        style={{
          backgroundColor: token.colorBgContainer,
          borderRight: `1px solid ${token.colorBgElevated}`,
          position: "fixed",
          top: 0,
          height: "100vh",
          zIndex: 999,
        }}
        trigger={
          <Button type="text" style={{ borderRadius: 0, height: "100%", width: "100%", backgroundColor: token.colorBgElevated }}>
            <CollapseIcon style={{ color: token.colorPrimary }} />
          </Button>
        }
      >
        <div style={titleBar(siderCollapsed)}>
          <Title collapsed={siderCollapsed} />
        </div>
        {menu}
      </Layout.Sider>
    </>
  );
};
