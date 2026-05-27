# Render Environment Checklist

Use this as the source of truth when comparing your Render environment variables.

## Backend service: `attaufiqschools-api`

Keep these enabled:

- `NODE_ENV=production`
- `HOST=0.0.0.0`
- `PORT` set by Render
- `USE_DATABASE=true`
- `DATABASE_URL`
- `DB_SSL`
- `JWT_SECRET`
- `REFRESH_SECRET`
- `BOOTSTRAP_ADMIN_EMAIL`
- `BOOTSTRAP_ADMIN_PASSWORD`
- `BOOTSTRAP_ADMIN_FULL_NAME`
- `CORS_ORIGINS`
- `RATE_LIMIT_STORE=redis`
- `RATE_LIMIT_FAIL_OPEN=true`
- `CACHE_STORE=redis`
- `REDIS_URL` from the Render Redis service

Strongly recommended:

- `TRUST_PROXY=true`
- `AUTH_COOKIE_SECURE=true`
- `AUTH_COOKIE_SAME_SITE=Lax` if both services stay on Render subdomains
- `AUTH_COOKIE_SAME_SITE=None` if frontend and backend are on different domains
- `AUTH_COOKIE_DOMAIN` only if you want to force a shared parent domain cookie

Optional but useful:

- `CACHE_DEFAULT_TTL_SECONDS`
- `STARTUP_DB_RETRY_ATTEMPTS`
- `STARTUP_DB_RETRY_BASE_MS`
- `STARTUP_REDIS_RETRY_ATTEMPTS`
- `STARTUP_REDIS_RETRY_BASE_MS`
- `HEALTH_TIMEOUT_MS`
- `MAIL_ENABLED`
- `MAIL_FROM`
- `MAIL_FROM_NAME`
- `MAIL_PROVIDER`
- `RESEND_API_KEY`
- `SENDGRID_API_KEY`

## Frontend service: `attaufiqschools-web`

Required:

- `VITE_API_BASE_URL=https://attaufiqschools-api.onrender.com/api`
- `VITE_PUBLIC_APP_URL` if you use absolute links in the UI

## Most common login blockers

1. Missing `VITE_API_BASE_URL` on the frontend.
2. `CORS_ORIGINS` does not include the frontend URL.
3. Cookie settings do not match the domain setup.
4. `REDIS_URL` is missing or the Redis service is unhealthy.

## Quick sanity check

If your frontend is `https://attaufiqschools-web.onrender.com` and your backend is `https://attaufiqschools-api.onrender.com`, use:

- `CORS_ORIGINS=https://attaufiqschools-web.onrender.com`
- `AUTH_COOKIE_SAME_SITE=Lax`
- `AUTH_COOKIE_SECURE=true`

If you move frontend or backend to a different custom domain, switch `AUTH_COOKIE_SAME_SITE` to `None`.
