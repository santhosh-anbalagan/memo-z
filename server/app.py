from collections import deque
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from hashlib import sha256
import json
import os
from pathlib import Path
import re
import secrets
from threading import Lock
from time import time
from urllib.parse import urlsplit
from uuid import UUID, uuid4

from argon2 import PasswordHasher
from argon2.exceptions import VerificationError
from fastapi import Depends, FastAPI, HTTPException, Request, Response
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse
import jwt
from pydantic import BaseModel, Field

from .store import Database


WEB = Path(__file__).resolve().parents[1] / "web" / "dist"
PAGE_POLICY = "default-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'"
WEB_ASSET = re.compile(r"(?:app-[a-f0-9]{16}\.js|styles-[a-f0-9]{16}\.css)")
ACCESS_SECONDS = 300
REFRESH_SECONDS = 30 * 24 * 60 * 60
REFRESH_COOKIE = "memo_refresh"
AUTH_PATH = "/api/auth"
ISSUER = "memo-z"
AUDIENCE = "memo-z-api"
PASSWORDS = PasswordHasher()


class Ciphertext(BaseModel):
    v: int = Field(ge=1, le=1)
    nonce: str = Field(min_length=16, max_length=16, pattern=r"^[A-Za-z0-9_-]+$")
    data: str = Field(min_length=22, max_length=350_000, pattern=r"^[A-Za-z0-9_-]+$")


class SignIn(BaseModel):
    username: str = Field(min_length=3, max_length=40, pattern=r"^[A-Za-z0-9_.-]+$")
    password: str = Field(min_length=12, max_length=256)


class Registration(SignIn):
    vault: Ciphertext


class EntryMutation(BaseModel):
    mutation_id: UUID
    base_revision: UUID | None = None
    header: Ciphertext
    body: Ciphertext
    resolves: UUID | None = None


def digest(value: str) -> str:
    return sha256(value.encode()).hexdigest()


def revision(row) -> dict:
    return {
        "id": row["id"],
        "header": json.loads(row["header"]),
        "body": json.loads(row["body"]),
        "saved_at": row["saved_at"],
    }


