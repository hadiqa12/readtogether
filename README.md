# Common Margins

A responsive shared reading-world experience. Readers introduce themselves and their current book, choose a genre door, and enter a surreal landscape populated by other people reading in that genre.

## Run locally

```bash
npm install
npm run dev
```

Open the local URL shown in the terminal. Presence is stored in memory on the
Next.js app server, so separate browsers using that same process see one
another when they enter the same genre. Clients heartbeat while connected,
send a leave event on exit, and expire automatically after 15 seconds without
a heartbeat. Restarting the server clears the room.

## Project checks

```bash
npm run lint
npm run build
```

Built with Next.js, TypeScript, Tailwind CSS, shadcn/ui, and Lucide icons.
