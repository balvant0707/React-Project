// The picture of a team, moved 1:1 from modules/messaging (hooks/useGroupPhotoUrl.ts, chats/groupAvatar.tsx,
// lib/groupPhoto.ts) so the team dialog in core can use it; the messaging files re-export these.
import { Avatar } from "antd";
import { TeamOutlined } from "@ant-design/icons";
import { useQuery } from "@tanstack/react-query";
import { shrinkImage } from "@rbp/ui";
import { supabaseClient } from "../supabase";
import { SIGNED_URL_EXPIRES_IN, signedUrlBatcher } from "../people/signedUrlBatch";

export const GROUP_PHOTO_BUCKET = "group-photos";

// Group pictures are in a private bucket and signed in batches, like the avatars (people/useAvatarUrl.ts).
const sign = signedUrlBatcher(GROUP_PHOTO_BUCKET);

export function useGroupPhotoUrl(path: string | null | undefined) {
  return (
    useQuery({
      queryKey: ["signed-url", GROUP_PHOTO_BUCKET, path],
      enabled: !!path,
      staleTime: (SIGNED_URL_EXPIRES_IN - 600) * 1000,
      queryFn: () => sign(path!),
    }).data ?? undefined
  );
}

// The picture of a group (a rounded square), or a team symbol when it has none.
export const GroupAvatar = ({ photoPath, size = 28 }: { photoPath: string | null | undefined; size?: number }) => {
  const url = useGroupPhotoUrl(photoPath);
  return <Avatar shape="square" size={size} src={url} icon={<TeamOutlined />} style={{ flex: "none", borderRadius: Math.round(size / 5) }} />;
};

// Sets the picture of a group: shrinks it to a JPEG, uploads it to <group id>/<time>.<ext>, points the group at it
// (RPC team_photo_set checks who may) and removes the previous file. Returns the new path.
export async function setGroupPhoto(groupId: string, file: File, previousPath: string | null): Promise<string> {
  const blob = await shrinkImage(file, 960, 0.82);
  // shrinkImage hands a small or undecodable file back unchanged: keep its own type (the bucket takes jpeg, png, webp up to 1 MB).
  const type = blob.type || file.type;
  const extension = type === "image/png" ? "png" : type === "image/webp" ? "webp" : "jpg";
  const path = `${groupId}/${Date.now()}.${extension}`;
  const storage = supabaseClient.storage.from(GROUP_PHOTO_BUCKET);
  const { error } = await storage.upload(path, blob, { contentType: type });
  if (error) throw error;
  const { error: setError } = await supabaseClient.rpc("team_photo_set", { p_team_id: groupId, p_path: path });
  if (setError) {
    await storage.remove([path]);
    throw setError;
  }
  if (previousPath) await storage.remove([previousPath]);
  return path;
}

export async function removeGroupPhoto(groupId: string, path: string): Promise<void> {
  const { error } = await supabaseClient.rpc("team_photo_set", { p_team_id: groupId, p_path: null });
  if (error) throw error;
  await supabaseClient.storage.from(GROUP_PHOTO_BUCKET).remove([path]);
}
