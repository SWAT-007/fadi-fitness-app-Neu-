# Supabase -> Prisma Migration Plan (Read-Only Vorbereitung)

## 1) Aktueller Hybrid-Status
- Supabase ist weiterhin das führende System für produktive/alte Bestandsdaten.
- Das eigene Backend + Prisma deckt aktuell nur Kernbereiche ab (User/Trainer/Client, Basis-Planstruktur, Link-Token, Notifications).
- Teile der Admin-Kundenoberfläche nutzen bereits die Backend-Bridge, viele Fachbereiche laufen weiterhin auf Supabase.

## 2) Sicherheitswarnung
- Keine Datenlöschung.
- Kein Überschreiben bestehender Daten.
- Kein produktiver Datenumzug ohne verifizierten Backup-Stand und Mapping-Konzept.

## 3) Supabase Tabellen-Inventar (relevant)
- `profiles`
- `clients`
- `workout_plans`
- `workout_days`
- `exercises`
- `assigned_plans`
- `workout_logs`
- `exercise_logs`
- `exercise_change_requests`
- `progress_logs`
- `weekly_checkins`
- `checkin_images`
- `nutrition_plans`
- `nutrition_meals`
- `assigned_nutrition_plans`
- `foods`
- `client_meal_foods`
- `meal_history`
- `meal_logs`
- `drink_logs`
- `recipes`
- `messages`
- `notifications`

Hinweis Storage (nicht in diesem Export): Buckets wie `checkin-images`, `exercise-images`.

## 4) Aktuelle Prisma-Abdeckung
Vorhanden in Prisma:
- `User`
- `TrainerProfile`
- `ClientProfile`
- `ClientLinkToken`
- `WorkoutPlan`
- `WorkoutDay`
- `Exercise`
- `AssignedPlan`
- `Notification`

## 5) Fehlende Prisma-Modelle/Konzepte (Stand jetzt)
- Workout-Ausführung/Verlauf (`workout_logs`, `exercise_logs`)
- Fortschritt/Check-ins (`progress_logs`, `weekly_checkins`, `checkin_images`)
- Messaging (`messages`)
- Nutrition-Stack (`nutrition_*`, `foods`, `client_meal_foods`, `meal_history`, `meal_logs`, `drink_logs`)
- Requests/Library/Rezepte (`exercise_change_requests`, `exercise_library`, `recipes`)
- Storage-Dateien/Bucket-Objekte

## 6) Kritisches ID-Mapping
Pflicht vor jedem echten Umzug:
- Supabase `clients.id` <-> Prisma `ClientProfile.id`
- Supabase `profiles.id` / Auth-User <-> Prisma `User.id`

Wahrscheinlich notwendig:
- `legacySupabaseClientId` auf `ClientProfile` und
- `legacySupabaseUserId` auf `User`
  oder separate Mapping-Tabelle.

## 7) Empfohlene Reihenfolge
1. Read-only Backup/Export
2. Mapping-Spezifikation
3. Clients/Profiles
4. Trainingspläne/Zuweisungen
5. Workout Logs
6. Progress/Check-ins
7. Nutrition
8. Messages/Notifications
9. Storage-Dateien zuletzt

## 8) Offene Risiken
- Staging-Umgebung evtl. noch nicht vollständig vorhanden
- Dual-Write/Sync-Strategie noch ungeklärt
- Storage-Datei-Migration (Buckets, Pfade, Signed URLs) ungeklärt
- Realtime/Messaging-Umstellung ungeklärt

## 9) Nächster Schritt nach dieser Vorbereitung
1. Export lokal ausführen
2. Manifest + Row-Counts prüfen
3. Erst danach Mapping-Felder und Prisma-Schemaänderungen entwerfen
