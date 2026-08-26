import { Link } from "react-router-dom";
import { formatDate } from "../lib/format";
import { InteractionBar } from "./InteractionBar";
import { MediaOpenButton } from "./MediaOpenButton";
import { PostMediaGallery } from "./PostMediaGallery";
import { ProtectedImage } from "./ProtectedImage";
import { ProtectedMarkdown } from "./ProtectedMarkdown";

function noteDateParts(value) {
  const date = new Date(value || "");
  if (Number.isNaN(date.getTime())) return { year: "日期未定", month: "", day: "" };
  return {
    year: String(date.getFullYear()),
    month: `${date.getMonth() + 1} 月`,
    day: String(date.getDate()).padStart(2, "0"),
  };
}

export function NoteDetail({ post, galleryItems, coverGalleryItem }) {
  const initial = (post.author?.nickname || post.author?.username || "?").slice(0, 1);
  const date = noteDateParts(post.semantic_time);
  const renderedBody = post.rendered_html ? (
    <ProtectedMarkdown html={post.rendered_html} media={post.bound_media} galleryItems={galleryItems} />
  ) : post.body ? <div className="prose"><p>{post.body}</p></div> : null;

  return (
    <article className="post-detail note-detail">
      <header className="note-detail-header">
        <Link className="note-detail-back" to="/notes">返回随记目录</Link>
        <div className="note-detail-opening">
          <time className="note-detail-date tabular" dateTime={post.semantic_time || undefined} aria-label={formatDate(post.semantic_time, true)}>
            <strong>{date.day}</strong><span>{date.month}</span><small>{date.year}</small>
          </time>
          <div className="note-detail-intro">
            <div className="note-detail-byline">
              <Link className="note-detail-avatar-link" to={`/users/${post.author?.username}`} aria-label={`查看${post.author?.nickname || "作者"}的主页`}>
                <ProtectedImage media={post.author?.avatar_media} alt="" className="note-detail-avatar" fallback={<span className="note-detail-avatar-fallback" aria-hidden="true">{initial}</span>} />
              </Link>
              <div>
                {post.author ? <Link className="note-detail-author" to={`/users/${post.author.username}`}>{post.author.nickname}</Link> : null}
                <p>记录于 <time dateTime={post.semantic_time || undefined}>{formatDate(post.semantic_time, true)}</time></p>
              </div>
            </div>
            {post.title ? <h1>{post.title}</h1> : <h1 className="sr-only">{post.author?.nickname || "成员"}记录的随记</h1>}
            {post.location || post.mood ? <dl className="note-detail-moment">
              {post.location ? <div><dt>地点</dt><dd>{post.location}</dd></div> : null}
              {post.mood ? <div><dt>心情</dt><dd>{post.mood}</dd></div> : null}
            </dl> : null}
          </div>
        </div>
      </header>

      <div className="note-detail-content">
        {renderedBody}

        {post.cover_media ? <MediaOpenButton item={coverGalleryItem} items={galleryItems} context="post" label="在灯箱中查看随记影像"><ProtectedImage
          media={post.cover_media}
          useOriginal
          alt=""
          className="post-detail-cover note-detail-cover"
        /></MediaOpenButton> : null}

        <PostMediaGallery media={post.bound_media} coverMediaId={post.cover_media_id} body={post.body} galleryItems={galleryItems} />

        {post.external_video_url ? <p className="external-link"><a href={post.external_video_url} target="_blank" rel="noreferrer">打开外部视频</a></p> : null}
      </div>

      <footer className="note-detail-context">
        <div className="post-context">
          {post.collection ? <Link className="tag" to={`/collections/${post.collection.slug}`}>{post.collection.name}</Link> : null}
          {post.tags?.map((tag) => <Link className="tag" key={tag.id} to={`/tags/${tag.slug}`}>#{tag.name}</Link>)}
        </div>
        <dl className="post-facts">
          <div><dt>发布</dt><dd><time dateTime={post.published_at || undefined}>{formatDate(post.published_at, true)}</time></dd></div>
        </dl>
      </footer>

      <InteractionBar key={post.id} postId={post.id} initialState={post.interactions} />
    </article>
  );
}
