"""Append the new Development fare version without altering existing quotes or rides."""

import argparse
import sqlite3
from contextlib import closing
from datetime import datetime, timezone
from decimal import Decimal
from pathlib import Path


DEFAULT_DB = Path(__file__).resolve().parents[1] / "Drive2U.Api" / "App_Data" / "drive2u.db"


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("database", nargs="?", type=Path, default=DEFAULT_DB)
    args = parser.parse_args()
    database = args.database.resolve()
    if not database.is_file():
        parser.error(f"SQLite database does not exist: {database}")

    with closing(sqlite3.connect(database)) as connection:
        with connection:
            connection.execute("BEGIN IMMEDIATE")
            latest = connection.execute(
                'SELECT "BaseFare", "RatePerKm" FROM "Tariffs" ORDER BY "Id" DESC LIMIT 1'
            ).fetchone()
            if latest is None:
                parser.error("No seeded tariff found; start the Development API first")
            if tuple(map(Decimal, latest)) == (Decimal("50"), Decimal("42")):
                print("Demo tariff already current: 50 + 42 UAH/km")
                return
            connection.execute(
                'INSERT INTO "Tariffs" ("BaseFare", "RatePerKm", "EffectiveAt") VALUES (?, ?, ?)',
                ("50.0", "42.0", datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S.%f")),
            )
    print(f"Appended demo tariff 50 + 42 UAH/km in {database}")


if __name__ == "__main__":
    main()
