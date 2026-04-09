# ATTAUFEEQ Model Academy (Frontend + Backend)

## Quick Start

1. Install dependencies:
```bash
npm install
cd backend && npm install && cd ..
```

2. Start full stack (frontend + backend):
```bash
npm run dev
```

This command now starts backend first, waits for health check, then starts Vite.

## Useful Scripts

- `npm run dev` -> start backend + frontend together
- `npm run dev:web` -> start frontend only
- `npm run dev:backend` -> start backend only
- `npm run build` -> build frontend

## Fixing `ECONNREFUSED 127.0.0.1:4000`

If Vite shows proxy errors for `/api/*`, backend is not reachable.

1. Use `npm run dev` from project root (recommended).
2. If backend port is busy, free it:
```bash
fuser -k 4000/tcp
```
3. Restart:
```bash
npm run dev
```

Optional: override proxy target when needed:
```bash
VITE_BACKEND_PROXY_TARGET=http://127.0.0.1:4000 npm run dev:web
```
