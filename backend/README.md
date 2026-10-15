# CEP Tumba Backend (NestJS)

Backend API for the CEP Tumba College Association Management System.

## Authentication flow

- Access token: JWT returned in `login` and `refresh` responses.
- Refresh token: JWT stored in HTTP-only cookie.
- Logout: invalidates stored refresh token and clears cookie.
- User source: users are created by admins.

## Environment setup

1. Copy `.env.example` to `.env`.
2. Fill database and JWT secrets.
3. Ensure PostgreSQL contains schema from `docs/database/schema.postgres.sql`.

### Optional notification settings

- Email delivery (SMTP)
  - `SMTP_HOST`
  - `SMTP_PORT` (default `587`)
  - `SMTP_SECURE` (`true|false`, default `false`)
  - `SMTP_USER`
  - `SMTP_PASS`
  - `SMTP_FROM`

- Web push delivery (VAPID)
  - `WEB_PUSH_PUBLIC_KEY`
  - `WEB_PUSH_PRIVATE_KEY`
  - `WEB_PUSH_SUBJECT` (for example `mailto:no-reply@your-domain.com`)

### Mobile money savings (iTec)

Set these when enabling MTN MoMo / Airtel Money savings payments:

- `ITEC_BASE_URL_V1` (default `https://pay.itecpay.rw/api`)
- `ITEC_MOMO_API_KEY`
- `ITEC_AIRTEL_API_KEY`
- `ITEC_CALLBACK_SECRET` (optional but recommended)
- `RECONCILE_INITIAL_DELAY_MS` (default `20000`)
- `RECONCILE_INTERVAL_MS` (default `15000`)
- `RECONCILE_MAX_ATTEMPTS` (default `16`)

Configure iTec callback URL to:

- `POST /finance/mobile-money/callback`

If `ITEC_CALLBACK_SECRET` is set, iTec must include the same value in header or query string:

- `x-itec-callback-secret`
- `?secret=<ITEC_CALLBACK_SECRET>`

## Install & run

```bash
npm install
npm run start:dev
```

Default API URL: `http://localhost:3000`

## Auth endpoints

- `POST /auth/admin/bootstrap`
  - Creates the first admin (role `president`), only when there are no users.
  - Requires header `x-admin-setup-key: <ADMIN_SETUP_KEY>`.

- `POST /auth/admin/users`
  - Protected (requires access token).
  - Creates users by admin role.

- `POST /auth/login`
  - Body: `{ "email": "...", "password": "..." }`
  - Response: `{ accessToken, tokenType, expiresIn, user }`
  - Sets refresh cookie.

- `GET /auth/me`
  - Protected (bearer access token).
  - Response: `{ user }`

- `POST /auth/refresh`
  - Uses refresh cookie (or body `refreshToken` fallback).
  - Rotates refresh token and returns new access token.

- `POST /auth/logout`
  - Clears refresh cookie.
  - Invalidates refresh token in DB.

## Member creation behavior

- `POST /members`
  - Protected (requires bearer access token).
  - Allowed roles: `president`, `secretary`, `vp_social`.
  - If the creator is `president`, the backend automatically creates a linked user account for the new member with:
    - role: `member`
    - a generated 10-character temporary password
  - The temporary credentials are emailed to the member when SMTP is configured.
  - This happens in one database transaction (member + user), so both succeed or both fail.

- `GET /health`
  - Basic backend health check.

## Announcements endpoints

- `GET /announcements`
  - Protected (requires bearer access token).
  - Available to all authenticated roles.
  - Optional query params:
    - `category` (`urgent|spiritual|finance|social|academic|general`)
    - `status` (`draft|scheduled|published|archived`)
    - `includeUnpublished` (`true|false`) for publishers
    - `limit` (1-100)
  - Response: `{ items, total }`

- `POST /announcements`
  - Protected (requires bearer access token).
  - Allowed roles: all leaders (`president`, `vp_prayers`, `vp_social`, `advisor_prayers`, `advisor_social`, `accountant`, `secretary`).
  - Normal `member` role cannot create announcements.
  - Body: `{ title, body, category?, status?, scheduledFor?, expiresAt?, audienceType?, audienceRoles?, pinned? }`
  - `audienceType`: `all | leaders_only | role_based`
  - `audienceRoles` is required when `audienceType=role_based`.
  - Lifecycle statuses: `draft`, `scheduled`, `published`, `archived`
  - For non-president leaders, announcement is submitted as `draft` for president approval.
  - Only president can create `published` or `scheduled` announcements.
  - `scheduledFor` and `expiresAt` are required when `status = scheduled`, and `expiresAt` must be after `scheduledFor`.
  - `pinned: true` is restricted to `president` and `secretary`.
  - Response: `{ announcement }`

- `PATCH /announcements/:announcementId/status`
  - Protected (requires bearer access token).
  - Allowed roles: all leaders.
  - Only president can set status to `published` or `scheduled` (approval/publish action).
  - Body: `{ status, scheduledFor? }`
  - Response: `{ announcement }`

- `PATCH /announcements/:announcementId/pin`
- `PATCH /announcements/:announcementId/unpin`
  - Protected (requires bearer access token).
  - Allowed roles: `president`, `secretary`.
  - Response: `{ announcement }`

## Notification endpoints

- `POST /notifications/push-subscriptions`
  - Protected (requires bearer access token).
  - Registers/updates current user's web push subscription.
  - Body:
    - `endpoint`
    - `keys.p256dh`
    - `keys.auth`

- `DELETE /notifications/push-subscriptions`
  - Protected (requires bearer access token).
  - Removes current user's web push subscription.
  - Body:
    - `endpoint`

## Notification behavior

- When a published announcement is created, updated to `published`, or auto-published from `scheduled`, targeted users receive:
  - Email (if SMTP is configured)
  - Web push (if VAPID is configured and user has a registered subscription)

- When a non-president leader submits an announcement draft, presidents receive approval-needed notifications via email and push.

## Scripts

```bash
npm run build
npm run lint
npm run test
```
