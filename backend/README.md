# ATTAUFEEQ Model Academy Backend

## Quick Start

1. Copy `.env.example` to `.env` and set values.
2. Install dependencies:
   `npm install`
3. Run development server:
   `npm run dev`

Server defaults to `http://localhost:4000`.

## Authentication and PostgreSQL

Authentication is PostgreSQL-only. The backend now fails fast if database auth is disabled or misconfigured.

Startup flow:

1. Connect to PostgreSQL using `DATABASE_URL` or `DB_HOST`/`DB_PORT`/`DB_USER`/`DB_PASSWORD`/`DB_NAME`.
2. Verify required auth tables exist.
3. If the `users` table is empty, create the bootstrap admin from `BOOTSTRAP_ADMIN_EMAIL` and `BOOTSTRAP_ADMIN_PASSWORD`.
4. Refuse startup in production if legacy demo accounts are still present.

Required setup:

1. Configure `backend/.env`:
   - `USE_DATABASE=true`
   - `DATABASE_URL` or `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`, `DB_SSL`
   - `JWT_SECRET`, `REFRESH_SECRET`
    - `BOOTSTRAP_ADMIN_EMAIL`, `BOOTSTRAP_ADMIN_PASSWORD`, `BOOTSTRAP_ADMIN_FULL_NAME`
   - `RATE_LIMIT_STORE=redis` with `REDIS_URL` or `REDIS_HOST`/`REDIS_PORT`
2. Install backend deps:
   `npm install`
3. Run migrations:
   `npm run db:migrate`
4. Start the backend:
   `npm run dev`
5. Preflight student-registration rollout when needed:
   `npm run db:preflight:student-registration`

## API Endpoints

