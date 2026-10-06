import { NextRequest, NextResponse } from "next/server";

const GENRES = new Set([
  "fantasy",
  "mystery",
  "romance",
  "scifi",
  "classics",
  "poetry",
]);
const STALE_AFTER = 15_000;

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

const presence =
  globalThis.commonMarginsPresence ??
  (globalThis.commonMarginsPresence = new Map<string, PresenceReader>());

function prune() {
  const cutoff = Date.now() - STALE_AFTER;
  for (const [id, reader] of presence) {
    if (reader.lastSeen < cutoff) presence.delete(id);
  }
}

function readersIn(genre: string) {
  prune();
  return [...presence.values()].filter((reader) => reader.genre === genre);
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
    typeof reader.y === "number" &&
    (!reader.photo ||
      (typeof reader.photo === "string" && reader.photo.length <= 1_500_000))
  );
}

export async function GET(request: NextRequest) {
  const genre = request.nextUrl.searchParams.get("genre") ?? "";
  if (!GENRES.has(genre)) {
    return NextResponse.json({ error: "Unknown genre." }, { status: 400 });
  }
  return NextResponse.json({ readers: readersIn(genre) });
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
    return NextResponse.json({ error: "Invalid presence update." }, { status: 400 });
  }

  if (body.action === "leave" && typeof body.id === "string") {
    presence.delete(body.id);
    return NextResponse.json({ ok: true });
  }

  if (body.action === "join" && validReader(body.reader)) {
    const reader = { ...body.reader, lastSeen: Date.now() };
    presence.set(reader.id, reader);
    return NextResponse.json({ readers: readersIn(reader.genre) });
  }

  if (
    body.action === "heartbeat" &&
    typeof body.id === "string" &&
    typeof body.genre === "string" &&
    GENRES.has(body.genre)
  ) {
    const existing = presence.get(body.id);
    if (!existing || existing.genre !== body.genre) {
      return NextResponse.json({
        missing: true,
        readers: readersIn(body.genre),
      });
    }
    presence.set(body.id, { ...existing, lastSeen: Date.now() });
    return NextResponse.json({ readers: readersIn(body.genre) });
  }

  return NextResponse.json({ error: "Invalid presence update." }, { status: 400 });
}
