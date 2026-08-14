def register_blueprints(app):
    from app.auth.routes import bp as auth_bp
    from app.posts.routes import bp as posts_bp
    from app.collections.routes import bp as collections_bp
    from app.users.routes import bp as users_bp
    from app.comments.routes import bp as comments_bp
    from app.interactions.routes import bp as interactions_bp
    from app.notifications.routes import bp as notifications_bp
    from app.home.routes import bp as home_bp
    from app.search.routes import bp as search_bp
    from app.archive.routes import bp as archive_bp
    from app.categories.routes import bp as categories_bp
    from app.tags.routes import bp as tags_bp
    from app.admin.routes import bp as admin_bp
    from app.uploads.routes import bp as uploads_bp

    for blueprint, prefix in (
        (auth_bp, "/api/v1/auth"),
        (posts_bp, "/api/v1/posts"),
        (collections_bp, "/api/v1/collections"),
        (users_bp, "/api/v1/users"),
        (comments_bp, "/api/v1/comments"),
        (interactions_bp, "/api/v1/interactions"),
        (notifications_bp, "/api/v1/notifications"),
        (home_bp, "/api/v1/home"),
        (search_bp, "/api/v1/search"),
        (archive_bp, "/api/v1/archive"),
        (categories_bp, "/api/v1/categories"),
        (tags_bp, "/api/v1/tags"),
        (admin_bp, "/api/v1/admin"),
        (uploads_bp, "/api/v1/uploads"),
    ):
        app.register_blueprint(blueprint, url_prefix=prefix)
