import { isIP } from 'node:net';
export function clientIp(request, render = process.env.RENDER === 'true') {
  // Render's edge supplies X-Forwarded-For. Do not trust it on a direct local server.
  const forwarded = request.headers['x-forwarded-for'];
  if (render && typeof forwarded === 'string') {
    const address = forwarded.split(',')[0].trim();
    if (isIP(address)) return address;
  }
  return request.socket.remoteAddress || 'local';
}
