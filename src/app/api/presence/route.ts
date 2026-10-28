import { NextRequest, NextResponse } from "next/server";

const GENRES = new Set([
  "fantasy",
  "mystery",
  "romance",
  "scifi",
  "classics",
  "poetry",
]);
const PRESENCE_TTL_MS = 15_000;

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

function getMemoryStore() {
  return (
    globalThis.commonMarginsPresence ??
    (globalThis.commonMarginsPresence = new Map<string, PresenceReader>())
  );
}

function pruneMemory(store: PresenceStore) {
  const cutoff = Date.now() - PRESENCE_TTL_MS;
  for (const [id, reader] of store) {
    if (reader.lastSeen < cutoff) store.delete(id);
  }
}

function readersIn(genre: string) {
  const store = getMemoryStore();
  pruneMemory(store);
  return [...store.values()].filter((reader) => reader.genre === genre);
}

function join(reader: PresenceReader) {
  const next = { ...reader, lastSeen: Date.now() };
  getMemoryStore().set(next.id, next);
}

function heartbeat(id: string, genre: string) {
  const store = getMemoryStore();
  pruneMemory(store);
  const existing = store.get(id);
  if (!existing || existing.genre !== genre) return false;
  store.set(id, { ...existing, lastSeen: Date.now() });
  return true;
}

function leave(id: string) {
  getMemoryStore().delete(id);
}

function json(data: unknown, status = 200) {
  return NextResponse.json(data, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
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

  return json({ readers: readersIn(genre) });
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
    leave(body.id);
    return json({ ok: true });
  }

  if (body.action === "join" && validReader(body.reader)) {
    join(body.reader);
    return json({ readers: readersIn(body.reader.genre) });
  }

  if (
    body.action === "heartbeat" &&
    typeof body.id === "string" &&
    typeof body.genre === "string" &&
    GENRES.has(body.genre)
  ) {
    const found = heartbeat(body.id, body.genre);
    if (!found) {
      return json({
        missing: true,
        readers: readersIn(body.genre),
      });
    }
    return json({ readers: readersIn(body.genre) });
  }

  return json({ error: "Invalid presence update." }, 400);
}
