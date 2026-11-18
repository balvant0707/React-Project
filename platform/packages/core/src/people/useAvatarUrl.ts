import { useQuery } from "@tanstack/react-query";
import { SIGNED_URL_EXPIRES_IN, signedUrlBatcher } from "./signedUrlBatch";

const BUCKET = "avatars";

// Photos are in a private bucket and signed in batches (lib/signedUrlBatch.ts).
const sign = signedUrlBatcher(BUCKET);

// `photo` is users.photo_url: a path in the avatars bucket. null means no photo (initials are shown).
export function useAvatarUrl(photo: string | null | undefined) {
  return (
    useQuery({
      queryKey: ["signed-url", BUCKET, photo],
      enabled: !!photo,
      staleTime: (SIGNED_URL_EXPIRES_IN - 600) * 1000,
      queryFn: () => sign(photo!),
    }).data ?? undefined
  );
}
