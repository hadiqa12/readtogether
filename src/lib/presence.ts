import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";
import { createBrowserSupabase } from "@/lib/supabase";

const GENRES = new Set([
  "fantasy",
  "mystery",
  "romance",
  "scifi",
  "classics",
  "poetry",
  "international",
]);

export type TrackedReader = {
  id: string;
  name: string;
  book: string;
  genre: string;
  x: number;
  y: number;
  photo?: string;
};

const channelQueues = new Map<string, Promise<unknown>>();

function enqueue<T>(topic: string, task: () => Promise<T>) {
  const previous = channelQueues.get(topic) ?? Promise.resolve();
  const run = previous.then(task, task);
  channelQueues.set(
    topic,
    run.then(
      () => undefined,
      () => undefined,
    ),
  );
  return run;
}

export function presencePayload(reader: TrackedReader): TrackedReader {
  return {
    id: reader.id,
    name: reader.name,
    book: reader.book,
    genre: reader.genre,
    x: reader.x,
    y: reader.y,
  };
}

function coordinate(value: unknown, fallback: number) {
  const number = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  return Number.isFinite(number) ? Math.min(100, Math.max(0, number)) : fallback;
}

export function readerFromPresence(value: unknown): TrackedReader | null {
  if (!value || typeof value !== "object") return null;
  const reader = value as Partial<TrackedReader>;
  if (typeof reader.id !== "string" || reader.id.length === 0 || reader.id.length > 80) return null;
  if (typeof reader.name !== "string" || reader.name.length === 0 || reader.name.length > 40) return null;
  if (typeof reader.book !== "string" || reader.book.length === 0 || reader.book.length > 80) return null;
  if (typeof reader.genre !== "string" || !GENRES.has(reader.genre)) return null;
  return {
    id: reader.id,
    name: reader.name,
    book: reader.book,
    genre: reader.genre,
    x: coordinate(reader.x, 50),
    y: coordinate(reader.y, 58),
  };
}

export function readersFromPresence(
  state: Record<string, unknown[]>,
  me: Pick<TrackedReader, "id" | "genre">,
) {
  const readers: TrackedReader[] = [];
  const seen = new Set<string>();
  for (const entries of Object.values(state)) {
    for (const entry of entries) {
      const reader = readerFromPresence(entry);
      if (!reader || reader.id === me.id || reader.genre !== me.genre || seen.has(reader.id)) continue;
      seen.add(reader.id);
      readers.push(reader);
    }
  }
  return readers;
}

async function trackReader(channel: RealtimeChannel, reader: TrackedReader) {
  const status = await channel.track(presencePayload(reader));
  return status === "ok";
}

function channelsFor(supabase: SupabaseClient, topic: string) {
  return supabase.getChannels().filter((existing) => existing.topic === `realtime:${topic}`);
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

  const topic = `reading-world:${me.genre}`;
  let active = true;
  let generation = 0;
  let channel: RealtimeChannel | null = null;
  let retry: number | undefined;
  let heartbeat: number | undefined;

  const clearTimers = () => {
    window.clearTimeout(retry);
    window.clearInterval(heartbeat);
    retry = undefined;
    heartbeat = undefined;
  };

  const publish = (current: RealtimeChannel, generationId: number) => {
    if (!active || generationId !== generation) return;
    onReaders(readersFromPresence(current.presenceState(), me));
    onStatus("live");
  };

  const connect = () => {
    if (!active) return;
    const generationId = ++generation;
    clearTimers();

    void enqueue(topic, async () => {
      if (!active || generationId !== generation) return;
      for (const existing of channelsFor(supabase, topic)) {
        await supabase.removeChannel(existing);
      }
      if (!active || generationId !== generation) return;

      const next = supabase.channel(topic, {
        config: { presence: { key: me.id, enabled: true } },
      });
      channel = next;

      const receive = () => publish(next, generationId);
      next.on("presence", { event: "sync" }, receive);
      next.on("presence", { event: "join" }, receive);
      next.on("presence", { event: "leave" }, receive);

      next.subscribe((status) => {
        if (!active || generationId !== generation) return;
        if (status === "SUBSCRIBED") {
          void trackReader(next, me).then((ok) => {
            if (!active || generationId !== generation) return;
            if (!ok) {
              onStatus("error");
              window.clearTimeout(retry);
              retry = window.setTimeout(connect, 2_500);
              return;
            }
            publish(next, generationId);
            window.clearInterval(heartbeat);
            heartbeat = window.setInterval(() => {
              if (!active || generationId !== generation) return;
              void trackReader(next, me).then((stillOk) => {
                if (!active || generationId !== generation || !stillOk) return;
                publish(next, generationId);
              });
            }, 5_000);
          });
          return;
        }
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          onStatus("error");
          window.clearTimeout(retry);
          retry = window.setTimeout(connect, 2_500);
        }
      });
    });
  };

  connect();

  return () => {
    active = false;
    generation += 1;
    clearTimers();
    const leaving = channel;
    channel = null;
    if (!leaving) return;
    void enqueue(topic, async () => {
      await leaving.untrack();
      await supabase.removeChannel(leaving);
    });
  };
}
