import { errorJson, isUploadedFile, json, pickExtension, requireFarm, sanitizeSegment } from "../../_utils.js";

const MAX_VIDEO_BYTES = 80 * 1024 * 1024;
const MAX_PHOTO_BYTES = 12 * 1024 * 1024;
const MAX_PHOTOS = 12;

export async function onRequestPost(context) {
  const auth = await requireFarm(context);
  if (auth.response) return auth.response;
  if (!context.env.MEDIA_BUCKET || typeof context.env.MEDIA_BUCKET.put !== "function") {
    console.error("MEDIA_BUCKET binding is not available", { type: typeof context.env.MEDIA_BUCKET, hasPut: Boolean(context.env.MEDIA_BUCKET?.put) });
    return errorJson("MEDIA_BUCKET binding is not available", 500);
  }

  let form;
  try { form = await context.request.formData(); }
  catch (error) { console.error("Media upload formData failed", { message: error?.message || String(error) }); return errorJson("multipart form parse failed", 400); }

  const recordId = sanitizeSegment(form.get("recordId"), `${auth.farmId}-record`);
  const video = form.get("video");
  const photos = form.getAll("photo").filter(isUploadedFile).slice(0, MAX_PHOTOS);

  let videoUrl = "";
  if (isUploadedFile(video)) {
    if (video.size > MAX_VIDEO_BYTES) return errorJson("動画ファイルが大きすぎます。", 413);
    const ext = pickExtension(video, "mp4");
    const key = `records/${sanitizeSegment(auth.farmId)}/${recordId}/video.${ext}`;
    try { await putUploadedFile(context.env.MEDIA_BUCKET, key, video, video.type || "video/mp4"); }
    catch (error) { console.error("R2 video upload failed", { key, message: error?.message || String(error) }); return errorJson("media upload failed", 500); }
    videoUrl = `/api/media/${key}`;
  }

  const photoUrls = [];
  for (let i = 0; i < photos.length; i += 1) {
    const photo = photos[i];
    if (!String(photo.type || "").startsWith("image/") || photo.size > MAX_PHOTO_BYTES) continue;
    const ext = pickExtension(photo, "jpg");
    const key = `records/${sanitizeSegment(auth.farmId)}/${recordId}/photo-${i + 1}.${ext}`;
    try { await putUploadedFile(context.env.MEDIA_BUCKET, key, photo, photo.type || "image/jpeg"); }
    catch (error) { console.error("R2 photo upload failed", { key, message: error?.message || String(error) }); return errorJson("media upload failed", 500); }
    photoUrls.push(`/api/media/${key}`);
  }

  return json({ ok: true, videoUrl, photoUrls, videoThumbnailUrl: photoUrls[0] || "" });
}

async function putUploadedFile(bucket, key, file, contentType) {
  await bucket.put(key, await file.arrayBuffer(), { httpMetadata: { contentType } });
}