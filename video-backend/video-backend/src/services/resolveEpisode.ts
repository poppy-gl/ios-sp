import { toResolveResponse } from '../contracts/appVideoContract.js';
import { prisma } from '../db/prisma.js';
import { setDefaultResultOrder } from 'node:dns';
import { request as requestHttp } from 'node:http';
import { request as requestHttps } from 'node:https';

type ResolveInput = {
  videoId: string;
  line: number;
  episode: number;
  playPageUrl?: string;
};

type CachedResolveRow = {
  failureReason: string | null;
  mediaUrl: string | null;
  playPageUrl: string;
  updatedAt: Date | string;
};

const getPositiveNumber = (value: string | undefined, fallback: number) => {
  const parsed = Number(value);

  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const RESOLVE_SUCCESS_CACHE_TTL_MS = getPositiveNumber(
  process.env.RESOLVE_SUCCESS_CACHE_TTL_MS,
  24 * 60 * 60 * 1000,
);
const RESOLVE_FAILURE_CACHE_TTL_MS = getPositiveNumber(
  process.env.RESOLVE_FAILURE_CACHE_TTL_MS,
  30 * 60 * 1000,
);
const RESOLVE_FETCH_TIMEOUT_MS = getPositiveNumber(process.env.RESOLVE_FETCH_TIMEOUT_MS, 12_000);
const DIRECT_MEDIA_URL_PATTERN =
  /https?:\/\/[^"'<>\s\\]+?\.(?:m3u8|mp4|mov|m4v)(?:[?#][^"'<>\s\\]*)?/gi;
const PLAY_URL_QUERY_KEYS = [
  'url',
  'file',
  'source',
  'src',
  'video',
  'videoUrl',
  'playUrl',
  'play_url',
  'm3u8',
  'hls',
];

try {
  setDefaultResultOrder('ipv4first');
} catch {
  // Older Node runtimes may not expose this; fetch still works without it.
}

const getCacheId = (input: ResolveInput) => `${input.videoId}:${input.line}:${input.episode}`;
const pendingResolveRequests = new Map<string, Promise<ReturnType<typeof toResolveResponse>>>();

const isFresh = (value: Date | string, ttlMs: number) => {
  const timestamp = new Date(value).getTime();

  return Number.isFinite(timestamp) && Date.now() - timestamp < ttlMs;
};

const getCachedResolve = async (input: ResolveInput) => {
  try {
    const rows = await prisma.$queryRaw<CachedResolveRow[]>`
      SELECT mediaUrl, playPageUrl, failureReason, updatedAt
      FROM ResolvedEpisode
      WHERE id = ${getCacheId(input)}
      LIMIT 1
    `;
    const cached = rows[0];

    if (!cached || cached.playPageUrl !== input.playPageUrl) {
      return undefined;
    }

    if (cached.mediaUrl && isFresh(cached.updatedAt, RESOLVE_SUCCESS_CACHE_TTL_MS)) {
      return toResolveResponse(cached.mediaUrl);
    }

    if (cached.failureReason && isFresh(cached.updatedAt, RESOLVE_FAILURE_CACHE_TTL_MS)) {
      throw new Error(cached.failureReason);
    }
  } catch (error) {
    if (error instanceof Error && !/no such table|ResolvedEpisode/i.test(error.message)) {
      throw error;
    }
  }

  return undefined;
};

const cacheResolveSuccess = async (input: ResolveInput, mediaUrl: string) => {
  const result = toResolveResponse(mediaUrl);

  try {
    await prisma.$executeRaw`
      INSERT INTO ResolvedEpisode (
        id, videoId, line, episode, playPageUrl, mediaUrl, format, sourceType,
        reachable, failureReason, resolvedAt, createdAt, updatedAt
      )
      VALUES (
        ${getCacheId(input)}, ${input.videoId}, ${input.line}, ${input.episode},
        ${input.playPageUrl ?? ''}, ${result.mediaUrl}, ${result.format}, ${result.sourceType},
        ${result.reachable}, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      )
      ON CONFLICT(id) DO UPDATE SET
        playPageUrl = excluded.playPageUrl,
        mediaUrl = excluded.mediaUrl,
        format = excluded.format,
        sourceType = excluded.sourceType,
        reachable = excluded.reachable,
        failureReason = NULL,
        resolvedAt = CURRENT_TIMESTAMP,
        updatedAt = CURRENT_TIMESTAMP
    `;
  } catch (error) {
    console.warn('[resolveEpisode] cache success write failed', error);
  }

  return result;
};

const cacheResolveFailure = async (input: ResolveInput, error: unknown) => {
  const failureReason = error instanceof Error ? error.message : String(error);

  try {
    await prisma.$executeRaw`
      INSERT INTO ResolvedEpisode (
        id, videoId, line, episode, playPageUrl, mediaUrl, format, sourceType,
        reachable, failureReason, resolvedAt, createdAt, updatedAt
      )
      VALUES (
        ${getCacheId(input)}, ${input.videoId}, ${input.line}, ${input.episode},
        ${input.playPageUrl ?? ''}, NULL, NULL, NULL, false, ${failureReason},
        NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      )
      ON CONFLICT(id) DO UPDATE SET
        playPageUrl = excluded.playPageUrl,
        mediaUrl = NULL,
        format = NULL,
        sourceType = NULL,
        reachable = false,
        failureReason = excluded.failureReason,
        updatedAt = CURRENT_TIMESTAMP
    `;
  } catch (cacheError) {
    console.warn('[resolveEpisode] cache failure write failed', cacheError);
  }
};

const getErrorMessage = (error: unknown) => {
  if (!(error instanceof Error)) {
    return String(error);
  }

  const cause = error.cause;

  if (cause instanceof Error) {
    return `${error.message}: ${cause.message}`;
  }

  if (cause && typeof cause === 'object') {
    const code = 'code' in cause ? String(cause.code) : '';
    const message = 'message' in cause ? String(cause.message) : '';
    return [error.message, code, message].filter(Boolean).join(': ');
  }

  return error.message;
};

const buildFetchUrlCandidates = (url: string) => {
  const candidates = new Set<string>();

  candidates.add(url);

  try {
    const parsed = new URL(url);
    const alternateProtocol = new URL(url);
    alternateProtocol.protocol = parsed.protocol === 'https:' ? 'http:' : 'https:';
    candidates.add(alternateProtocol.toString());

    if (parsed.hostname.startsWith('www.')) {
      const withoutWww = new URL(url);
      withoutWww.hostname = parsed.hostname.replace(/^www\./i, '');
      candidates.add(withoutWww.toString());
    } else {
      const withWww = new URL(url);
      withWww.hostname = `www.${parsed.hostname}`;
      candidates.add(withWww.toString());
    }
  } catch {
    // Keep the original URL; validation is handled by fetch.
  }

  return [...candidates];
};

const buildRequestHeaders = (candidateUrl: string) => {
  const origin = new URL(candidateUrl).origin;

  return {
    accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'accept-encoding': 'identity',
    'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8',
    connection: 'close',
    host: new URL(candidateUrl).host,
    referer: origin,
    'user-agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/125 Safari/537.36',
  };
};

const fetchHtmlWithNativeRequest = (candidateUrl: string) =>
  new Promise<string>((resolve, reject) => {
    const parsed = new URL(candidateUrl);
    const path = `${parsed.pathname}${parsed.search}`;
    const port = parsed.port ? Number(parsed.port) : parsed.protocol === 'https:' ? 443 : 80;
    const requestOptions = {
      agent: false,
      headers: buildRequestHeaders(candidateUrl),
      hostname: parsed.hostname,
      method: 'GET',
      path,
      port,
    };
    const responseHandler = (res: import('node:http').IncomingMessage) => {
      const statusCode = res.statusCode ?? 0;
      const location = res.headers.location;

      if (statusCode >= 300 && statusCode < 400 && location) {
        res.resume();
        void fetchHtmlWithNativeRequest(new URL(location, candidateUrl).toString()).then(
          resolve,
          reject,
        );
        return;
      }

      if (statusCode < 200 || statusCode >= 300) {
        res.resume();
        reject(new Error(`${candidateUrl} HTTP ${statusCode}`));
        return;
      }

      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => {
        chunks.push(chunk);
      });
      res.on('end', () => {
        resolve(Buffer.concat(chunks).toString('utf8'));
      });
    };
    const req =
      parsed.protocol === 'https:'
        ? requestHttps(
            {
              ...requestOptions,
              minVersion: 'TLSv1.2',
              servername: parsed.hostname,
            },
            responseHandler,
          )
        : requestHttp(
            {
              ...requestOptions,
            },
            responseHandler,
          );

    req.setTimeout(RESOLVE_FETCH_TIMEOUT_MS, () => {
      req.destroy(new Error('native request timed out'));
    });
    req.on('error', reject);
    req.end();
  });

const fetchHtml = async (url: string) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), RESOLVE_FETCH_TIMEOUT_MS);
  const errors: string[] = [];

  try {
    for (const candidateUrl of buildFetchUrlCandidates(url)) {
      try {
        return await fetchHtmlWithNativeRequest(candidateUrl);
      } catch (error) {
        errors.push(`${candidateUrl} native: ${getErrorMessage(error)}`);
      }

      try {
        const res = await fetch(candidateUrl, {
          headers: buildRequestHeaders(candidateUrl),
          signal: controller.signal,
        });

        if (!res.ok) {
          throw new Error(`${candidateUrl} HTTP ${res.status}`);
        }

        return await res.text();
      } catch (error) {
        errors.push(`${candidateUrl}: ${getErrorMessage(error)}`);
      }
    }

    throw new Error(`fetch failed: ${errors.join(' | ')}`);
  } finally {
    clearTimeout(timer);
  }
};

