#!/usr/bin/env python3
"""为本地 Ying-Mo 数据库生成 Collection 时间轴测试数据。

从 backend 目录运行：
    .venv/bin/python scripts/seed_demo.py
    .venv/bin/python scripts/seed_demo.py --posts 60 --seed 20260822
"""

from __future__ import annotations

import argparse
import random
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

from sqlalchemy import inspect


BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app import create_app  # noqa: E402
from app.extensions import db  # noqa: E402
from app.models import (  # noqa: E402
    ArticleSlug,
    Category,
    Collection,
    CollectionMember,
    Post,
    Tag,
    User,
)


USERS = (
    ("demo_xiaoyu", "小雨", "demo_xiaoyu@yingmo.local", "杭州", "喜欢散步、拍照和记录小事。"),
    ("demo_anan", "安安", "demo_anan@yingmo.local", "上海", "周末出门，工作日认真吃饭。"),
    ("demo_mumu", "木木", "demo_mumu@yingmo.local", "成都", "收集城市里的光、树和旧招牌。"),
)
PASSWORD = "Demo123456"

COLLECTIONS = (
    ("一起走过的城市", "从陌生街道到深夜便利店，我们共同留下的城市切片。"),
    ("四季餐桌", "饭菜、甜点、失败的烘焙，以及值得再去一次的小店。"),
    ("普通日子的闪光", "没有大事件，也值得被记住的日常瞬间。"),
)

ARTICLE_TITLES = (
    "在雨停之前抵达", "一条反复走过的路", "把周末交给旧城区", "夏天的最后一班车",
    "我们在河边坐了很久", "关于一次临时起意的出发", "冬日散步观察笔记", "城市另一面的清晨",
)
NOTE_BODIES = (
    "风很轻，路边的树影晃了一下午。",
    "临时拐进一家小店，意外吃到了今天最好的一餐。",
    "下班时天空还是亮的，忽然觉得夏天真的来了。",
    "没有安排的一天，慢慢走，慢慢聊，也很好。",
    "旧相机拍出的颜色很安静，像记忆自己加了一层滤镜。",
    "今天值得记住：咖啡没有洒，公交刚好赶上，还看见了晚霞。",
    "走到熟悉的路口，才发现那棵树已经长得很高了。",
    "雨后的空气有一点凉，我们绕远路回家。",
)
ARTICLE_PARAGRAPHS = (
    "出发的时候并没有完整计划。我们只记下了一个方向，然后把剩下的部分交给天气和脚步。",
    "真正留在记忆里的，往往不是景点，而是转角的早餐铺、等车时的闲聊，以及一阵突然吹来的风。",
    "后来整理照片，才发现当时觉得普通的画面，隔了一段时间再看，都有了清晰的温度。",
    "也许记录的意义就是这样：替未来的我们保留一些可以返回的入口。",
)
LOCATIONS = ("杭州·西湖边", "上海·武康路", "成都·玉林", "苏州·平江路", "厦门·沙坡尾", "北京·亮马河")
MOODS = ("开心", "平静", "期待", "怀念", "松弛", "惊喜")
TAGS = (("旅行", "travel"), ("日常", "daily"), ("美食", "food"), ("散步", "walk"), ("朋友", "friends"))


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="插入本地 Collection/文章/随记测试数据")
    parser.add_argument("--posts", type=int, default=36, help="本批次 Post 总数，默认 36")
    parser.add_argument("--seed", type=int, default=None, help="固定随机种子，便于复现")
    return parser.parse_args()


def get_or_create_users() -> list[User]:
    users = []
    for username, nickname, email, region, bio in USERS:
        user = db.session.scalar(db.select(User).where(User.username_normalized == username))
        if user is None:
            user = User(
                username=username,
                username_normalized=username,
                email=email,
                email_normalized=email,
                nickname=nickname,
                region=region,
                bio=bio,
                email_verified_at=datetime.now(timezone.utc),
            )
            user.set_password(PASSWORD)
            db.session.add(user)
            db.session.flush()
        users.append(user)
    return users


def get_or_create_taxonomy() -> tuple[Category, list[Tag]]:
    category = db.session.scalar(db.select(Category).where(Category.slug == "demo-life"))
    if category is None:
        category = Category(
            name="生活记录", name_normalized="生活记录", slug="demo-life",
            description="本地演示数据使用的文章分类。", sort_order=90,
        )
        db.session.add(category)

    tags = []
    for name, slug in TAGS:
        tag = db.session.scalar(db.select(Tag).where(Tag.slug == f"demo-{slug}"))
        if tag is None:
            tag = Tag(name=name, name_normalized=f"demo:{slug}", slug=f"demo-{slug}")
            db.session.add(tag)
        tags.append(tag)
    db.session.flush()
    return category, tags


