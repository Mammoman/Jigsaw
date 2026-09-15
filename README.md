# Jigsaw

Turn any image into a jigsaw puzzle and solve it live with a friend. Next.js 16 + React 19 on the front, Supabase (Storage, Postgres, Realtime) on the back — there is no custom server.

## Running locally

```bash
npm install
npm run dev
```

Create `.env.local` with your Supabase project's origin and anon key:

```
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key>
```

Use the bare origin — not the `/rest/v1` URL the dashboard shows. (The client strips any path just in case.)

## Supabase setup

- A **public** Storage bucket named `puzzle-images`, with an insert policy for `anon`. Set a file-size limit on the bucket (the client downsizes to 2048px, but the bucket should enforce its own cap).
- The `puzzles` table from `DESIGN_AND_IMPLEMENTATION.md` §4.1, with `select` and `insert` policies for `anon`.
- Realtime enabled (broadcast + presence are used; no Postgres changes).

## How it fits together

| Path | Role |
| --- | --- |
| `src/app/page.tsx` | Upload + piece count → Storage + `puzzles` row → redirect to `/play/<id>` |
| `src/app/play/[puzzleId]/page.tsx` | Loads the puzzle, name prompt, lobby, mounts the game |
| `src/components/canvas/Stage.tsx` | Canvas engine: pieces, drag/pan/zoom, snapping |
| `src/stores/usePuzzleStore.ts` | Zustand state; auto-saves to IndexedDB |
| `src/hooks/usePuzzleMultiplayer.ts` | Supabase Realtime relay (cursors, moves, merges, board sync) |
| `src/utils/boardGenerator.ts` | Deterministic tabs + scatter from the puzzle seed |

Every client generates the same starting board from the seed stored in the `puzzles` row; afterwards moves are relayed peer-to-peer as absolute positions, and anyone joining late asks the room for a snapshot.
