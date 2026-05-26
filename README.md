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

## QR Code Result Links

Set `VITE_PUBLIC_APP_URL` in the frontend environment to your public site URL, for example:

```bash
VITE_PUBLIC_APP_URL=https://your-frontend-domain.com
```

This is important for printed or shared QR codes. Without it, locally generated QR codes may point to `localhost`, which phones cannot open.

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
