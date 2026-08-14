from sqlalchemy import inspect
from sqlalchemy.exc import IntegrityError

from app.extensions import db
from app.models import Post, User


def test_v32_schema_has_no_legacy_permission_fields(app):
    with app.app_context():
        inspector = inspect(db.engine)
        user_columns = {c["name"] for c in inspector.get_columns("users")}
        collection_columns = {c["name"] for c in inspector.get_columns("collections")}
        tables = set(inspector.get_table_names())

        assert "can_publish" not in user_columns
        assert "can_comment" not in user_columns
        assert "visibility" not in collection_columns
        assert "review_status" not in collection_columns
        assert "contribution_policy" not in collection_columns
        assert "collection_members" in tables


def test_database_rejects_public_visibility(app):
    with app.app_context():
        user=User(username="alice",username_normalized="alice",email="a@example.com",email_normalized="a@example.com",nickname="Alice")
        user.set_password("password123")
        db.session.add(user); db.session.flush()
        db.session.add(Post(author_id=user.id,post_type="note",status="draft",visibility="public"))
        try:
            db.session.commit()
        except IntegrityError:
            db.session.rollback()
        else:
            raise AssertionError("database accepted retired public visibility")