- `GET /api/health`
- `POST /api/auth/login`
- `POST /api/auth/refresh`
- `POST /api/auth/logout`
- `GET /api/admissions/options`
- `POST /api/admissions` (`classId` or manual `manualLevel` + `manualInstitution`, optional `documents[]`)
- `GET /api/admissions/:id`
- `GET /api/news` (public, defaults to published)
- `GET /api/news/:slugOrId` (public)
- `GET /api/news/admin/all` (admin only)
- `POST /api/news/admin` (admin only)
- `PUT /api/news/admin/:id` (admin only)
- `DELETE /api/news/admin/:id` (admin only)
- `GET /api/results/teacher/options` (teacher only)
- `POST /api/results/teacher/scores` (teacher only)
- `GET /api/results/teacher/records` (teacher only)
- `GET /api/results/admin/overview` (admin only)
- `POST /api/results/admin/publish` (admin only)
- `GET /api/results/student` (student only)
- `GET /api/results/parent` (parent only)
- `GET /api/results/student/report-card` (student only, optional `term`)
- `GET /api/results/parent/report-card` (parent only, optional `term`)
- `GET /api/results/admin/report-card/:studentId` (admin only, optional `term`)
- `GET /api/fees/admin/plans` (admin only)
- `POST /api/fees/admin/plans` (admin only)
- `GET /api/fees/admin/payments` (admin only)
- `POST /api/fees/admin/payments` (admin only)
- `GET /api/fees/admin/defaulters` (admin only)
- `GET /api/fees/student` (student only)
- `GET /api/fees/parent` (parent only)
- `GET /api/library/admin/books` (admin only)
- `POST /api/library/admin/books` (admin only)
- `PUT /api/library/admin/books/:id` (admin only)
- `DELETE /api/library/admin/books/:id` (admin only)
- `GET /api/library/admin/issues` (admin only)
- `POST /api/library/admin/issue` (admin only)
- `POST /api/library/admin/return/:issueId` (admin only)
- `GET /api/library/student` (student only)
- `GET /api/library/parent` (parent only)
- `GET /api/notifications/me` (all authenticated roles)
- `POST /api/notifications/admin` (admin only)
- `GET /api/messages/threads` (all authenticated roles)
- `POST /api/messages/threads` (all authenticated roles)
- `GET /api/messages/threads/:id` (all authenticated roles)
- `POST /api/messages/threads/:id/messages` (all authenticated roles)
- `GET /api/madrasa/admin/records` (admin only)
- `POST /api/madrasa/admin/records` (admin only)
- `PUT /api/madrasa/admin/records/:id` (admin only)
- `DELETE /api/madrasa/admin/records/:id` (admin only)
- `GET /api/madrasa/student` (student only)
- `GET /api/madrasa/parent` (parent only)
- `GET /api/reports/admin/summary` (admin only)
- `GET /api/reports/admin/performance` (admin only, optional `term`)
- `GET /api/reports/admin/performance.csv` (admin only, optional `term`)
- `GET /api/dashboard/me`
- `GET /api/dashboard/admin` (admin only)
- `GET /api/dashboard/teacher` (teacher only)
- `GET /api/dashboard/student` (student only)
- `GET /api/dashboard/parent` (parent only)
- `GET /api/admin/students` (admin only)
- `POST /api/admin/students` (admin only, accepts `{ student, guardian }` and provisions `users` before `students` in one transaction)
- `POST /api/admin/students/bulk` (admin only)
- `PUT /api/admin/students/:id` (admin only)
- `DELETE /api/admin/students/:id` (admin only)
- `GET /api/admin/teachers` (admin only)
- `POST /api/admin/teachers` (admin only)
- `PUT /api/admin/teachers/:id` (admin only)
- `DELETE /api/admin/teachers/:id` (admin only)
- `GET /api/admin/classes` (admin only)
- `POST /api/admin/classes` (admin only)
- `PUT /api/admin/classes/:id` (admin only)
- `DELETE /api/admin/classes/:id` (admin only)
- `GET /api/admin/subjects` (admin only)
- `POST /api/admin/subjects` (admin only)
- `PUT /api/admin/subjects/:id` (admin only)
- `DELETE /api/admin/subjects/:id` (admin only)
- `GET /api/admin/teacher-assignments` (admin only)
- `POST /api/admin/teacher-assignments` (admin only, supports `teacherId` or `teacherIds[]`, plus optional `assignmentRole`, `note`)
- `PUT /api/admin/teacher-assignments/:id` (admin only)
- `DELETE /api/admin/teacher-assignments/:id` (admin only)
- `GET /api/admin/admissions` (admin only)
- `PUT /api/admin/admissions/:id` (admin only)
- `PUT /api/admin/admissions/:id/verification` (admin only)
- `PUT /api/admin/admissions/:id/interview` (admin only)
- `POST /api/admin/admissions/:id/offer` (admin only)
- `POST /api/admin/admissions/:id/promote` (admin only)
- `POST /api/admin/system/save` (admin only)
- `GET /api/admin/system/backup` (admin only)
- `GET /api/admin/audit-logs` (admin only, query: `actorRole`, `method`, `statusCode`, `search`, `limit`)

## Notes

- Authentication has no JSON fallback. `users`, `refresh_sessions`, and `password_reset_requests` in PostgreSQL are the only auth source of truth.
- Legacy admin/business state persistence is stored in PostgreSQL `app_state`, not on local JSON files.
- Passwords are stored as salted hashes generated by the backend password utility.
- Access token + refresh token session flow is enabled.
- Bootstrap admin creation is idempotent and only runs when the `users` table is empty.
- Student registration is standardized as a single backend flow: create/link portal user first, then insert/update the student record transactionally.
- In PostgreSQL mode, student-registration credential emails are queued into a DB-backed outbox inside the same transaction and delivered after commit by a background worker.
- Check for duplicate `students.user_id` rows with `npm run db:preflight:student-registration` before applying the hardening rollout in staging/production.
- Validate empty-database bootstrap behavior with `npm run db:validate-bootstrap`.
- Clean legacy demo users with `npm run db:cleanup:legacy-users`.
- Replace the final legacy admin safely with `npm run db:replace:legacy-admin` after setting `BOOTSTRAP_ADMIN_EMAIL` and `BOOTSTRAP_ADMIN_PASSWORD`.
- Security hardening enabled: Redis-backed distributed rate limiting, login throttling, strict startup validation, and request audit logs.