const decodeMaybe = (value: string, encrypt?: string | number) => {
  let output = value.replace(/\\\//g, '/').replace(/&amp;/g, '&').trim();
  const normalizedEncrypt = String(encrypt ?? '').trim();

  if (normalizedEncrypt === '2') {
    output = Buffer.from(output, 'base64').toString('utf8');
  }

  try {
    output = decodeURIComponent(output);
  } catch {
    // keep original
  }

  if (normalizedEncrypt === '1') {
    try {
      output = unescape(output);
    } catch {
      // keep decoded URI output
    }
  }

  return output;
};

const isDirectMediaUrl = (value: string) =>
  /\.(?:m3u8|mp4|mov|m4v)(?:[?#]|$)/i.test(value.split('#')[0] ?? value);

const toAbsoluteUrl = (value: string, pageUrl: string) => {
  const clean = value.trim();

  if (!clean) {
    return undefined;
  }

  try {
    if (clean.startsWith('//')) {
      return `https:${clean}`;
    }

    return new URL(clean, pageUrl).toString();
  } catch {
    return undefined;
  }
};

const extractDirectMediaUrl = (value: string, pageUrl: string) => {
  const normalized = decodeMaybe(value);

  for (const match of normalized.matchAll(DIRECT_MEDIA_URL_PATTERN)) {
    const mediaUrl = toAbsoluteUrl(match[0], pageUrl);

    if (mediaUrl && isDirectMediaUrl(mediaUrl)) {
      return mediaUrl;
    }
  }

  return undefined;
};

const extractNestedMediaUrl = (value: string, pageUrl: string) => {
  const candidate = toAbsoluteUrl(value, pageUrl);

  if (!candidate) {
    return undefined;
  }

  if (isDirectMediaUrl(candidate)) {
    return candidate;
  }

  try {
    const parsed = new URL(candidate);

    for (const key of PLAY_URL_QUERY_KEYS) {
      const nested = parsed.searchParams.get(key);

      if (!nested) {
        continue;
      }

      const decodedNested = decodeMaybe(nested);
      const directNested = extractDirectMediaUrl(decodedNested, candidate);

      if (directNested) {
        return directNested;
      }

      const nestedUrl = toAbsoluteUrl(decodedNested, candidate);

      if (nestedUrl && isDirectMediaUrl(nestedUrl)) {
        return nestedUrl;
      }
    }
  } catch {
    // Not a URL with query params.
  }

  return undefined;
};

const parsePlayerBody = (playerBody: string) => {
  try {
    const parsed = JSON.parse(playerBody) as Record<string, unknown>;
    const url = typeof parsed.url === 'string' ? parsed.url : undefined;
    const encrypt =
      typeof parsed.encrypt === 'string' || typeof parsed.encrypt === 'number'
        ? parsed.encrypt
        : undefined;

    return { encrypt, url };
  } catch {
    const url = playerBody.match(/["']url["']\s*:\s*["']([^"']+)["']/)?.[1];
    const encrypt = playerBody.match(/["']encrypt["']\s*:\s*["']?(\d)["']?/)?.[1];

    return { encrypt, url };
  }
};

const findMediaUrl = (html: string, pageUrl: string) => {
  const direct = extractDirectMediaUrl(html, pageUrl);
  if (direct) return direct;

  for (const player of html.matchAll(/player_[a-zA-Z0-9_]+\s*=\s*(\{[\s\S]*?\})/g)) {
    const playerBody = player[1];

    if (!playerBody) {
      continue;
    }

    const { encrypt, url } = parsePlayerBody(playerBody);

    if (url) {
      const decoded = decodeMaybe(url, encrypt);
      const mediaUrl = extractNestedMediaUrl(decoded, pageUrl);

      if (mediaUrl) {
        return mediaUrl;
      }
    }
  }

  for (const match of html.matchAll(
    /["'](?:url|file|source|src|video|videoUrl|playUrl|play_url|m3u8|hls)["']\s*:\s*["']([^"']+)["']/gi,
  )) {
    const mediaUrl = extractNestedMediaUrl(decodeMaybe(match[1] ?? ''), pageUrl);

    if (mediaUrl) {
      return mediaUrl;
    }
  }

  return undefined;
};

export async function resolveEpisode(input: ResolveInput) {
  if (!input.playPageUrl) {
    throw new Error('playPageUrl is required');
  }

  const playPageUrl = input.playPageUrl;
  const cached = await getCachedResolve(input);

  if (cached) {
    return cached;
  }

  const pendingKey = `${getCacheId(input)}:${input.playPageUrl}`;
  const pending = pendingResolveRequests.get(pendingKey);

  if (pending) {
    return pending;
  }

  const request = (async () => {
    try {
      const html = await fetchHtml(playPageUrl);
      const mediaUrl = findMediaUrl(html, playPageUrl);

      if (!mediaUrl) {
        throw new Error('mediaUrl not found');
      }

      return await cacheResolveSuccess(input, mediaUrl);
    } catch (error) {
      await cacheResolveFailure(input, error);
      throw error;
    } finally {
      pendingResolveRequests.delete(pendingKey);
    }
  })();

  pendingResolveRequests.set(pendingKey, request);

  return request;
}
