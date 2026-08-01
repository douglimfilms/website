export default {
  async fetch(request, env) {
    const rangeHeader = request.headers.get('Range');
    if (!rangeHeader) {
      return env.ASSETS.fetch(request);
    }

    // The browser's Range request can also carry If-None-Match/If-Modified-Since
    // from its own cache. ASSETS.fetch() then honors the conditional check and
    // returns a bodyless 304 — which breaks range slicing, since there's no
    // content to slice. Strip conditional headers so we always get a full body.
    const assetHeaders = new Headers(request.headers);
    assetHeaders.delete('If-None-Match');
    assetHeaders.delete('If-Modified-Since');
    assetHeaders.delete('Range');
    const assetRequest = new Request(request.url, { headers: assetHeaders, method: request.method });
    const assetResponse = await env.ASSETS.fetch(assetRequest);

    if (!assetResponse.ok) {
      return assetResponse;
    }

    const match = /bytes=(\d*)-(\d*)/.exec(rangeHeader);
    if (!match || (!match[1] && !match[2])) {
      return assetResponse;
    }

    const buf = await assetResponse.arrayBuffer();
    const size = buf.byteLength;
    let start = match[1] ? parseInt(match[1], 10) : size - parseInt(match[2], 10);
    let end = match[2] && match[1] ? parseInt(match[2], 10) : size - 1;
    if (end >= size) end = size - 1;

    if (isNaN(start) || isNaN(end) || start > end || start < 0 || start >= size) {
      return new Response(null, {
        status: 416,
        headers: { 'Content-Range': `bytes */${size}` }
      });
    }

    const sliced = buf.slice(start, end + 1);
    const headers = new Headers(assetResponse.headers);
    headers.set('Content-Range', `bytes ${start}-${end}/${size}`);
    headers.set('Content-Length', String(sliced.byteLength));
    headers.set('Accept-Ranges', 'bytes');

    return new Response(sliced, { status: 206, headers });
  }
};
