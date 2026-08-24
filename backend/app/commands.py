import click
from datetime import datetime, timedelta, timezone
from sqlalchemy import or_
from flask import current_app
from flask.cli import with_appcontext

from app.extensions import db
from app.models import Media, RefreshSession, User, UserRole
from app.storage import get_storage
from app.common.validation import USERNAME_RE, normalize_email, normalize_username


def register_commands(app):
    @app.cli.command("backup-create")
    @click.option("--output", required=True, type=click.Path(dir_okay=False, path_type=str))
    @with_appcontext
    def backup_create(output):
        from app.backup import create_backup
        try:
            summary = create_backup(output)
        except (OSError, ValueError) as error:
            raise click.ClickException(str(error)) from error
        click.echo(f"backup created: {summary['path']} ({summary['tables']} tables, {summary['files']} files)")

    @app.cli.command("backup-verify")
    @click.option("--input", "input_path", required=True, type=click.Path(exists=True, dir_okay=False, path_type=str))
    @with_appcontext
    def backup_verify(input_path):
        from app.backup import verify_backup
        try:
            summary = verify_backup(input_path)
        except (OSError, ValueError) as error:
            raise click.ClickException(str(error)) from error
        click.echo(f"backup verified: {summary['path']} ({summary['tables']} tables, {summary['files']} files)")

    @app.cli.command("backup-restore")
    @click.option("--input", "input_path", required=True, type=click.Path(exists=True, dir_okay=False, path_type=str))
    @click.option("--confirm", required=True, help="必须明确填写 RESTORE。")
    @with_appcontext
    def backup_restore(input_path, confirm):
        from app.backup import restore_backup
        if confirm != "RESTORE":
            raise click.ClickException("恢复会覆盖当前数据库；--confirm 必须填写 RESTORE。")
        try:
            summary = restore_backup(input_path)
        except (OSError, ValueError) as error:
            raise click.ClickException(str(error)) from error
        click.echo(f"backup restored: {summary['path']}")

    @app.cli.command("create-admin")
    @click.option("--username", prompt=True)
    @click.option("--nickname", prompt=True)
    @click.option("--email", prompt=True)
    @click.option("--password", prompt=True, hide_input=True, confirmation_prompt=True)
    @with_appcontext
    def create_admin(username, nickname, email, password):
        normalized = normalize_username(username)
        email_normalized = normalize_email(email)
        if not USERNAME_RE.fullmatch(normalized):
            raise click.ClickException("username 必须为 3–32 位小写字母、数字、-、_。")
        if len(password) < 8:
            raise click.ClickException("密码至少 8 位。")
        if db.session.scalar(db.select(User.id).where(or_(
            User.username_normalized == normalized,
            User.email_normalized == email_normalized,
        ))):
            raise click.ClickException("用户名或邮箱已存在。")
        user = User(
            username=normalized,
            username_normalized=normalized,
            nickname=nickname.strip(),
            email=email_normalized,
            email_normalized=email_normalized,
            role=UserRole.SYSTEM_ADMIN.value,
        )
        user.set_password(password)
        db.session.add(user)
        db.session.commit()
        click.echo(f"system_admin created: {user.username_normalized}")

    @app.cli.command("cleanup-orphan-media")
    @click.option("--older-than-hours", default=24, type=click.IntRange(min=1), show_default=True)
    @click.option("--dry-run/--delete", default=True, show_default=True)
    @with_appcontext
    def cleanup_orphan_media(older_than_hours, dry_run):
        cutoff=datetime.now(timezone.utc)-timedelta(hours=older_than_hours)
        rows=db.session.scalars(db.select(Media).where(
            Media.bound_type.is_(None),Media.created_at<cutoff,
        ).order_by(Media.id)).all()
        click.echo(f"orphan media candidates: {len(rows)}")
        if dry_run:
            return
        storage=get_storage()
        paths=set()
        for media in rows:
            paths.update([
                key for key in (media.storage_key, media.display_key, media.thumbnail_key) if key
            ])
            db.session.delete(media)
        db.session.commit()
        removed=0
        for key in paths:
            if storage.delete(key): removed+=1
        click.echo(f"deleted media rows: {len(rows)}; files: {removed}")

    @app.cli.command("purge-expired-sessions")
    @with_appcontext
    def purge_expired_sessions():
        now=datetime.now(timezone.utc)
        rows=db.session.scalars(db.select(RefreshSession).where(RefreshSession.expires_at<=now)).all()
        for row in rows:
            db.session.delete(row)
        db.session.commit()
        click.echo(f"deleted expired sessions: {len(rows)}")
