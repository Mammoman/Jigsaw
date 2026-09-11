# Technical Design & Implementation Document: Modern Jigsaw Web

## 1. Executive Summary

This document specifies the architecture, mathematical models, state topologies, and deployment strategies for **Modern Jigsaw**, a collaborative, high-performance web puzzle game inspired by Jigsaw Explorer.

The system leverages **Next.js 15+ (App Router)**, an **imperative HTML5 Canvas 2D engine**, **Zustand** for local graph state, and **PartyKit** for edge-based multiplayer WebSocket coordination.

---

## 2. System Architecture

```text
                       +-----------------------------------+
                       |        Next.js App Router         |
                       |       (Vercel Edge Network)       |
                       +-----------------+-----------------+
                                         |
             +---------------------------+---------------------------+
             |                                                       |
             v                                                       v
+------------------------+                              +------------------------+
|    Client Front-End    |                              |   Upload & Metadata    |
| - React 19 Shell       |                              | - Uploadthing / S3 CDN |
| - HTML5 Canvas Engine  |                              | - Supabase Postgres    |
| - Zustand State Store  |                              +------------------------+
+-----------+------------+
            |
            | Bidirectional WebSocket Frames
            v
+------------------------+
|     PartyKit Room      |
| - Ephemeral Memory     |
| - Mutex Lock Engine    |
| - Delta Broadcaster    |
+------------------------+
```

### Core Architectural Layers

1. **Presentation & UI Shell:** React 19 UI overlays (HUD, timer, piece organizer, modal dialogs) rendered over a viewport-sized Canvas.
2. **Rendering Engine:** Dual-buffer HTML5 Canvas handling infinite panning, pinch-to-zoom, dynamic Bézier piece clipping, and rendering z-index ordering.
3. **State & Graph Engine:** Disjoint Set Union (DSU / Union-Find) tracking disconnected pieces and rigidly bound clusters.
4. **Networking Layer:** Low-latency binary/JSON streaming via WebSockets running on PartyKit (Cloudflare Workers runtime).

---

## 3. Mathematical Specifications

### 3.1 Procedural Bézier Edge Generation

A canonical puzzle tab is modeled as a normalized spline over the unit interval `[0, 1] x [0, 1]`. An edge vector is defined by points `P_1` and `P_2`:

`V = P_2 - P_1, L = ||V||, u = V / L`

The normal vector `n`, parameterized by orientation factor `d` in `{-1, 1}` (where `1` is an outward tab and `-1` is an inward blank), is:

`n = [-u_y * d, u_x * d]^T`

Given canonical Bézier control point `(u_k, v_k)`, the world-space coordinate `P(u_k, v_k)` is:

`P(u_k, v_k) = P_1 + (u_k + delta_u) * V + (v_k + delta_v) * L * n`

Where `delta_u, delta_v ~ U(-0.05, 0.05)` are pseudo-random jitter values derived deterministically from the room seed.

### 3.2 Canonical Spline Knots

```text
Normalized Coordinates (u, v):
(0.00, 0.00) -> Flat base start
(0.35, 0.00), (0.38, 0.05), (0.38, 0.10) -> Inward neck curve
(0.38, 0.15), (0.32, 0.25), (0.32, 0.30) -> Flare to tab lobe
(0.32, 0.38), (0.42, 0.44), (0.50, 0.44) -> Lobe apex curve
(0.58, 0.44), (0.68, 0.38), (0.68, 0.30) -> Return flare
(0.68, 0.25), (0.62, 0.15), (0.62, 0.10) -> Return neck curve
(0.62, 0.05), (0.65, 0.00), (1.00, 0.00) -> Flat base exit
```

### 3.3 Graph Topology & Snapping Equation

The grid coordinates of piece `i` are denoted as `(r_i, c_i)` with dimensions `(W_p, H_p)`. For any two pieces `A` and `B`, the expected relative offset vector is:

`Delta_expected = [(c_B - c_A) * W_p, (r_B - r_A) * H_p]^T`

Snapping activates if and only if:

1. Manhattan graph distance is 1: `|r_A - r_B| + |c_A - c_B| = 1`
2. Euclidean error is within tolerance threshold `epsilon_snap`:

`||(P_B - P_A) - Delta_expected||_2 <= epsilon_snap` (default: `epsilon_snap = 22px`)

---

## 4. State Management & Data Schema

### 4.1 Supabase Schema (PostgreSQL)

```sql
create table public.puzzles (
  id uuid primary key default gen_random_uuid(),
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  image_url text not null,
  thumbnail_url text,
  target_pieces integer not null default 96,
  actual_rows integer not null,
  actual_cols integer not null,
  seed bigint not null,
  aspect_ratio real not null,
  is_public boolean default false
);

create table public.game_sessions (
  id uuid primary key default gen_random_uuid(),
  puzzle_id uuid references public.puzzles(id) on delete cascade not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  completed_at timestamp with time zone,
  elapsed_seconds integer default 0
);
```

### 4.2 Zustand Client Store Interface

```typescript
interface PieceRuntimeState {
  id: string;
  row: number;
  col: number;
  x: number;
  y: number;
  groupId: string;
}

interface PuzzleStore {
  // Board Configuration
  puzzleId: string | null;
  seed: number;
  image: HTMLImageElement | null;
  pieces: Record<string, PieceRuntimeState>;
  renderOrder: string[]; // Order of piece IDs for rendering (last = top)
  
  // Transform State (Pan/Zoom)
  camera: { x: number; y: number; scale: number };
  
  // Local Interaction
  activeDragGroupId: string | null;
  dragAnchor: { x: number; y: number } | null;
  
  // Actions
  panCamera: (dx: number, dy: number) => void;
  zoomCamera: (scaleDelta: number, focalPoint: { x: number; y: number }) => void;
  startGroupDrag: (pieceId: string, clientPos: { x: number; y: number }) => void;
  updateGroupDrag: (clientPos: { x: number; y: number }) => void;
  endGroupDrag: () => { snapped: boolean; targetGroupId?: string };
  applyServerMerge: (updates: Record<string, { x: number; y: number; groupId: string }>) => void;
}
```

---

## 5. Network Protocol Specification (PartyKit WebSockets)

### Client-to-Server Messages

| Message Type | Payload Structure | Description |
| --- | --- | --- |
| `LOCK_REQ` | `{ groupId: string }` | Requests exclusive mutex on a cluster before moving. |
| `DRAG_STREAM` | `{ groupId: string, dx: number, dy: number }` | Throttled delta stream (~30ms intervals). |
| `MERGE_NOTIFY` | `{ updates: Record<id, { x, y, groupId }> }` | Dispatched after local snap verification. |
| `RELEASE_REQ` | `{ groupId: string }` | Relinquishes cluster lock without snapping. |
| `POINTER_MOVE` | `{ x: number, y: number }` | Sends cursor position to display partner cursors. |

### Server-to-Client Messages

| Message Type | Payload Structure | Description |
| --- | --- | --- |
| `SYNC_INIT` | `{ pieces: Record<string, PieceRuntimeState> }` | Initial payload containing complete board snapshot. |
| `LOCK_GRANTED` | `{ groupId: string, lockedBy: string }` | Broadcasts that a cluster is currently locked. |
| `LOCK_REJECTED` | `{ groupId: string }` | Rejects drag action if another peer acquired mutex. |
| `PEER_MOVED` | `{ groupId: string, dx: number, dy: number }` | Replicates live drag motions across clients. |
| `BOARD_MUTATED` | `{ updates: Record<id, { x, y, groupId }> }` | Commits snap changes to all peers. |
| `PEER_LEFT` | `{ peerId: string }` | Removes remote cursor and clears hanging locks. |

---

## 6. Rendering Pipeline & Optimization Strategy

```text
[Window Resize / Input]
         |
         v
[Screen-to-World Coordinate Projection]
         |
         v
[Frustum Culling against Viewport Bounding Box]
         |
         v
[Layer 1: Background Desk Surface Grid]
         |
         v
[Layer 2: Stationary Solved Pieces & Clusters]
         |
         v
[Layer 3: Active Dragging Cluster (Elevated Shadow)]
         |
         v
[Layer 4: Remote Player Cursors & Labels]
```

