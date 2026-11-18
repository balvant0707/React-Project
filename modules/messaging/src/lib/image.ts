// shrinkImage moved to @rbp/ui (core's team dialog needs it); re-exported here for the modules that import it from this path.
export { shrinkImage } from "@rbp/ui";

// An attachment row that shows as a picture (thumbnail, gallery) rather than a file link.
export const isImage = (file: { mime_type?: string | null }) => !!file.mime_type?.startsWith("image/");
