"""Smoke test for the idempotent Development SQLite tariff updater."""

import sqlite3
import subprocess
import sys
import tempfile
from contextlib import closing
from pathlib import Path


with tempfile.TemporaryDirectory() as directory:
    database = Path(directory) / "drive2u.db"
    with closing(sqlite3.connect(database)) as connection, connection:
        connection.execute('CREATE TABLE "Tariffs" ("Id" INTEGER PRIMARY KEY, "BaseFare" TEXT, "RatePerKm" TEXT, "EffectiveAt" TEXT)')
        connection.execute('CREATE TABLE "Quotes" ("Id" TEXT, "Amount" TEXT)')
        connection.execute('CREATE TABLE "Rides" ("Id" TEXT, "Amount" TEXT)')
        connection.execute('INSERT INTO "Tariffs" VALUES (1, "40.0", "12.0", "2026-10-26")')
        connection.execute('INSERT INTO "Quotes" VALUES ("old-quote", "78.4")')
        connection.execute('INSERT INTO "Rides" VALUES ("old-ride", "78.4")')

    updater = Path(__file__).with_name("update-demo-tariff.py")
    for _ in range(2):
        subprocess.run([sys.executable, str(updater), str(database)], check=True)

    with closing(sqlite3.connect(database)) as connection:
        assert connection.execute('SELECT COUNT(*) FROM "Tariffs"').fetchone()[0] == 2
        assert connection.execute('SELECT "BaseFare", "RatePerKm" FROM "Tariffs" ORDER BY "Id" DESC LIMIT 1').fetchone() == ("50.0", "42.0")
        assert connection.execute('SELECT "Amount" FROM "Quotes"').fetchone()[0] == "78.4"
        assert connection.execute('SELECT "Amount" FROM "Rides"').fetchone()[0] == "78.4"

print("SQLite tariff versioning and old amounts: passed")
