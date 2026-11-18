import type { ReactNode } from "react";
import { NotificationOutlined, UserOutlined } from "@ant-design/icons";

// The icon of the record a conversation hangs on: `icon` in the headers of a conversation, `tile` = key of the icon set
// (@rbp/ui ICONS) for the tile in front of a conversation in the list. A module registers its record types.
const icons: Record<string, ReactNode> = { teams: <NotificationOutlined />, direct: <UserOutlined /> };
const tiles: Record<string, string> = { teams: "users" };

export const registerEntityIcon = (entityType: string, icon: { icon: ReactNode; tile: string }) => {
  icons[entityType] = icon.icon;
  tiles[entityType] = icon.tile;
};
export const conversationIcon = (entityType: string) => icons[entityType];
export const conversationTile = (entityType: string) => tiles[entityType] ?? "users";
