import { errorJson, isUploadedFile, json, pickExtension, requireFarm, sanitizeSegment } from "../../_utils.js";

const MAX_VIDEO_BYTES = 80 * 1024 * 1024;
const MAX_PHOTO_BYTES = 12 * 1024 * 1024;
const MAX_PHOTOS = 12;

export async function onRequestPost(context) {
  const auth = await requireFarm(context);
  if (auth.response) return auth.response;
  if (!context.env.MEDIA_BUCKET) return errorJson("MEDIA_BUCKET が未設定です。", 500);

  const form = await context.request.formData();
  const recordId = sanitizeSegment(form.get("recordId"), `${auth.farmId}-record`);
  const video = form.get("video");
  const photos = form.getAll("photo").filter(isUploadedFile).slice(0, MAX_PHOTOS);

  let videoUrl = "";
  if (isUploadedFile(video)) {
    if (video.size > MAX_VIDEO_BYTES) return errorJson("完成動画が大きすぎます。", 413);
    const ext = pickExtension(video, "mp4");
    const key = `harvest/${sanitizeSegment(auth.farmId)}/${recordId}/video.${ext}`;
    await context.env.MEDIA_BUCKET.put(key, video.stream(), {
      httpMetadata: { contentType: video.type || "video/mp4" },
    });
    videoUrl = `/api/media/${key}`;
  }

  const photoUrls = [];
  for (let i = 0; i < photos.length; i += 1) {
    const photo = photos[i];
    if (!String(photo.type || "").startsWith("image/") || photo.size > MAX_PHOTO_BYTES) continue;
    const ext = pickExtension(photo, "jpg");
    const key = `harvest/${sanitizeSegment(auth.farmId)}/${recordId}/photo-${i + 1}.${ext}`;
    await context.env.MEDIA_BUCKET.put(key, photo.stream(), {
      httpMetadata: { contentType: photo.type || "image/jpeg" },
    });
    photoUrls.push(`/api/media/${key}`);
  }

  return json({
    ok: true,
    videoUrl,
    photoUrls,
    videoThumbnailUrl: photoUrls[0] || "",
  });
}

