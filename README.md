# Memo Z

Memo Z is a private daily journal. The web app uses React and Material UI with FastAPI and PostgreSQL. The [architecture](ARCHITECTURE.md) describes the mobile app, watch, media, and integrations.

## Run the web demo on Windows

From the repository root, use Python 3.11+ and Node.js 18+.

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
Push-Location web
npm.cmd ci
npm.cmd run build
Pop-Location
$env:MEMOZ_DEMO = '1'
$env:MEMOZ_WEB_ORIGIN = 'http://127.0.0.1:8765'
.\.venv\Scripts\python.exe -m uvicorn server.app:create_app --factory --host 127.0.0.1 --port 8765
```

Open [the local journal](http://127.0.0.1:8765), create a sample account, and save the recovery key. Add an entry, then change its date or reopen it from the calendar. A reload can restore the sign-in session. The recovery key unlocks the journal again. The demo database is in memory and resets when the server stops, so use sample content.

## Preview the Flutter Material 3 design

The mobile preview uses sample data and the same palette and navigation as the web journal. With Flutter 3.35 or later, generate the platform projects and run it on a device or emulator.

```powershell
Set-Location mobile
flutter create --platforms=android,ios --empty .
flutter run
```

## Use PostgreSQL

Configure an empty PostgreSQL database, set `MEMOZ_DATABASE_URL` to its connection string, and set `MEMOZ_JWT_SECRET` to a random secret of at least 32 characters. Set `MEMOZ_WEB_ORIGIN` to the external HTTPS origin and serve FastAPI behind HTTPS. Leave `MEMOZ_DEMO` unset. FastAPI initializes the database schema at startup. The backend stores journal titles, dates, and bodies as ciphertext. Store the deployment secrets outside version control.

## Current slice

- Create an account, sign in with a password, and unlock the vault with a recovery key.
- Browse Today, the calendar, and the journal list. Search titles on the client.
- Edit an entry's date and title. Add, move, and edit paragraphs, headings, and bullets.
- Save pending changes in an encrypted browser queue. Reopen pending drafts with the recovery key, retry sync, and review alternate revisions from conflicting edits.

Flutter journal sync and Wear OS are the next client work. S3 attachments, voice, AI, location, and health import build on the journal API in later slices. Password reset and account deletion are planned before private beta.
