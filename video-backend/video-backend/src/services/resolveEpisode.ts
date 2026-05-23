import { toResolveResponse } from '../contracts/appVideoContract.js';

const fetchHtml = async (url: string) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);

  try {
    const res = await fetch(url, {
      headers: { 'user-agent': 'Mozilla/5.0' },
      signal: controller.signal,
    });

    if (!res.ok) throw new Error(`${url} ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
};

const decodeMaybe = (value: string, encrypt?: string) => {
  let output = value.replace(/\\\//g, '/');

  if (encrypt === '2') {
    output = Buffer.from(output, 'base64').toString('utf8');
  }

  try {
    output = decodeURIComponent(output);
  } catch {
    // keep original
  }

  return output;
};

const findMediaUrl = (html: string, pageUrl: string) => {
  const direct = html.match(/https?:\/\/[^"'\\\s]+?\.(?:m3u8|mp4)(?:\?[^"'\\\s]*)?/i)?.[0];
  if (direct) return direct.replace(/\\\//g, '/');

  const player = html.match(/player_[a-zA-Z0-9_]+\s*=\s*(\{[\s\S]*?\})/);
  const playerBody = player?.[1];

  if (playerBody) {
    const url = playerBody.match(/["']url["']\s*:\s*["']([^"']+)["']/)?.[1];
    const encrypt = playerBody.match(/["']encrypt["']\s*:\s*["']?(\d)["']?/)?.[1];

    if (url) {
      const decoded = decodeMaybe(url, encrypt);
      if (/^https?:\/\//i.test(decoded)) return decoded;
      return new URL(decoded, pageUrl).toString();
    }
  }

  return undefined;
};

export async function resolveEpisode(input: {
  videoId: string;
  line: number;
  episode: number;
  playPageUrl?: string;
}) {
  if (!input.playPageUrl) {
    throw new Error('playPageUrl is required');
  }

  const html = await fetchHtml(input.playPageUrl);
  const mediaUrl = findMediaUrl(html, input.playPageUrl);

  if (!mediaUrl) {
    throw new Error('mediaUrl not found');
  }

  return toResolveResponse(mediaUrl);
}
