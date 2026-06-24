export async function onRequestGet(context) {
  const { env, params, request } = context;
  if (!env.MEDIA_BUCKET) return new Response("storage not configured", { status: 500 });
  const parts = Array.isArray(params.path) ? params.path : [params.path];
  const key = parts.filter(Boolean).map((part) => decodeURIComponent(part)).join("/");
  if (!key) return new Response("not found", { status: 404 });

  const rangeHeader = request.headers.get("range");
  const range = rangeHeader ? parseRange(rangeHeader) : undefined;
  const object = range ? await env.MEDIA_BUCKET.get(key, { range }) : await env.MEDIA_BUCKET.get(key);
  if (!object) return new Response("not found", { status: 404 });

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("etag", object.httpEtag);
  headers.set("accept-ranges", "bytes");
  headers.set("cache-control", "public, max-age=3600");

  if (range && object.range) {
    const start = object.range.offset || 0;
    const length = object.range.length != null ? object.range.length : object.size - start;
    headers.set("content-range", `bytes ${start}-${start + length - 1}/${object.size}`);
    headers.set("content-length", String(length));
    return new Response(object.body, { status: 206, headers });
  }

  headers.set("content-length", String(object.size));
  return new Response(object.body, { status: 200, headers });
}

function parseRange(header) {
  const match = /bytes=(\d*)-(\d*)/.exec(header);
  if (!match) return undefined;
  const start = match[1] ? Number(match[1]) : undefined;
  const end = match[2] ? Number(match[2]) : undefined;
  if (start !== undefined && end !== undefined) return { offset: start, length: end - start + 1 };
  if (start !== undefined) return { offset: start };
  if (end !== undefined) return { suffix: end };
  return undefined;
}