def create_collections(users: list[User], batch: str, now: datetime) -> list[Collection]:
    collections = []
    for index, (name, description) in enumerate(COLLECTIONS):
        creator = users[index % len(users)]
        collection = Collection(
            creator_id=creator.id,
            name=f"{name} · {batch[-4:]}",
            slug=f"demo-{batch}-{index + 1}",
            description=description,
            first_shared_at=now - timedelta(days=900 - index * 120),
        )
        db.session.add(collection)
        db.session.flush()
        for user in users:
            if user.id != creator.id:
                db.session.add(CollectionMember(collection_id=collection.id, user_id=user.id))
        collections.append(collection)
    return collections


def create_posts(
    count: int,
    rng: random.Random,
    users: list[User],
    collections: list[Collection],
    category: Category,
    tags: list[Tag],
    batch: str,
    now: datetime,
) -> tuple[int, int]:
    article_count = 0
    note_count = 0
    per_collection_order = {collection.id: 0 for collection in collections}
    per_collection_highlights = {collection.id: 0 for collection in collections}

    for index in range(count):
        is_article = rng.random() < 0.42
        author = rng.choice(users)
        collection = rng.choice(collections)
        occurred_at = now - timedelta(
            days=rng.randint(0, 5 * 365),
            hours=rng.randint(0, 23),
            minutes=rng.randint(0, 59),
        )
        published_at = occurred_at + timedelta(hours=rng.randint(1, 72))
        order = per_collection_order[collection.id]
        per_collection_order[collection.id] += 1

        if is_article:
            title = rng.choice(ARTICLE_TITLES)
            body = f"# {title}\n\n" + "\n\n".join(rng.sample(ARTICLE_PARAGRAPHS, k=rng.randint(2, 4)))
            post = Post(
                author_id=author.id, collection_id=collection.id, post_type="article",
                title=f"{title}（{index + 1}）", summary=rng.choice(ARTICLE_PARAGRAPHS), body=body,
                category_id=category.id, status="published", visibility="private",
                published_at=published_at, occurred_at=None,
                location=rng.choice(LOCATIONS), mood=rng.choice(MOODS),
                collection_sort_order=order, created_at=published_at, updated_at=published_at,
            )
            post.tags = rng.sample(tags, k=rng.randint(1, 3))
            db.session.add(post)
            db.session.flush()
            slug = f"demo-{batch}-article-{index + 1}"
            db.session.add(ArticleSlug(post_id=post.id, current_post_id=post.id, slug=slug, is_current=True))
            article_count += 1
        else:
            post = Post(
                author_id=author.id, collection_id=collection.id, post_type="note",
                body=rng.choice(NOTE_BODIES), status="published", visibility="private",
                published_at=published_at, occurred_at=occurred_at,
                location=rng.choice(LOCATIONS), mood=rng.choice(MOODS),
                collection_sort_order=order, created_at=published_at, updated_at=published_at,
            )
            post.tags = rng.sample(tags, k=rng.randint(1, 2))
            db.session.add(post)
            note_count += 1

        highlight_order = per_collection_highlights[collection.id]
        if highlight_order < 3 and (index < 9 or rng.random() < 0.18):
            post.collection_highlight_order = highlight_order
            per_collection_highlights[collection.id] += 1

    return article_count, note_count


def main() -> int:
    args = parse_args()
    if args.posts < 3 or args.posts > 500:
        raise SystemExit("--posts 必须在 3 到 500 之间")

    app = create_app()
    if app.config.get("APP_ENV") == "production":
        raise SystemExit("安全起见，seed_demo.py 禁止在 production 环境运行。")

    with app.app_context():
        columns = {column["name"] for column in inspect(db.engine).get_columns("posts")}
        if "collection_highlight_order" not in columns:
            raise SystemExit("数据库尚未升级到 V3.3，请先运行：flask --app run.py db upgrade")

        now = datetime.now(timezone.utc)
        batch = now.strftime("%y%m%d%H%M%S%f")[-16:]
        rng = random.Random(args.seed)
        try:
            users = get_or_create_users()
            category, tags = get_or_create_taxonomy()
            collections = create_collections(users, batch, now)
            articles, notes = create_posts(
                args.posts, rng, users, collections, category, tags, batch, now
            )
            db.session.commit()
        except Exception:
            db.session.rollback()
            raise

        database = db.engine.url.render_as_string(hide_password=True)
        print(f"完成：向 {database} 写入 {len(collections)} 个合集、{articles} 篇文章、{notes} 条随记。")
        print("测试账号：demo_xiaoyu / demo_anan / demo_mumu")
        print(f"统一密码：{PASSWORD}")
        print("合集地址：")
        for collection in collections:
            print(f"  /collections/{collection.slug}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
