# Common Margins

A responsive shared reading-world experience. Readers introduce themselves and their current book, choose a genre door, and enter a surreal landscape populated by other people reading in that genre.

## Run locally

```bash
npm install
npm run dev
```

Open the local URL shown in the terminal. Readers in the same genre share a
Supabase Realtime Presence channel. Each browser tracks a name, book,
position, and optional photo, then leaves that channel on exit. Disconnects
drop the reader automatically. The illustrated companions in each world stay
on the page.

## Presence

The app reads these public variables. Next.js inlines `NEXT_PUBLIC_` values
when it builds, so set them in `.env.local` for local development or in the
host environment before building. Keep them out of source control. Readers
never enter keys in the app.

```text
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` is the current public key name in
supabase-js. A project that still uses the legacy anon key can set
`NEXT_PUBLIC_SUPABASE_ANON_KEY` instead. The client uses the publishable key
when both are present.

Realtime public channels need to stay enabled on the project, which is the
Supabase default. Presence does not use a database table. Without these
variables the reading world still opens, and live presence stays disconnected.

## Project checks

```bash
npm run lint
npm run build
```

Built with Next.js, TypeScript, Tailwind CSS, shadcn/ui, and Lucide icons.
