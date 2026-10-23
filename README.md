# Common Margins

A responsive shared reading-world experience. Readers introduce themselves and their current book, choose a genre door, and enter a surreal landscape populated by other people reading in that genre.

## Run locally

```bash
npm install
npm run dev
```

Open the local URL shown in the terminal. Presence is synchronized through the
Next.js app server, so separate browsers and devices using the same server see
one another when they enter the same genre. Clients heartbeat while connected,
send a leave event on exit, and expire automatically after a short disconnect.

Without Redis environment variables, local development uses an in-memory
fallback. That fallback is intentionally not suitable for production.

## Project checks

```bash
npm run lint
npm run build
```

## Production presence on Vercel

Connect a free Upstash Redis database and set one complete REST credential pair
in Vercel for Production, Preview, and Development:

```text
UPSTASH_REDIS_REST_URL
UPSTASH_REDIS_REST_TOKEN
```

Vercel Marketplace Redis integrations that expose the legacy KV names are also
supported:

```text
KV_REST_API_URL
KV_REST_API_TOKEN
```

Do not prefix these variables with `NEXT_PUBLIC_`; they are server-only
credentials. If any Redis variable is present without its matching pair, the
presence API returns `503` instead of silently using process-local state.

Readers are stored with a 15-second TTL and indexed by genre in Redis, allowing
separate Vercel function instances to share live presence. Names, books,
positions, and optional photos retain the same validation used by the local
preview.

Built with Next.js, TypeScript, Tailwind CSS, shadcn/ui, Lucide icons, and
Upstash Redis.
