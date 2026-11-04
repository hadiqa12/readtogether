import type { RealtimeChannel } from "@supabase/supabase-js";
import { createBrowserSupabase } from "@/lib/supabase";

const GENRES = new Set([
  "fantasy",
  "mystery",
  "romance",
  "scifi",
  "classics",
  "poetry",
]);

const PHOTO_TRACK_LIMIT = 200_000;

export type TrackedReader = {
  id: string;
  name: string;
  book: string;
  genre: string;
  x: number;
  y: number;
  photo?: string;
};

export function presencePayload(reader: TrackedReader): TrackedReader {
  const payload: TrackedReader = {
    id: reader.id,
    name: reader.name,
    book: reader.book,
    genre: reader.genre,
    x: reader.x,
    y: reader.y,
  };
  if (reader.photo && reader.photo.length <= PHOTO_TRACK_LIMIT) {
    payload.photo = reader.photo;
  }
  return payload;
}

export function isTrackedReader(value: unknown): value is TrackedReader {
  if (!value || typeof value !== "object") return false;
  const reader = value as Partial<TrackedReader>;
  return (
    typeof reader.id === "string" &&
    reader.id.length > 0 &&
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
    (reader.photo === undefined ||
      (typeof reader.photo === "string" && reader.photo.length <= 1_500_000))
  );
}

export function readersFromPresence(
  state: Record<string, TrackedReader[]>,
  me: Pick<TrackedReader, "id" | "genre">,
) {
  const readers: TrackedReader[] = [];
  for (const entries of Object.values(state)) {
    for (const entry of entries) {
      if (!isTrackedReader(entry) || entry.id === me.id || entry.genre !== me.genre) {
        continue;
      }
      readers.push(entry);
    }
  }
  return readers;
}

async function trackReader(channel: RealtimeChannel, reader: TrackedReader) {
  const payload = presencePayload(reader);
  let status = await channel.track(payload);
  if (status !== "ok" && payload.photo) {
    status = await channel.track({
      id: payload.id,
      name: payload.name,
      book: payload.book,
      genre: payload.genre,
      x: payload.x,
      y: payload.y,
    });
  }
  return status === "ok";
}

export function connectGenrePresence(
  me: TrackedReader,
  onReaders: (readers: TrackedReader[]) => void,
  onStatus: (status: "live" | "error") => void,
) {
  const supabase = createBrowserSupabase();
  if (!supabase) {
    onStatus("error");
    return () => {};
  }

  let active = true;
  let generation = 0;
  let channel: RealtimeChannel | null = null;
  let retry: number | undefined;

  const connect = () => {
    if (!active) return;
    const current = ++generation;
    if (channel) void supabase.removeChannel(channel);

    const next = supabase.channel(`reading-world:${me.genre}`, {
      config: { presence: { key: me.id, enabled: true } },
    });
    channel = next;

    next.on("presence", { event: "sync" }, () => {
      if (!active || current !== generation) return;
      onReaders(readersFromPresence(next.presenceState<TrackedReader>(), me));
      onStatus("live");
    });

    next.subscribe((status) => {
      if (!active || current !== generation) return;
      if (status === "SUBSCRIBED") {
        void trackReader(next, me).then((ok) => {
          if (!active || current !== generation) return;
          onStatus(ok ? "live" : "error");
        });
        return;
      }
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
        onStatus("error");
        window.clearTimeout(retry);
        retry = window.setTimeout(connect, 2_500);
      }
    });
  };

  connect();

  return () => {
    active = false;
    generation += 1;
    window.clearTimeout(retry);
    if (!channel) return;
    const leaving = channel;
    channel = null;
    void leaving.untrack().finally(() => {
      void supabase.removeChannel(leaving);
    });
  };
}
