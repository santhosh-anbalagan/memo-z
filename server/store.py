from contextlib import contextmanager
import sqlite3
from threading import Lock


SCHEMA = (
    """
    CREATE TABLE IF NOT EXISTS accounts (
        id TEXT PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        vault TEXT NOT NULL
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
        refresh_hash TEXT UNIQUE NOT NULL,
        expires_at BIGINT NOT NULL
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS used_refresh (
        token_hash TEXT PRIMARY KEY,
        session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS entries (
        account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
        id TEXT NOT NULL,
        revision_id TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (account_id, id)
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS revisions (
        account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
        id TEXT NOT NULL,
        entry_id TEXT NOT NULL,
        base_revision TEXT,
        header TEXT NOT NULL,
        body TEXT NOT NULL,
        saved_at TEXT NOT NULL,
        is_conflict INTEGER NOT NULL,
        is_resolved INTEGER NOT NULL DEFAULT 0,
        resolves TEXT,
        PRIMARY KEY (account_id, id)
    )
    """,
    "CREATE INDEX IF NOT EXISTS revisions_entry ON revisions(account_id, entry_id, is_conflict)",
)


class Database:
    def __init__(self, url: str | None):
        self.url = url
        self.lock = Lock()
        self.memory = None
        if not url:
            self.memory = sqlite3.connect(":memory:", check_same_thread=False)
            self.memory.row_factory = sqlite3.Row
            self.memory.execute("PRAGMA foreign_keys = ON")

    @contextmanager
    def transaction(self):
        if self.memory is not None:
            with self.lock, self.memory:
                yield self.memory.execute
            return

        import psycopg
        from psycopg.rows import dict_row

        with psycopg.connect(self.url, row_factory=dict_row) as connection:
            def execute(statement, parameters=()):
                return connection.execute(statement.replace("?", "%s"), parameters)

            yield execute

    def initialize(self):
        with self.transaction() as execute:
            for statement in SCHEMA:
                execute(statement)