def create_app():
    demo = os.environ.get("MEMOZ_DEMO") == "1"
    origin = os.environ.get("MEMOZ_WEB_ORIGIN", "http://127.0.0.1:8000").rstrip("/")
    database_url = os.environ.get("MEMOZ_DATABASE_URL")
    signing_key = os.environ.get("MEMOZ_JWT_SECRET")
    secure_cookie = origin.startswith("https://")
    if not demo and (not database_url or not signing_key or len(signing_key) < 32 or not secure_cookie):
        raise RuntimeError("Set MEMOZ_DATABASE_URL, a random MEMOZ_JWT_SECRET of at least 32 characters, and an HTTPS MEMOZ_WEB_ORIGIN.")
    parsed_origin = urlsplit(origin)
    if not parsed_origin.hostname or parsed_origin.path or parsed_origin.query or parsed_origin.fragment or parsed_origin.username:
        raise RuntimeError("MEMOZ_WEB_ORIGIN must be a scheme, host, and optional port.")
    if not secure_cookie and (parsed_origin.scheme != "http" or parsed_origin.hostname not in {"127.0.0.1", "localhost"}):
        raise RuntimeError("Plain HTTP is limited to the loopback demo origin.")
    signing_key = signing_key or secrets.token_urlsafe(48)
    database = Database(database_url)
    missing_password_hash = PASSWORDS.hash(secrets.token_urlsafe(48))
    auth_attempts: dict[str, deque[float]] = {}
    attempts_lock = Lock()

    @asynccontextmanager
    async def lifespan(_app):
        database.initialize()
        yield

    app = FastAPI(title="Memo Z API", lifespan=lifespan, docs_url=None, redoc_url=None, openapi_url=None)
    app.add_middleware(GZipMiddleware, minimum_size=1024)

    @app.exception_handler(RequestValidationError)
    async def invalid_request(_request, _error):
        return JSONResponse({"detail": "Check the submitted fields and try again."}, status_code=422)

    @app.middleware("http")
    async def headers(request: Request, call_next):
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["Referrer-Policy"] = "no-referrer"
        response.headers.setdefault("Content-Security-Policy", PAGE_POLICY)
        if request.url.path.startswith("/api/"):
            response.headers["Cache-Control"] = "no-store"
        return response

    def browser_post(request: Request):
        if request.headers.get("origin") != origin or request.headers.get("x-memo-z") != "1":
            raise HTTPException(403, "This browser request did not come from Memo Z.")

    def rate_limit(request: Request):
        address = request.client.host if request.client else "unknown"
        now = time()
        with attempts_lock:
            if len(auth_attempts) >= 1024:
                for key in tuple(auth_attempts):
                    if auth_attempts[key][-1] <= now - 60:
                        del auth_attempts[key]
                if len(auth_attempts) >= 1024 and address not in auth_attempts:
                    raise HTTPException(429, "Too many sign-in attempts. Try again shortly.")
            history = auth_attempts.setdefault(address, deque())
            while history and history[0] <= now - 60:
                history.popleft()
            if len(history) >= 12:
                raise HTTPException(429, "Too many sign-in attempts. Try again shortly.")
            history.append(now)

    def account_for_request(request: Request) -> str:
        scheme, _, token = request.headers.get("authorization", "").partition(" ")
        if scheme.lower() != "bearer" or not token:
            raise HTTPException(401, "Sign in to continue.")
        try:
            data = jwt.decode(
                token, signing_key, algorithms=["HS256"], audience=AUDIENCE, issuer=ISSUER,
                options={"require": ["sub", "sid", "iat", "exp", "aud", "iss"]},
            )
        except jwt.InvalidTokenError as error:
            raise HTTPException(401, "Sign in to continue.") from error
        with database.transaction() as execute:
            session = execute(
                "SELECT 1 FROM sessions WHERE id = ? AND account_id = ? AND expires_at > ?",
                (data["sid"], data["sub"], int(time())),
            ).fetchone()
        if session is None:
            raise HTTPException(401, "Sign in to continue.")
        return data["sub"]

    def session_response(response, account, session_id, refresh, expires_at):
        now = int(time())
        response.set_cookie(
            REFRESH_COOKIE, refresh, max_age=max(0, expires_at - now), path=AUTH_PATH,
            secure=secure_cookie, httponly=True, samesite="strict",
        )
        return {
            "id": account["id"],
            "username": account["username"],
            "vault": json.loads(account["vault"]),
            "access_token": jwt.encode(
                {
                    "sid": session_id, "sub": account["id"], "iat": now,
                    "exp": min(now + ACCESS_SECONDS, expires_at), "aud": AUDIENCE, "iss": ISSUER,
                },
                signing_key, algorithm="HS256",
            ),
        }

    def new_session(execute, account):
        session_id = str(uuid4())
        refresh = secrets.token_urlsafe(48)
        now = int(time())
        expires_at = now + REFRESH_SECONDS
        execute("DELETE FROM sessions WHERE account_id = ? AND expires_at <= ?", (account["id"], now))
        execute(
            "INSERT INTO sessions (id, account_id, refresh_hash, expires_at) VALUES (?, ?, ?, ?)",
            (session_id, account["id"], digest(refresh), expires_at),
        )
        return session_id, refresh, expires_at

    @app.get("/api/health")
    def health():
        return {"status": "ok", "storage": "memory" if not database_url else "postgresql"}

    @app.post(f"{AUTH_PATH}/register", dependencies=[Depends(browser_post)], status_code=201)
    def register(data: Registration, request: Request, response: Response):
        rate_limit(request)
        if len(data.vault.data) != 64:
            raise HTTPException(422, "The encrypted vault key is invalid.")
        account = {
            "id": str(uuid4()), "username": data.username.lower(),
            "password_hash": PASSWORDS.hash(data.password), "vault": data.vault.model_dump_json(),
        }
        with database.transaction() as execute:
            saved = execute(
                "INSERT INTO accounts (id, username, password_hash, vault) VALUES (?, ?, ?, ?) "
                "ON CONFLICT (username) DO NOTHING RETURNING id",
                tuple(account.values()),
            ).fetchone()
            if saved is None:
                raise HTTPException(409, "That username is already in use.")
            tokens = new_session(execute, account)
        return session_response(response, account, *tokens)

    @app.post(f"{AUTH_PATH}/login", dependencies=[Depends(browser_post)])
    def login(data: SignIn, request: Request, response: Response):
        rate_limit(request)
        with database.transaction() as execute:
            account = execute("SELECT * FROM accounts WHERE username = ?", (data.username.lower(),)).fetchone()
        try:
            PASSWORDS.verify(account["password_hash"] if account else missing_password_hash, data.password)
        except VerificationError as error:
            raise HTTPException(401, "Check your username and password.") from error
        if not account:
            raise HTTPException(401, "Check your username and password.")
        with database.transaction() as execute:
            tokens = new_session(execute, account)
        return session_response(response, account, *tokens)

    def invalidate_reused_token(execute, refresh_hash):
        execute(
            "DELETE FROM sessions WHERE id = (SELECT session_id FROM used_refresh WHERE token_hash = ?)",
            (refresh_hash,),
        )

    @app.post(f"{AUTH_PATH}/refresh", dependencies=[Depends(browser_post)])
    def refresh_session(request: Request, response: Response):
        presented = request.cookies.get(REFRESH_COOKIE)
        if not presented:
            raise HTTPException(401, "Sign in to continue.")
        old_hash = digest(presented)
        fresh = secrets.token_urlsafe(48)
        with database.transaction() as execute:
            session = execute(
                "UPDATE sessions SET refresh_hash = ? WHERE refresh_hash = ? AND expires_at > ? "
                "RETURNING id, account_id, expires_at",
                (digest(fresh), old_hash, int(time())),
            ).fetchone()
            if session:
                execute("INSERT INTO used_refresh (token_hash, session_id) VALUES (?, ?)", (old_hash, session["id"]))
                account = execute("SELECT * FROM accounts WHERE id = ?", (session["account_id"],)).fetchone()
            else:
                invalidate_reused_token(execute, old_hash)
        if not session:
            raise HTTPException(401, "Sign in to continue.")
        return session_response(response, account, session["id"], fresh, session["expires_at"])

    @app.post(f"{AUTH_PATH}/logout", dependencies=[Depends(browser_post)], status_code=204)
    def logout(request: Request, response: Response):
        presented = request.cookies.get(REFRESH_COOKIE)
        if presented:
            with database.transaction() as execute:
                execute("DELETE FROM sessions WHERE refresh_hash = ?", (digest(presented),))
                invalidate_reused_token(execute, digest(presented))
        response.delete_cookie(REFRESH_COOKIE, path=AUTH_PATH, secure=secure_cookie, httponly=True, samesite="strict")

    @app.get("/api/entries")
    def list_entries(account_id: str = Depends(account_for_request)):
        with database.transaction() as execute:
            rows = execute(
                "SELECT e.id, e.revision_id, e.updated_at, r.header FROM entries e "
                "JOIN revisions r ON r.account_id = e.account_id AND r.id = e.revision_id "
                "WHERE e.account_id = ? ORDER BY e.updated_at DESC", (account_id,),
            ).fetchall()
        return [{**dict(row), "header": json.loads(row["header"])} for row in rows]

    @app.get("/api/entries/{entry_id}")
    def get_entry(entry_id: UUID, account_id: str = Depends(account_for_request)):
        with database.transaction() as execute:
            rows = execute(
                "SELECT r.*, e.revision_id FROM revisions r JOIN entries e "
                "ON e.account_id = r.account_id AND e.id = r.entry_id "
                "WHERE e.account_id = ? AND e.id = ? "
                "AND (r.id = e.revision_id OR (r.is_conflict = 1 AND r.is_resolved = 0)) "
                "ORDER BY r.saved_at DESC", (account_id, str(entry_id)),
            ).fetchall()
        if not rows:
            raise HTTPException(404, "Entry not found.")
        return {
            "current": next(revision(row) for row in rows if row["id"] == row["revision_id"]),
            "conflicts": [revision(row) for row in rows if row["is_conflict"]],
        }

    @app.put("/api/entries/{entry_id}")
    def save_entry(entry_id: UUID, change: EntryMutation, account_id: str = Depends(account_for_request)):
        entry = str(entry_id)
        mutation = str(change.mutation_id)
        base = str(change.base_revision) if change.base_revision else None
        resolves = str(change.resolves) if change.resolves else None
        header = change.header.model_dump_json()
        body = change.body.model_dump_json()
        if len(change.header.data) > 2048:
            raise HTTPException(422, "The entry header is too large.")
        now = datetime.now(timezone.utc).isoformat()
        with database.transaction() as execute:
            execute("UPDATE accounts SET id = id WHERE id = ?", (account_id,))
            previous = execute("SELECT * FROM revisions WHERE account_id = ? AND id = ?", (account_id, mutation)).fetchone()
            if previous:
                if (previous["entry_id"], previous["base_revision"], previous["header"], previous["body"], previous["resolves"]) != (entry, base, header, body, resolves):
                    raise HTTPException(409, "That change identifier is already in use.")
                return {"revision_id": mutation, "conflict": bool(previous["is_conflict"])}
            current = execute("SELECT revision_id FROM entries WHERE account_id = ? AND id = ?", (account_id, entry)).fetchone()
            if not current and base is not None:
                raise HTTPException(409, "That entry version is no longer available.")
            if resolves:
                conflict_row = execute(
                    "SELECT 1 FROM revisions WHERE account_id = ? AND entry_id = ? AND id = ? "
                    "AND is_conflict = 1 AND is_resolved = 0",
                    (account_id, entry, resolves),
                ).fetchone()
                if not conflict_row:
                    raise HTTPException(409, "That alternate version was already resolved.")
            conflict = bool(current and current["revision_id"] != base)
            execute(
                "INSERT INTO revisions (account_id, id, entry_id, base_revision, header, body, saved_at, is_conflict, resolves) "
                "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (account_id, mutation, entry, base, header, body, now, int(conflict), resolves),
            )
            if not current:
                execute(
                    "INSERT INTO entries (account_id, id, revision_id, updated_at) VALUES (?, ?, ?, ?)",
                    (account_id, entry, mutation, now),
                )
            elif not conflict:
                execute(
                    "UPDATE entries SET revision_id = ?, updated_at = ? WHERE account_id = ? AND id = ?",
                    (mutation, now, account_id, entry),
                )
                if resolves:
                    execute("UPDATE revisions SET is_resolved = 1 WHERE account_id = ? AND id = ?", (account_id, resolves))
        return {"revision_id": mutation, "conflict": conflict}

    @app.get("/", include_in_schema=False)
    def index():
        try:
            template = (WEB / "index.html").read_text(encoding="utf-8")
        except FileNotFoundError as error:
            raise HTTPException(503, "Build the Memo Z web client before starting the preview.") from error
        nonce = secrets.token_urlsafe(24)
        return HTMLResponse(
            template.replace("__MEMOZ_CSP_NONCE__", nonce),
            headers={
                "Cache-Control": "no-cache",
                "Content-Security-Policy": f"{PAGE_POLICY}; style-src 'self' 'nonce-{nonce}'; style-src-attr 'unsafe-inline'",
            },
        )

    @app.get("/sw.js", include_in_schema=False)
    def service_worker():
        path = WEB / "sw.js"
        if not path.is_file():
            raise HTTPException(404, "File not found.")
        return FileResponse(path, media_type="text/javascript", headers={"Cache-Control": "no-cache"})

    @app.get("/assets/{filename}", include_in_schema=False)
    def assets(filename: str):
        asset = WEB / "assets" / filename
        if not WEB_ASSET.fullmatch(filename) or not asset.is_file():
            raise HTTPException(404, "File not found.")
        return FileResponse(asset, headers={"Cache-Control": "public, max-age=31536000, immutable"})

    return app
