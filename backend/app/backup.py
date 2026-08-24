import base64
from datetime import date, datetime, timezone
from decimal import Decimal
import hashlib
import json
from pathlib import Path, PurePosixPath
from zipfile import ZIP_DEFLATED, ZipFile

import sqlalchemy as sa

from app.extensions import db
from app.storage import get_storage


BACKUP_FORMAT = "ying-mo-application-backup"
BACKUP_VERSION = 1


def _encode_value(value):
    if isinstance(value, (datetime, date)):
        return {"$type": "datetime", "value": value.isoformat()}
    if isinstance(value, bytes):
        return {"$type": "bytes", "value": base64.b64encode(value).decode("ascii")}
    if isinstance(value, Decimal):
        return {"$type": "decimal", "value": str(value)}
    return value


def _decode_value(value, column):
    if not isinstance(value, dict) or "$type" not in value:
        return value
    if value["$type"] == "bytes":
        return base64.b64decode(value["value"])
    if value["$type"] == "decimal":
        return Decimal(value["value"])
    if value["$type"] == "datetime":
        parsed = datetime.fromisoformat(value["value"])
        return parsed if isinstance(column.type, sa.DateTime) else parsed.date()
    raise ValueError("unsupported backup value")


def _json_bytes(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")


def _safe_storage_archive_path(key):
    normalized = PurePosixPath(key)
    if normalized.is_absolute() or ".." in normalized.parts:
        raise ValueError("invalid media storage key")
    return f"storage/{normalized}"


def create_backup(output_path):
    output = Path(output_path).resolve()
    output.parent.mkdir(parents=True, exist_ok=True)
    output.touch(mode=0o600, exist_ok=False)
    checksums = {}
    try:
        with ZipFile(output, "w", compression=ZIP_DEFLATED, allowZip64=True) as archive:
            tables = []
            with db.engine.connect() as connection:
                for table in db.metadata.sorted_tables:
                    rows = [
                        {column.name: _encode_value(row._mapping[column.name]) for column in table.columns}
                        for row in connection.execute(sa.select(table))
                    ]
                    tables.append({
                        "name": table.name,
                        "columns": [column.name for column in table.columns],
                        "rows": rows,
                    })
            database_bytes = _json_bytes({
                "format": BACKUP_FORMAT,
                "version": BACKUP_VERSION,
                "created_at": datetime.now(timezone.utc).isoformat(),
                "tables": tables,
            })
            archive.writestr("database.json", database_bytes)
            checksums["database.json"] = hashlib.sha256(database_bytes).hexdigest()

            storage = get_storage()
            media_rows = db.session.execute(sa.select(
                db.metadata.tables["media"].c.storage_key,
                db.metadata.tables["media"].c.display_key,
                db.metadata.tables["media"].c.thumbnail_key,
            )).all()
            keys = sorted({key for row in media_rows for key in row if key})
            for key in keys:
                if not storage.exists(key):
                    raise FileNotFoundError(f"media file missing from storage: {key}")
                content = storage.read(key)
                archive_path = _safe_storage_archive_path(key)
                archive.writestr(archive_path, content)
                checksums[archive_path] = hashlib.sha256(content).hexdigest()
            archive.writestr("checksums.json", _json_bytes(checksums))
    except Exception:
        output.unlink(missing_ok=True)
        raise
    return {"path": str(output), "tables": len(tables), "files": len(checksums)}


def verify_backup(input_path):
    source = Path(input_path).resolve()
    with ZipFile(source, "r") as archive:
        if archive.testzip() is not None:
            raise ValueError("backup archive CRC check failed")
        names = archive.namelist()
        if len(names) != len(set(names)):
            raise ValueError("backup archive contains duplicate paths")
        try:
            checksums = json.loads(archive.read("checksums.json"))
        except KeyError as error:
            raise ValueError("backup archive is missing checksums.json") from error
        if not isinstance(checksums, dict) or "database.json" not in checksums:
            raise ValueError("backup checksum manifest is invalid")
        if set(names) != {"checksums.json", *checksums}:
            raise ValueError("backup archive contains unverified or missing files")
        for name, expected in checksums.items():
            path = PurePosixPath(name)
            if (
                not isinstance(name, str)
                or not isinstance(expected, str)
                or len(expected) != 64
                or path.is_absolute()
                or ".." in path.parts
                or str(path) != name
                or (name != "database.json" and not name.startswith("storage/"))
            ):
                raise ValueError("backup checksum manifest contains an invalid entry")
            actual = hashlib.sha256(archive.read(name)).hexdigest()
            if actual != expected:
                raise ValueError(f"backup checksum mismatch: {name}")
        database = json.loads(archive.read("database.json"))
        if database.get("format") != BACKUP_FORMAT or database.get("version") != BACKUP_VERSION:
            raise ValueError("unsupported backup format")
        table_items = database.get("tables", [])
        if not isinstance(table_items, list) or not all(isinstance(item, dict) for item in table_items):
            raise ValueError("backup database table list is invalid")
        known_tables = set(db.metadata.tables)
        backup_tables = {item.get("name") for item in table_items}
        if len(backup_tables) != len(table_items):
            raise ValueError("backup database contains duplicate tables")
        if backup_tables != known_tables:
            raise ValueError("backup schema does not match current application schema")
        for item in table_items:
            table = db.metadata.tables[item["name"]]
            columns = [column.name for column in table.columns]
            if item.get("columns") != columns or not isinstance(item.get("rows"), list):
                raise ValueError(f"backup schema does not match table: {table.name}")
            if any(not isinstance(row, dict) or set(row) != set(columns) for row in item["rows"]):
                raise ValueError(f"backup row shape is invalid: {table.name}")
        return {"path": str(source), "tables": len(backup_tables), "files": len(checksums)}


def restore_backup(input_path):
    summary = verify_backup(input_path)
    source = Path(input_path).resolve()
    with ZipFile(source, "r") as archive:
        database = json.loads(archive.read("database.json"))
        rows_by_table = {item["name"]: item["rows"] for item in database["tables"]}
        sorted_tables = list(db.metadata.sorted_tables)
        with db.engine.begin() as connection:
            dialect = connection.dialect.name
            if dialect == "sqlite":
                connection.exec_driver_sql("PRAGMA foreign_keys=OFF")
            elif dialect in {"mysql", "mariadb"}:
                connection.exec_driver_sql("SET FOREIGN_KEY_CHECKS=0")
            try:
                for table in reversed(sorted_tables):
                    connection.execute(table.delete())
                for table in sorted_tables:
                    rows = [
                        {
                            column.name: _decode_value(row.get(column.name), column)
                            for column in table.columns
                        }
                        for row in rows_by_table[table.name]
                    ]
                    if rows:
                        connection.execute(table.insert(), rows)
            finally:
                if dialect == "sqlite":
                    connection.exec_driver_sql("PRAGMA foreign_keys=ON")
                elif dialect in {"mysql", "mariadb"}:
                    connection.exec_driver_sql("SET FOREIGN_KEY_CHECKS=1")
        storage = get_storage()
        for name in archive.namelist():
            if not name.startswith("storage/") or name.endswith("/"):
                continue
            key = str(PurePosixPath(name).relative_to("storage"))
            storage.put(key, archive.read(name))
    db.session.remove()
    return summary
