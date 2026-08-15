import { useEffect } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../lib/api";
import { useAsyncData } from "../hooks/useAsyncData";
import { usePageMeta } from "../hooks/usePageMeta";
import { formatDate, postTypeLabel } from "../lib/format";
import { PageLoader, ErrorState } from "../components/States";
import { CommentsPanel } from "../components/CommentsPanel";
import { ProtectedImage } from "../components/ProtectedImage";
import { ProtectedMarkdown } from "../components/ProtectedMarkdown";
import { PostMediaGallery } from "../components/PostMediaGallery";
import { InteractionBar } from "../components/InteractionBar";
import { ArticleReadingLayout } from "../components/ArticleReadingLayout";

export function PostDetailPage({ type }) {
  const params = useParams();
  const navigate = useNavigate();
  const path = type === "article" ? `/posts/slug/${encodeURIComponent(params.slug)}` : `/posts/${params.id}`;
  const state = useAsyncData(() => api.get(path), [path]);
  const post = state.data?.redirect ? null : state.data;
  usePageMeta(post?.title || (type === "article" ? "文章" : "随记"));

  useEffect(() => {
    if (state.data?.redirect && state.data?.canonical) {
      navigate(state.data.canonical, { replace: true });
    }
  }, [state.data, navigate]);

  if (state.loading || state.data?.redirect) return <PageLoader />;
  if (state.error) return <main className="page-shell narrow-page"><ErrorState error={state.error} onRetry={state.reload} /></main>;
  if (!post) return null;

  const renderedBody = post.rendered_html ? (
    <ProtectedMarkdown html={post.rendered_html} media={post.bound_media} />
  ) : post.body ? <div className="prose"><p>{post.body}</p></div> : null;
  const postContent = (
    <>
      {renderedBody}

      <PostMediaGallery media={post.bound_media} coverMediaId={post.cover_media_id} body={post.body} />

      {post.external_video_url ? (
        <p className="external-link"><a href={post.external_video_url} target="_blank" rel="noreferrer">打开外部视频</a></p>
      ) : null}

      <InteractionBar key={post.id} postId={post.id} initialState={post.interactions} />

      {post.post_type === "article" && (post.previous || post.next) ? (
        <nav className="article-nav" aria-label="相邻文章">
          <div>{post.previous ? <Link to={`/articles/${post.previous.slug}`}>上一篇：{post.previous.title}</Link> : null}</div>
          <div>{post.next ? <Link to={`/articles/${post.next.slug}`}>下一篇：{post.next.title}</Link> : null}</div>
        </nav>
      ) : null}
    </>
  );

  return (
    <main className={`page-shell reading-page ${post.post_type === "article" ? "reading-page-with-tools" : ""}`}>
      <article className={`post-detail ${post.post_type === "article" ? "post-detail-with-tools" : ""}`}>
        <header className={`post-detail-header ${post.post_type === "article" ? "article-reading-width" : ""}`}>
          <div className="post-detail-meta">
            <span>{postTypeLabel(post.post_type)}</span>
            <time dateTime={post.semantic_time || post.published_at}>{formatDate(post.semantic_time || post.published_at, true)}</time>
            {post.author ? <Link to={`/users/${post.author.username}`}>{post.author.nickname}</Link> : null}
          </div>
          <h1>{post.title || (post.post_type === "note" ? "随记" : "未命名文章")}</h1>
          {post.summary ? <p className="lede">{post.summary}</p> : null}
          <div className="post-context">
            {post.collection ? <Link className="tag" to={`/collections/${post.collection.slug}`}>{post.collection.name}</Link> : null}
            {post.category ? <Link className="tag" to={`/categories/${post.category.slug}`}>{post.category.name}</Link> : null}
            {post.tags?.map((tag) => <Link className="tag" key={tag.id} to={`/tags/${tag.slug}`}>#{tag.name}</Link>)}
          </div>
          {post.post_type === "note" && (post.location || post.mood) ? (
            <div className="note-context">
              {post.location ? <span>地点：{post.location}</span> : null}
              {post.mood ? <span>心情：{post.mood}</span> : null}
            </div>
          ) : null}
        </header>

        <ProtectedImage
          media={post.cover_media}
          useOriginal
          alt=""
          className={`post-detail-cover ${post.post_type === "article" ? "article-reading-width" : ""}`}
        />

        {post.post_type === "article" ? (
          <ArticleReadingLayout outline={post.outline}>{postContent}</ArticleReadingLayout>
        ) : postContent}
      </article>

      <CommentsPanel key={post.id} postId={post.id} />
    </main>
  );
}
