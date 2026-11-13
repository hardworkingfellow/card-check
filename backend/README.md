# GiftCard Checker backend

The backend accepts public, anonymous card-image submissions and
provides an administrator-only review API. It uses MongoDB and is not connected
to a gift-card issuer; it cannot verify card validity, redeem cards, or return
balances.

## Requirements

- Node.js 20 or newer
- MongoDB (local or hosted)

## Configure and run

Copy `.env.example` to `.env`, set a real MongoDB connection string and the
Cloudinary cloud name, API key, and API secret from your Cloudinary dashboard.
Also set `ADMIN_EMAIL` and a unique `ADMIN_PASSWORD` of at least 12 characters.
Keep `.env` private; it is git-ignored.

```sh
npm install
npm run dev
```

The API listens on `127.0.0.1:3001`. The server creates or updates the single
administrator account from `ADMIN_EMAIL` and `ADMIN_PASSWORD` at startup.
Only that configured email can sign in. Change the environment password and
restart the API to rotate the password.

In another terminal, run the frontend with `npm run dev` from `frontend`. Vite
proxies `/api` requests to the backend.

## Submissions and image handling

- Visitors can submit without an account. There are no public registration,
  user sign-in, or user account APIs or pages.
- Administrator sessions use random opaque tokens in `HttpOnly`,
  `SameSite=Strict` cookies; only token hashes are stored in MongoDB.
  Production cookies use `Secure`.
- Administrator login and public image uploads are rate limited. Mutating API
  requests require the frontend's `X-App-Request: 1` header.
- The browser image tool converts browser-supported images to JPEG and sends
  only that prepared image, never the original selected file. Visitors may
  optionally cover sensitive areas before uploading; uncovered details may
  remain visible to the administrator. The backend accepts a JPEG and a card
  category. Images are limited to 5 MB and 20 megapixels.
- The backend validates image type and size, then stores new images in
  Cloudinary as `authenticated` assets. Their delivery URLs are signed by the
  server and images are served only through the administrator-authenticated
  API; Cloudinary credentials and delivery URLs are never sent to visitors.
  MongoDB stores the Cloudinary asset ID, category, status, and timestamps.
- Cloudinary uploads are removed if MongoDB cannot save the submission. Admin
  deletion and retention cleanup also delete the Cloudinary asset. Existing
  local images remain readable and are cleaned up when their records expire.
- Only the configured administrator can list submissions, view images, update
  review status, or delete submissions.
- Images and metadata expire after 30 days; cleanup runs at startup and hourly.
  Admins can also delete a submission and its image immediately.

The black cover boxes are optional and created by the browser. The server cannot
determine whether sensitive details have been covered. Submitted images may
contain visible gift-card numbers, PINs, barcodes, or QR codes; only upload images
you are allowed to share.

## Endpoints

- `GET /api/health` and `GET /api/cards/brands`
- `POST /api/admin/auth/login`, `GET /api/admin/auth/me`,
  `POST /api/admin/auth/logout`
- `POST /api/submissions` — anonymous card-image submission
- `GET /api/admin/submissions`, `GET /api/admin/submissions/:id/image`,
  `PATCH /api/admin/submissions/:id/status`, and
  `DELETE /api/admin/submissions/:id` — administrator-only review
- `POST /api/cards/verify` — safe placeholder response; no issuer is connected

Before public production launch, configure HTTPS, a managed MongoDB deployment
with network restrictions and backups, private durable image storage,
operational monitoring, and a reviewed privacy notice. Configure Cloudinary
usage limits and retention policies to match your needs. This backend is not
itself a live deployment.

## Tests

```sh
npm test
```