### 6.1 Viewport Transformation Matrix

World coordinates `(X_w, Y_w)` map to Canvas coordinates `(X_c, Y_c)` through scale `S` and translation `(T_x, T_y)`:

`[X_c, Y_c, 1]^T = [S 0 T_x; 0 S T_y; 0 0 1] * [X_w, Y_w, 1]^T`

Mouse picking uses the inverted transformation:

`X_w = (X_c - T_x) / S, Y_w = (Y_c - T_y) / S`

### 6.2 Rendering Optimization Rules

1. **Pre-Compiled Path2D Cache:** Generate all piece paths once during loading. Do NOT call `bezierCurveTo` dynamically in the 60 FPS animation loop.
2. **Frustum Culling:** Skip `ctx.drawImage` calls for pieces where out of bounds.
3. **Offscreen Sprite Caching (Optional for >500 pieces):** Blit each piece once to a tiny offscreen Canvas texture with alpha clipping pre-computed. Rendering then becomes simple `drawImage` operations rather than vector clips.

---

## 7. Directory & File Structure

```text
├── app/
│   ├── layout.tsx
│   ├── page.tsx                       # Landing page & puzzle gallery
│   ├── play/
│   │   └── page.tsx                   # Main Canvas Game Workspace
│   └── api/
│       └── uploadthing/
│           ├── core.ts                # File upload pipeline
│           └── route.ts
├── components/
│   ├── canvas/
│   │   ├── Stage.tsx                  # Canvas event listener wrapper
│   │   ├── ViewportOverlay.tsx        # Ghost image, magnifier UI
│   │   └── RemoteCursors.tsx          # Multi-user overlay
│   ├── hud/
│   │   ├── TopNav.tsx                 # Timer, score, piece counters
│   │   ├── Dock.tsx                   # Edge filters, zoom toggles, settings
│   │   └── VictoryModal.tsx           # Win screen + confetti
│   └── modals/
│       └── CreatePuzzleModal.tsx      # Image upload & configuration
├── hooks/
│   ├── useCanvasTransform.ts          # Pan/Zoom logic
│   ├── usePuzzleAudio.ts              # Web Audio API snap sounds
│   └── usePuzzleMultiplayer.ts        # PartyKit hook
├── lib/
│   ├── supabase/
│   │   ├── client.ts
│   │   └── server.ts
│   └── random.ts                      # Mulberry32 PRNG
├── party/
│   ├── server.ts                      # PartyKit Edge WebSocket server
│   └── types.ts                       # Network payload contracts
├── stores/
│   └── usePuzzleStore.ts              # Zustand core engine
├── types/
│   └── puzzle.ts                      # Mathematical geometry interfaces
└── utils/
    ├── bezierGenerator.ts             # Procedural Bézier matrix
    ├── imageProcessor.ts              # Canvas client compression
    └── snapEngine.ts                  # Spatial neighbor detection
```

---

## 8. Implementation Roadmap

### Phase 1: Local Geometry & Core Loop (Sprint 1)

* [x] Implement deterministic PRNG (`Mulberry32`).
* [x] Complete edge matrix generator ensuring gapless tabs and blanks.
* [x] Build infinite pan/zoom canvas viewport with wheel and pinch support.
* [x] Wire up DSU cluster merge logic in Zustand.

### Phase 2: Game Polish & Assist Tools (Sprint 2)

* [ ] Implement audio click via Web Audio API synthesized white-noise burst.
* [ ] Implement "Border Pieces Only" visual filter.
* [ ] Add semi-transparent "Ghost Image" canvas underlay.
* [ ] Add perimeter auto-scatter algorithm.

### Phase 3: Edge Collaboration (Sprint 3)

* [ ] Spin up PartyKit room server with mutex locks.
* [ ] Connect multi-client cursor broadcast.
* [ ] Implement optimistic local dragging with server authoritative reconciliation.

### Phase 4: Production Deployment (Sprint 4)

* [ ] Configure Uploadthing CDN pipelines with client-side compression limits.
* [ ] Hook up Supabase for puzzle metadata lookup and persistence.
* [ ] Set up edge caching on Vercel for static puzzle configurations.
