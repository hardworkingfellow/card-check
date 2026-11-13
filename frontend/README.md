# GiftCard Checker

React, TypeScript, and Vite frontend for public card-image submissions
and an administrator-only review dashboard.

## Run locally

1. Configure and start MongoDB and the backend using
   [the backend instructions](../backend/README.md).
2. In a separate terminal, from this folder:

```sh
npm install
npm run dev
```

Vite proxies `/api` requests to `http://127.0.0.1:3001`. Visitors can submit a
card image without signing up or signing in. The administrator signs
in at `/admin/sign-in` with credentials configured in the backend's `.env`.

## Upload privacy

The upload flow accepts images the browser can open and converts them to JPEG.
Visitors may optionally draw black boxes over sensitive areas; otherwise the
uploaded image may contain visible card numbers, PINs, barcodes, or QR codes.
Only the prepared image is sent, never the original selected file. Images are
stored privately in Cloudinary and served to the administrator through the
backend; submission metadata is stored by the backend and images are removed
after 30 days.

This app is not connected to a gift-card issuer. Admin review statuses are not
issuer verification results, and no card balance can be checked.

## Checks

```sh
npm run lint
npm run build
```
