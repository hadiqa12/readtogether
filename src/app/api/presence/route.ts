import { NextRequest, NextResponse } from "next/server";
import { Redis } from "@upstash/redis";

const GENRES = new Set([
  "fantasy",
  "mystery",
  "romance",
  "scifi",
  "classics",
  "poetry",
]);
const PRESENCE_TTL_SECONDS = 15;
const PRESENCE_TTL_MS = PRESENCE_TTL_SECONDS * 1_000;
const KEY_PREFIX = "common-margins:v1";

export const dynamic = "force-dynamic";

type PresenceReader = {
  id: string;
  name: string;
  book: string;
  genre: string;
  photo?: string;
  x: number;
  y: number;
  lastSeen: number;
};

type PresenceStore = Map<string, PresenceReader>;

declare global {
  var commonMarginsPresence: PresenceStore | undefined;
}

let redisClient: Redis | null | undefined;

function getRedis() {
  if (redisClient !== undefined) return redisClient;

  const upstashUrl = process.env.UPSTASH_REDIS_REST_URL?.trim();
  const upstashToken = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();
  const kvUrl = process.env.KV_REST_API_URL?.trim();
  const kvToken = process.env.KV_REST_API_TOKEN?.trim();

  if (upstashUrl && upstashToken) {
    redisClient = new Redis({
      url: upstashUrl,
      token: upstashToken,
      enableTelemetry: false,
    });
    return redisClient;
  }

  if (kvUrl && kvToken) {
    redisClient = new Redis({
      url: kvUrl,
      token: kvToken,
      enableTelemetry: false,
    });
    return redisClient;
  }

  if (upstashUrl || upstashToken || kvUrl || kvToken) {
    throw new Error(
      "Redis presence is partially configured. Set both URL and token variables.",
    );
  }

  redisClient = null;
  return redisClient;
}

function getMemoryStore() {
  return (
    globalThis.commonMarginsPresence ??
    (globalThis.commonMarginsPresence = new Map<string, PresenceReader>())
  );
}

function readerKey(id: string) {
  return `${KEY_PREFIX}:reader:${id}`;
}

function genreKey(genre: string) {
  return `${KEY_PREFIX}:genre:${genre}`;
}

function pruneMemory(store: PresenceStore) {
  const cutoff = Date.now() - PRESENCE_TTL_MS;
  for (const [id, reader] of store) {
    if (reader.lastSeen < cutoff) store.delete(id);
  }
}

async function readersIn(genre: string) {
  const redis = getRedis();
  if (!redis) {
    const store = getMemoryStore();
    pruneMemory(store);
    return [...store.values()].filter((reader) => reader.genre === genre);
  }

  const membersKey = genreKey(genre);
  await redis.zremrangebyscore(membersKey, 0, Date.now());
  const ids = await redis.zrange<string[]>(membersKey, 0, -1);
  if (ids.length === 0) return [];

  const readers = await redis.mget<(PresenceReader | null)[]>(
    ...ids.map(readerKey),
  );
  return readers.filter(
    (reader): reader is PresenceReader =>
      reader !== null && reader.genre === genre,
  );
}

async function join(reader: PresenceReader) {
  const now = Date.now();
  const next = { ...reader, lastSeen: now };
  const redis = getRedis();
  if (!redis) {
    getMemoryStore().set(next.id, next);
    return;
  }

  await redis
    .pipeline()
    .set(readerKey(next.id), next, { ex: PRESENCE_TTL_SECONDS })
    .zadd(genreKey(next.genre), {
      score: now + PRESENCE_TTL_MS,
      member: next.id,
    })
    .expire(genreKey(next.genre), PRESENCE_TTL_SECONDS * 4)
    .exec();
}

async function heartbeat(id: string, genre: string) {
  const redis = getRedis();
  if (!redis) {
    const store = getMemoryStore();
    pruneMemory(store);
    const existing = store.get(id);
    if (!existing || existing.genre !== genre) return false;
    store.set(id, { ...existing, lastSeen: Date.now() });
    return true;
  }

  const existing = await redis.get<PresenceReader>(readerKey(id));
  if (!existing || existing.genre !== genre) return false;

  const now = Date.now();
  await redis
    .pipeline()
    .set(readerKey(id), { ...existing, lastSeen: now }, {
      ex: PRESENCE_TTL_SECONDS,
    })
    .zadd(genreKey(genre), {
      score: now + PRESENCE_TTL_MS,
      member: id,
    })
    .expire(genreKey(genre), PRESENCE_TTL_SECONDS * 4)
    .exec();
  return true;
}

async function leave(id: string) {
  const redis = getRedis();
  if (!redis) {
    getMemoryStore().delete(id);
    return;
  }

  const existing = await redis.get<PresenceReader>(readerKey(id));
  const pipeline = redis.pipeline().del(readerKey(id));
  if (existing) pipeline.zrem(genreKey(existing.genre), id);
  await pipeline.exec();
}

function json(data: unknown, status = 200) {
  return NextResponse.json(data, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

function serviceUnavailable(error: unknown) {
  console.error(
    "Presence store unavailable:",
    error instanceof Error ? error.message : "Unknown Redis error",
  );
  return json({ error: "Presence is temporarily unavailable." }, 503);
}

function validReader(value: unknown): value is PresenceReader {
  if (!value || typeof value !== "object") return false;
  const reader = value as Partial<PresenceReader>;
  return (
    typeof reader.id === "string" &&
    reader.id.length <= 80 &&
    typeof reader.name === "string" &&
    reader.name.length > 0 &&
    reader.name.length <= 40 &&
    typeof reader.book === "string" &&
    reader.book.length > 0 &&
    reader.book.length <= 80 &&
    typeof reader.genre === "string" &&
    GENRES.has(reader.genre) &&
    typeof reader.x === "number" &&
    Number.isFinite(reader.x) &&
    reader.x >= 0 &&
    reader.x <= 100 &&
    typeof reader.y === "number" &&
    Number.isFinite(reader.y) &&
    reader.y >= 0 &&
    reader.y <= 100 &&
    (!reader.photo ||
      (typeof reader.photo === "string" && reader.photo.length <= 1_500_000))
  );
}

export async function GET(request: NextRequest) {
  const genre = request.nextUrl.searchParams.get("genre") ?? "";
  if (!GENRES.has(genre)) {
    return json({ error: "Unknown genre." }, 400);
  }

  try {
    return json({ readers: await readersIn(genre) });
  } catch (error) {
    return serviceUnavailable(error);
  }
}

export async function POST(request: NextRequest) {
  let body: {
    action?: string;
    id?: string;
    genre?: string;
    reader?: PresenceReader;
  };

  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid presence update." }, 400);
  }

  if (body.action === "leave" && typeof body.id === "string") {
    try {
      await leave(body.id);
      return json({ ok: true });
    } catch (error) {
      return serviceUnavailable(error);
    }
  }

  if (body.action === "join" && validReader(body.reader)) {
    try {
      await join(body.reader);
      return json({ readers: await readersIn(body.reader.genre) });
    } catch (error) {
      return serviceUnavailable(error);
    }
  }

  if (
    body.action === "heartbeat" &&
    typeof body.id === "string" &&
    typeof body.genre === "string" &&
    GENRES.has(body.genre)
  ) {
    try {
      const found = await heartbeat(body.id, body.genre);
      if (!found) {
        return json({
          missing: true,
          readers: await readersIn(body.genre),
        });
      }
      return json({ readers: await readersIn(body.genre) });
    } catch (error) {
      return serviceUnavailable(error);
    }
  }

  return json({ error: "Invalid presence update." }, 400);
}
