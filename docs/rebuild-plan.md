# Rebuild Plan (ohne Supabase-Migration)

## Leitplanken
- Dieses Dokument analysiert die bestehende Fitness-App nur als Referenz.
- Es ist **keine** Migration der bestehenden Supabase-Daten geplant.
- Die neue App soll mit **eigenem Backend** und **eigener PostgreSQL-Datenbank** neu aufgebaut werden.
- Es ist **keine Verbindung** zur alten Supabase-Instanz vorgesehen.

## 1) Aktuelle Hauptfunktionen der App
- Login und Sitzungsfluss mit Rollen-Weiterleitung (`trainer`/`client`).
- Trainer-Dashboard mit Kennzahlen (z. B. Clients, Pläne, Aktivität).
- Client-Dashboard mit Trainingsübersicht und Fortschrittsstatistiken.
- Client-Verwaltung für Trainer:
  - Clients anzeigen, anlegen, Detailseite mit Notizen und Verlauf.
  - Planzuweisungen aktivieren/deaktivieren.
- Trainingsplanung:
  - Workout-Pläne erstellen/bearbeiten/löschen.
  - Trainingstage und Übungen mit Reihenfolge und Parametern pflegen.
  - Übungsbibliothek inkl. Bild-URLs verwalten.
- Trainingsausführung (Client):
  - Workout-Day öffnen, Übungsfortschritt loggen.
  - Workout-Logs und Exercise-Logs speichern/abschließen.
  - Änderungsanfragen für Übungen stellen.
- Ernährung:
  - Nutrition-Pläne (cut/bulk/maintain) verwalten.
  - Meals und Ziel-Makros pflegen.
  - Foods-Datenbank und Vorschläge/Swaps nutzen.
  - Meal-/Drink-Logs und Meal-History erfassen.
- Fortschritt & Check-ins:
  - Progress-Logs (z. B. Gewicht).
  - Weekly Check-ins mit Metriken (Energie, Schlaf etc.).
  - Check-in-Bilder hochladen und anzeigen.
- Kommunikation:
  - Nachrichten zwischen Trainer und Client.
  - Benachrichtigungen inkl. Read-Status.

## 2) Existierende Nutzerrollen
- `trainer`
- `client`

Hinweis: Ein separater Admin-Zugang existiert zusätzlich über E-Mail-Whitelist/Cookie-Flow im aktuellen Projekt, ist aber eher ein Sonderfall neben den Kernrollen.

## 3) Existierende Seiten/Routen
### UI-Routen (App Router)
- `/`
- `/login`
- `/admin`
- `/admin/clients`
- `/admin/clients/new`
- `/admin/clients/[id]`
- `/admin/exercises`
- `/admin/messages`
- `/admin/nutrition`
- `/admin/nutrition/foods`
- `/admin/nutrition/new`
- `/admin/nutrition/[id]`
- `/admin/plans`
- `/admin/plans/new`
- `/admin/plans/[id]`
- `/admin/recipes`
- `/admin/requests`
- `/admin/seed`
- `/client`
- `/client/meals`
- `/client/messages`
- `/client/nutrition`
- `/client/plan`
- `/client/plan/[dayId]`
- `/client/progress`
- `/client/workout/[id]/play`

### Aktuelle Next-API-Routen (Bestandsprojekt)
- `/api/auth/session`
- `/api/notifications/client-message`
- `/api/admin/create-client`
- `/api/admin/parse-pdfs`
- `/api/admin/seed`
- `/api/seed`

## 4) Benötigte Datenmodelle für die neue App
- Auth & Identität:
  - `users` (Login-Account)
  - `user_profiles` (Rolle, Name, optionale Metadaten)
  - optional: `sessions` / `refresh_tokens`
- Coaching-Kern:
  - `clients` (Trainer-Client-Beziehung, Stammdaten, Notizen)
  - `workout_plans`
  - `workout_days`
  - `exercises`
  - `assigned_plans`
  - `workout_logs`
  - `exercise_logs`
  - `exercise_change_requests`
- Ernährung:
  - `nutrition_plans`
  - `nutrition_meals`
  - `foods`
  - `food_swap_options`
  - `client_food_swaps` (oder in `client_meal_foods` integrieren)
  - `client_meal_foods`
  - `meal_logs`
  - `meal_history`
  - `drink_logs`
  - `recipes`
