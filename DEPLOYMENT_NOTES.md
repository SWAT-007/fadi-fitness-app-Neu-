# Deployment Notes

## Architecture

| Layer    | Technology          | Port (local) |
|----------|---------------------|--------------|
| Frontend | Next.js 16          | 3001         |
| Backend  | Express + TypeScript| 4000         |
| Database | PostgreSQL + Prisma | –            |

---

## Scripts

| Purpose             | Command            |
|---------------------|--------------------|
| Start frontend prod | `npm run start`    |
| Start backend prod  | `npm run start:api`|
| Build frontend      | `npm run build`    |
| Dev frontend        | `npm run dev`      |
| Dev backend         | `npm run dev:api`  |

---

## Required Env Variables

See `.env.example` for the full list with descriptions.

**Backend host must have:**
- `DATABASE_URL`
- `JWT_SECRET`
- `NODE_ENV=production`
- `FRONTEND_ORIGIN` (production Next.js URL for CORS)

**Frontend host must have:**
- `BACKEND_API_URL` (internal/private URL of the backend, server-side)
- `NEXT_PUBLIC_BACKEND_URL` (public URL of the backend, baked into browser bundle)

---

## Database

Run migrations before starting the backend for the first time:

```
npx prisma migrate deploy
```

---

## Persistent Disk — REQUIRED

The Express backend writes uploaded files to disk:

| Path                     | Content                  |
|--------------------------|--------------------------|
| `uploads/checkins/<id>/` | Weekly check-in photos   |

These files are served statically at `/uploads` by Express.

**If the deployment platform uses ephemeral disk (Render free tier, Railway Hobby,
any container without a volume), all uploaded images will be lost on every restart.**

### Options:
1. **Persistent volume** — mount a persistent disk at the backend's working directory.
   Tested platforms: Railway (volume), Render (disk add-on), VPS.
2. **Object storage (future)** — migrate file uploads to S3, Cloudflare R2, or
   similar. Store the public URL instead of `storagePath` in the database.
   This is the recommended long-term approach.

---

## CORS

Local origins are always allowed:
- `http://localhost:3000`
- `http://localhost:3001`
- `http://localhost`
- `capacitor://localhost`

For production set on the **backend host**:
```
FRONTEND_ORIGIN=https://yourapp.com
# optional extra origins:
ADDITIONAL_CORS_ORIGINS=https://staging.yourapp.com,https://admin.yourapp.com
```

---

## Next.js Image Domains

`next.config.ts` auto-reads `NEXT_PUBLIC_BACKEND_URL` at build time and adds it
to `remotePatterns`. No manual config needed — just set the env var before building.

---

## Android APK — IMPORTANT

`NEXT_PUBLIC_BACKEND_URL` is **baked into the JS bundle at build time**.

You must set it to the production backend URL before running `npm run build`
and then `npx cap sync`:

```bash
# Example (set in your CI or shell before building)
NEXT_PUBLIC_BACKEND_URL=https://api.yourapp.com npm run build
npx cap sync
# Then open in Android Studio and build the APK
```

If you build without this set, the APK will try to load images from
`http://localhost:4000` — which does not exist on the device.

---

## Deployment Order

```
1. Provision PostgreSQL
2. Set DATABASE_URL + JWT_SECRET on backend host
3. npx prisma migrate deploy
4. Deploy Express backend → note its public URL
5. Set FRONTEND_ORIGIN on backend host → redeploy backend
6. Set BACKEND_API_URL + NEXT_PUBLIC_BACKEND_URL on frontend host
7. npm run build → deploy Next.js frontend
8. Verify web app end-to-end
9. Build APK with NEXT_PUBLIC_BACKEND_URL set → npx cap sync → Android Studio
```
