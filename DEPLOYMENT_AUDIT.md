# Deployment Audit — Fitness App
Stand: 2026-05-30

---

## Scripts (package.json)

| Script     | Befehl                                  |
|------------|-----------------------------------------|
| dev        | next dev --port 3001 --webpack          |
| build      | tsc --noEmit && next build --webpack    |
| start      | next start                              |
| dev:api    | tsx server/src/index.ts                 |

**Kritisch:** Kein `start:api` Produktions-Script vorhanden. `tsx` ist ein Dev-Tool und darf nicht in Produktion verwendet werden.

---

## 1. Frontend Env-Variablen (erforderlich)

| Variable                  | Wo verwendet                                      | Pflicht |
|---------------------------|---------------------------------------------------|---------|
| BACKEND_API_URL           | Alle app/api/backend/** Route-Handler (server-seitig) | Ja  |
| NEXT_PUBLIC_BACKEND_URL   | Client-seitige Bild-URLs (checkin-Fotos)          | Ja      |
| DISABLE_PWA               | next.config.ts (PWA deaktivieren)                 | Optional|

Aktuell fehlen beide Variablen in `.env.local`. Fallback ist `http://localhost:4000` — funktioniert lokal, bricht in Produktion.

---

## 2. Backend Env-Variablen (erforderlich)

| Variable     | Wo verwendet                    | Pflicht |
|--------------|---------------------------------|---------|
| DATABASE_URL | server/src/db.ts (PrismaPg)     | Ja      |
| JWT_SECRET   | Auth-Routen (Token-Signierung)  | Ja      |
| PORT         | server/src/index.ts             | Optional (Standard: 4000) |
| NODE_ENV     | Prisma-Log-Level, Proxy IS_DEV  | Ja — muss "production" sein |

Die aktuelle `.env` enthält `DATABASE_URL` mit Klartext-Passwort auf localhost. Darf nicht deployed werden.

---

## 3. Lokale Ports

| Dienst            | Port |
|-------------------|------|
| Frontend (Next.js)| 3001 |
| Backend (Express) | 4000 |

---

## 4. Datenbank

- Provider: **PostgreSQL**
- Treiber: `@prisma/adapter-pg` + `pg`
- Verbindung: `PrismaPg({ connectionString: process.env.DATABASE_URL! })` in `server/src/db.ts`
- Das `prisma/schema.prisma` hat keinen `url`-Eintrag im datasource-Block — Konfiguration läuft komplett über `prisma.config.ts` + dotenv
- Vor dem ersten Start in Produktion muss `npx prisma migrate deploy` ausgeführt werden

---

## 5. Build-Befehl (Frontend)

```
npm run build
→ tsc --noEmit && next build --webpack
```

Verwendet `--webpack` (kein Turbopack). Funktioniert, ist aber langsamer.

---

## 6. Start-Befehle

| Dienst             | Befehl                  | Status        |
|--------------------|-------------------------|---------------|
| Frontend Produktion| npm run start → next start | OK         |
| Backend Produktion | **nicht vorhanden**     | FEHLT — KRITISCH |

### Lösung (eine davon wählen):

**Option A — TypeScript kompilieren (empfohlen):**
```json
"build:api": "tsc --project server/tsconfig.json --outDir server/dist",
"start:api": "node server/dist/index.js"
```

**Option B — tsx in dependencies verschieben (schnell):**
```json
"start:api": "tsx server/src/index.ts"
```

---

## 7. Uploads / Persistenter Speicher

Zwei Verzeichnisse brauchen persistenten Speicher:

| Pfad                         | Inhalt              | Erstellt durch         |
|------------------------------|---------------------|------------------------|
| uploads/checkins/<id>/       | Wöchentliche Fotos  | multer in me.ts:2128   |
| uploads/                     | Statisch via Express| express.static         |

Auf Plattformen ohne persistente Disk (Render Free, Vercel, Railway Hobby) gehen alle hochgeladenen Bilder bei jedem Neustart verloren.

**Anforderung:** Entweder persistente Disk mounten oder Speicher auf S3/R2/Cloudflare-Objekt-Storage migrieren.

---

## 8. CORS — muss für Produktion aktualisiert werden

Aktuelle erlaubte Origins in `server/src/index.ts`:
```ts
origin: [
  "http://localhost:3000",
  "http://localhost:3001",
  "capacitor://localhost",   // Android APK — korrekt
  "http://localhost"
]
```

**Muss hinzugefügt werden:** Die produktive Next.js-Domain (z.B. `https://yourapp.com`).
`capacitor://localhost` ist bereits vorhanden und korrekt für Android.

---

## 9. API-URL-Handling

| Kontext                       | Wie es funktioniert                                        | Status         |
|-------------------------------|-------------------------------------------------------------|----------------|
| Lokales Web                   | Proxy ruft BACKEND_API_URL auf (Standard: localhost:4000)  | Funktioniert   |
| Deployed Web (server-seitig)  | Proxy braucht BACKEND_API_URL auf produktive URL           | Bricht — fehlt |
| Deployed Web (client-seitig)  | NEXT_PUBLIC_BACKEND_URL für Bild-URLs im Browser           | Bricht — fehlt |
| Android APK                   | NEXT_PUBLIC_BACKEND_URL wird zur Build-Zeit eingebacken    | KRITISCH       |

**Android-APK-Problem:** `NEXT_PUBLIC_*`-Variablen werden beim `next build` in das JS-Bundle eingebacken. Wenn der APK-Build ohne `NEXT_PUBLIC_BACKEND_URL` ausgeführt wird, zeigen alle Bild-URLs auf `localhost:4000` des Telefons — dort läuft nichts. Der Build muss mit der öffentlichen Backend-URL durchgeführt werden.

---

## 10. next.config.ts — Image-Domains

Aktuell:
```ts
remotePatterns: [
  { protocol: 'https', hostname: 'omyahzgbzmvovrmeuxlv.supabase.co' }, // Legacy
  { protocol: 'http',  hostname: 'localhost', port: '4000' },          // Lokal
]
```

**Muss hinzugefügt werden:** Produktiver Backend-Hostname, z.B.:
```ts
{ protocol: 'https', hostname: 'api.deinedomain.com' }
```

Ohne diesen Eintrag verweigert Next.js `<Image>` das Laden von Checkin-Fotos aus dem deployed Backend.

---

## 11. Git-Status

Sauber — keine uncommitted Änderungen.

---

## 12. Was muss vor dem Deployment geändert werden

| # | Punkt                                                                   | Blocker? |
|---|-------------------------------------------------------------------------|----------|
| 1 | start:api Produktions-Script hinzufügen                                 | Ja       |
| 2 | BACKEND_API_URL in Frontend-Hosting-Umgebung setzen                     | Ja       |
| 3 | NEXT_PUBLIC_BACKEND_URL in Frontend-Hosting-Umgebung setzen             | Ja       |
| 4 | Produktive Domain zu CORS origin in server/src/index.ts hinzufügen      | Ja       |
| 5 | Produktiven Backend-Hostname zu next.config.ts remotePatterns hinzufügen| Ja       |
| 6 | Persistente Disk für uploads/ auf Backend-Host bereitstellen            | Ja       |
| 7 | npx prisma migrate deploy auf Produktions-DB vor erstem Start           | Ja       |
| 8 | JWT_SECRET rotieren — neues, sicheres Secret für Produktion generieren  | Ja       |
| 9 | APK mit NEXT_PUBLIC_BACKEND_URL=https://... bauen                       | Ja (APK) |

---

## 13. Empfohlene Deployment-Reihenfolge

```
1. PostgreSQL bereitstellen (z.B. Neon, Railway Postgres, Supabase Postgres)
2. DATABASE_URL + JWT_SECRET auf Backend-Host setzen
3. npx prisma migrate deploy ausführen
4. Express-Backend deployen → öffentliche URL notieren
5. Produktive Next.js-Domain zu CORS origin hinzufügen (server/src/index.ts)
6. Produktiven Backend-Hostname zu next.config.ts remotePatterns hinzufügen
7. BACKEND_API_URL + NEXT_PUBLIC_BACKEND_URL auf Frontend-Host setzen → Next.js deployen
8. Web-App Ende-zu-Ende testen
9. APK bauen: NEXT_PUBLIC_BACKEND_URL setzen → npm run build → npx cap sync → Android Studio
```

---

## 14. Risiken

| Risiko                                                                     | Schwere   |
|----------------------------------------------------------------------------|-----------|
| Kein Backend-Produktions-Script vorhanden                                  | Kritisch  |
| uploads/ geht bei ephemeren Deployments verloren                           | Kritisch  |
| NEXT_PUBLIC_BACKEND_URL im APK auf localhost eingebacken                   | Kritisch  |
| .env enthält Klartext-DB-Passwort und JWT_SECRET                           | Hoch      |
| CORS fehlt Produktions-Domain                                              | Hoch      |
| next.config.ts fehlt Produktions-Image-Domain                              | Mittel    |
| @supabase/supabase-js noch in dependencies trotz Migration                 | Niedrig   |
| prisma/schema.prisma hat keinen url-Eintrag im datasource-Block            | Niedrig   |
