# Release-Kalender (IIS + Datenbank)

Diese Version läuft als **ASP.NET Core Web App** hinter IIS und speichert alle Kalenderdaten in einer MS SQL Datenbank.

## Start lokal

```bash
dotnet restore
dotnet run
```

Danach ist die App unter `http://localhost:5000` bzw. dem ausgegebenen Port erreichbar.

## IIS Deployment

1. ASP.NET Core Hosting Bundle auf dem IIS-Server installieren.
2. Projekt veröffentlichen:

   ```bash
   dotnet publish -c Release -o .\publish
   ```

3. Inhalt von `publish` auf den IIS-Server kopieren.
4. In IIS eine Website auf den Publish-Ordner zeigen lassen.
5. `web.config` ist bereits enthalten und startet `ReleaseCalendar.dll`.

## API-Endpunkte

- `GET/POST/PUT/DELETE /api/events`
- `GET/POST/PUT/DELETE /api/groups`
- `POST /api/groups/{id}/close`
- `POST /api/groups/{id}/reopen`

Frontend und API liegen im selben Projekt; das Frontend nutzt die Endpunkte direkt über `fetch`.


## Benutzerverwaltung

- Benutzer werden in der Tabelle `Users` gespeichert (inkl. Rolle und Aktiv-Status).
- API-Endpunkte:
  - `GET /api/users`
  - `POST /api/users/register`
  - `POST /api/users/login`
  - `PUT /api/users/{id}`
  - `DELETE /api/users/{id}`

## Datenbank-Konfiguration

Die Anwendung erwartet eine **MS SQL Server**-Verbindung über `ConnectionStrings:CalendarDb` in `appsettings.json` (oder per Umgebungsvariable/Secret).

Beispiel:

```json
{
  "ConnectionStrings": {
    "CalendarDb": "Server=localhost;Database=ReleaseCalendar;Trusted_Connection=True;TrustServerCertificate=True;"
  }
}
```

Die Tabellen `Groups`, `Events` und `Users` müssen vorab in der Datenbank vorhanden sein (z. B. via SQL-Skript oder Migrationsprozess).
