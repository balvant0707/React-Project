import { Avatar, type AvatarProps } from "antd";
import { UserOutlined } from "@ant-design/icons";
import { useAvatarUrl } from "./useAvatarUrl";

export const initials = (name?: string | null) =>
  (name ?? "").split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("");

type PersonRow = { name: string | null; photo_url: string | null };

// antd Avatar for a photo kept in the private avatars bucket (`photo` = users.photo_url, a storage path).
// `flex: none`: in a flex row next to text on a narrow screen the avatar would be squeezed into an oval.
export const PhotoAvatar = ({ photo, style, ...props }: Omit<AvatarProps, "src"> & { photo: string | null | undefined }) => (
  <Avatar {...props} style={{ flex: "none", ...style }} src={useAvatarUrl(photo)} />
);

// Photo or initials. Photos are set by HR only.
export const PersonAvatar = ({ person, size = 40 }: { person: Pick<PersonRow, "name" | "photo_url">; size?: number }) => (
  <PhotoAvatar photo={person.photo_url} size={size} icon={!person.name ? <UserOutlined /> : undefined} style={person.photo_url ? undefined : { backgroundColor: "#8c8c8c", flex: "none" }}>
    {initials(person.name)}
  </PhotoAvatar>
);