- Fortschritt:
  - `progress_logs`
  - `weekly_checkins`
  - `checkin_images`
- Kommunikation:
  - `messages`
  - `notifications`

## 5) Supabase-Abhängigkeiten, die ersetzt werden müssen
- Auth:
  - `supabase.auth.signInWithPassword`, `getUser`, `getSession`, `signOut`
  - Token-/Cookie-Handling über eigene JWT-Strategie ersetzen.
- Datenzugriff:
  - Alle `supabase.from(...).select/insert/update/delete` durch Backend-API ersetzen.
- Realtime:
  - `supabase.channel(...).on(...).subscribe()` für Nachrichten/Notifications ersetzen (z. B. WebSocket/SSE/Polling).
- Storage:
  - `supabase.storage.from('exercise-images')`
  - `supabase.storage.from('checkin-images')`
  - Ersetzen durch eigenes Object Storage (z. B. S3-kompatibel) + signierte URLs.
- Server-seitige Service-Role-Flows:
  - Admin-Routen mit Supabase Service Key ersetzen durch internes Rollen-/Berechtigungsmodell.
- Umgebungsvariablen:
  - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` entfallen im Neubau.

## 6) Vorschlag für neue Backend-API-Routen
### Auth
- `POST /api/v1/auth/login`
- `POST /api/v1/auth/refresh`
- `POST /api/v1/auth/logout`
- `GET /api/v1/auth/me`
- `POST /api/v1/auth/register-client` (optional, falls Self-Registration gewünscht)

### Users & Roles
- `GET /api/v1/users/me/profile`
- `PATCH /api/v1/users/me/profile`

### Onboarding & Linking
- `POST /api/v1/onboarding/client-link/start` (Link-Code/Token anfordern)
- `POST /api/v1/onboarding/client-link/complete` (Account mit bestehendem Client-Datensatz verknüpfen)
- `GET /api/v1/onboarding/client-link/status`

### Trainer: Clients
- `GET /api/v1/trainer/clients`
- `POST /api/v1/trainer/clients`
- `GET /api/v1/trainer/clients/:clientId`
- `PATCH /api/v1/trainer/clients/:clientId`
- `GET /api/v1/trainer/clients/:clientId/detail` (Aggregatansicht: Stammdaten, Planstatus, Logs, Progress, Check-ins)
- `GET /api/v1/trainer/clients/:clientId/workout-logs`
- `GET /api/v1/trainer/clients/:clientId/progress-logs`
- `GET /api/v1/trainer/clients/:clientId/checkins`
- `GET /api/v1/trainer/clients/:clientId/nutrition-history`

### Workouts & Plans
- `GET /api/v1/trainer/workout-plans`
- `POST /api/v1/trainer/workout-plans`
- `GET /api/v1/trainer/workout-plans/:planId`
- `PATCH /api/v1/trainer/workout-plans/:planId`
- `DELETE /api/v1/trainer/workout-plans/:planId`
- `POST /api/v1/trainer/workout-plans/:planId/days`
- `PATCH /api/v1/trainer/workout-days/:dayId`
- `DELETE /api/v1/trainer/workout-days/:dayId`
- `POST /api/v1/trainer/workout-days/:dayId/exercises`
- `PATCH /api/v1/trainer/exercises/:exerciseId`
- `DELETE /api/v1/trainer/exercises/:exerciseId`
- `POST /api/v1/trainer/workout-plans/:planId/assignments`
- `PATCH /api/v1/trainer/workout-plan-assignments/:assignmentId`
- `DELETE /api/v1/trainer/workout-plan-assignments/:assignmentId`

Wichtiger Backend-Side-Effect bei Workout-Day-Erstellung:
- Bei `POST /api/v1/trainer/workout-plans/:planId/days` muss das Backend automatisch Notifications für alle **aktiven** Clients dieses Plans erzeugen.
- Diese Logik liegt aktuell im Frontend (Funktion `saveDay()`), soll im Neubau aber vollständig backendseitig umgesetzt werden.

### Exercise Library
- `GET /api/v1/exercises/library`
- `POST /api/v1/exercises/library`
- `PATCH /api/v1/exercises/library/:exerciseId`
- `DELETE /api/v1/exercises/library/:exerciseId`

### Client Training Execution
- `GET /api/v1/client/plan` (aktiver Plan inkl. Tage)
- `GET /api/v1/client/plan/:dayId`
- `GET /api/v1/client/workout-days/:dayId`
- `POST /api/v1/client/workout-logs`
- `PATCH /api/v1/client/workout-logs/:logId`
- `POST /api/v1/client/exercise-change-requests`
- `GET /api/v1/client/workout-logs`
- `GET /api/v1/client/workout-logs/:logId`
- `GET /api/v1/client/exercise-logs`

### Trainer: Change Requests
- `GET /api/v1/trainer/exercise-change-requests`
- `GET /api/v1/trainer/exercise-change-requests/:requestId`
- `PATCH /api/v1/trainer/exercise-change-requests/:requestId` (z. B. `approved`/`rejected`)

### Nutrition
- `GET /api/v1/trainer/nutrition-plans`
- `POST /api/v1/trainer/nutrition-plans`
- `GET /api/v1/trainer/nutrition-plans/:planId`
- `PATCH /api/v1/trainer/nutrition-plans/:planId`
- `DELETE /api/v1/trainer/nutrition-plans/:planId`
- `POST /api/v1/trainer/nutrition-plans/:planId/assignments`
- `PATCH /api/v1/trainer/nutrition-plan-assignments/:assignmentId`
- `DELETE /api/v1/trainer/nutrition-plan-assignments/:assignmentId`
- `GET /api/v1/foods`
- `POST /api/v1/foods`
- `PATCH /api/v1/foods/:foodId`
- `DELETE /api/v1/foods/:foodId`
- `GET /api/v1/client/nutrition/active-plan`
- `PUT /api/v1/client/nutrition/meal-foods`
- `POST /api/v1/client/nutrition/meal-logs`
- `POST /api/v1/client/nutrition/drink-logs`
- `GET /api/v1/client/nutrition/meal-logs`
- `GET /api/v1/client/nutrition/meal-history`
- `GET /api/v1/client/nutrition/drink-logs`

### Recipes
- `GET /api/v1/recipes`
- `GET /api/v1/recipes/:recipeId`
- `POST /api/v1/trainer/recipes`
- `PATCH /api/v1/trainer/recipes/:recipeId`
- `DELETE /api/v1/trainer/recipes/:recipeId`
- `POST /api/v1/trainer/recipes/import` (optional, falls PDF-/Bulk-Import später benötigt wird)

### Progress & Check-ins
- `GET /api/v1/client/progress`
- `POST /api/v1/client/progress`
- `GET /api/v1/client/checkins`
- `POST /api/v1/client/checkins`
- `POST /api/v1/client/checkins/:checkinId/images`

### Messaging & Notifications
- `GET /api/v1/messages`
- `POST /api/v1/messages`
- `GET /api/v1/notifications`
- `PATCH /api/v1/notifications/:id/read`
- `PATCH /api/v1/notifications/read-all`

### System
- `GET /api/v1/health`

## 7) Vorschlag für neue PostgreSQL-Tabellen
- `users`
- `user_profiles`
- `trainer_clients`
- `workout_plans`
- `workout_days`
- `workout_exercises`
- `workout_plan_assignments`
- `workout_logs`
- `exercise_logs`
- `exercise_log_sets` (empfohlen für per-set Logging)
- `exercise_change_requests`
- `exercise_library`
- `nutrition_plans`
- `nutrition_meals`
- `nutrition_meal_foods` (falls planseitige Foods explizit persistiert werden)
- `nutrition_plan_assignments`
- `foods`
- `food_swap_options`
- `client_meal_foods`
- `client_food_swaps`
- `meal_logs`
- `meal_history`
- `drink_logs`
- `recipes`
- `progress_logs`
- `weekly_checkins`
- `checkin_images`
- `messages`
- `notifications`
- optional: `file_uploads` (Metadaten für Bilder/Assets)
- `client_link_tokens` (Onboarding/Verknüpfung)

Konkrete Feld-Ergänzungen (wichtig):
- `trainer_clients`:
  - `id`, `trainer_id`, `user_id` (nullable bis Linking), `full_name`, `email`, `phone`, `notes`, `status`, `created_at`, `updated_at`
- `exercise_logs` (Aggregat pro Übung innerhalb eines Workout-Logs):
  - `id`, `workout_log_id`, `exercise_id`, `completed`, `sets_done`, `total_volume_kg` (optional), `avg_reps` (optional), `note`, `created_at`, `updated_at`
- `exercise_log_sets` (Detail pro Satz):
  - `id`, `exercise_log_id`, `set_index`, `reps`, `weight_kg`, `rpe` (optional), `completed`, `created_at`
- `exercise_change_requests`:
  - `id`, `client_id`, `exercise_id`, `workout_day_id`, `reason`, `status`, `trainer_note`, `resolved_at`, `created_at`, `updated_at`
- `recipes`:
  - `id`, `name`, `category`, `ingredients_json`, `instructions`, `kcal`, `protein_g`, `carbs_g`, `fat_g`, `created_by`, `created_at`, `updated_at`
- `client_link_tokens`:
  - `id`, `client_id`, `token_hash`, `expires_at`, `consumed_at`, `created_at`

Hinweis zur Modellierung:
- Für klare Ownership und Rechte sollte jede fachliche Tabelle einen eindeutigen Bezug auf `trainer_id` oder `client_id` haben.
- Statusfelder (z. B. `is_active`, `status`) und Timestamps (`created_at`, `updated_at`) sollten standardmäßig vorgesehen werden.

### Empfehlung ExerciseLog-Schema (per Set vs. aggregiert)
- Empfehlung: **hybrides Modell**.
- `exercise_logs` speichert den Aggregat-Status pro Übung in einer Einheit (performant für Listen/Statistiken).
- `exercise_log_sets` speichert die tatsächlichen Satzdaten für Fortschrittsanalysen.
- Begründung:
  - Aggregat-only ist für tiefe Auswertung zu grob.
  - Per-set-only macht viele Standardabfragen unnötig teuer.
  - Hybrid deckt Dashboard, Historie und Detailanalyse gleichzeitig sauber ab.

### Einfache Realtime-Strategie (später)
- Phase 1: Nur REST + kurzes Polling (z. B. 15-30 Sekunden) für Notifications/Message-Listen.
- Phase 2: SSE für server->client Ereignisse (`notifications`, `messages`, `change-request-updates`).
- Phase 3: Optional WebSocket, falls bidirektionale Features (z. B. Live-Chat-Status, Presence) wirklich benötigt werden.
- Startpunkt für später:
  - `GET /api/v1/events/stream` (SSE, auth-geschützt, role-aware Event-Filter)

## 8) Empfohlene Reihenfolge für den Neubau
1. Grundlagen festlegen:
   - Neues Datenbankschema (ERD), Rollen-/Berechtigungskonzept, API-Konvention (`/api/v1`).
2. Auth + Session im neuen Backend:
   - JWT/Refresh-Flow, Middleware für Rollen (`trainer`/`client`).
3. Client-Onboarding & Linking:
   - `trainer_clients` + `client_link_tokens`, sichere Verknüpfung User <-> Client-Datensatz.
4. Core Coaching Domain:
   - Clients, Workout-Pläne, Workout-Tage, Übungen, Planzuweisungen.
   - Enthält auch den Backend-Side-Effect für neue Workout-Days: automatische Notifications an aktive Plan-Clients.
   - Dieser Side-Effect ist für Phase 4 geplant und blockiert Phase 1-3 nicht.
5. Client-Plan & Workout-Read APIs:
   - Client-GET-Routen für aktiven Plan, Day-Details, Logs.
6. Workout Logging:
   - `exercise_logs` + `exercise_log_sets` (hybrid), Abschlusslogik, Auswertungen.
7. Change-Request Workflow:
   - Client erstellt Requests, Trainer-Review/Entscheidung, Statushistorie.
8. Nutrition Domain inkl. Recipes:
   - Foods, Nutrition-Pläne, Meal-Struktur, Meal/Drink/History-Reads, Recipe-CRUD.
9. Trainer Client Detail APIs:
   - Aggregierte Detailansichten (Logs, Progress, Check-ins, Nutrition-History).
10. Progress & Check-ins:
    - Progress-Logs, Weekly Check-ins, Image-Upload-Pipeline.
11. Messaging & Notifications:
    - REST + Polling zuerst, danach SSE-Stream.
12. Frontend-Umschaltung:
    - Schrittweise Ersetzung der Supabase-Calls durch neue API-Client-Layer.
13. Hard Cut:
    - Supabase-Codepfade entfernen, ENV bereinigen, End-to-End-Test gegen neue DB/API.
