import { errorJson, isUploadedFile, json, pickExtension, requireFarm, sanitizeSegment } from "../../_utils.js";

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

export async function onRequestPost(context) {
  const auth = await requireFarm(context);
  if (auth.response) return auth.response;
  if (!context.env.MEDIA_BUCKET) return errorJson("MEDIA_BUCKET が未設定です。", 500);

  const form = await context.request.formData();
  const image = form.get("image");
  if (!isUploadedFile(image) || !String(image.type || "").startsWith("image/")) {
    return errorJson("画像ファイルを選択してください。", 400);
  }
  if (image.size > MAX_IMAGE_BYTES) return errorJson("画像ファイルが大きすぎます。", 413);

  const ext = pickExtension(image, "jpg");
  const key = `profiles/${sanitizeSegment(auth.farmId)}/cover.${ext}`;
  await context.env.MEDIA_BUCKET.put(key, image.stream(), {
    httpMetadata: { contentType: image.type || "image/jpeg" },
  });
  return json({ ok: true, url: `/api/media/${key}` });
}

