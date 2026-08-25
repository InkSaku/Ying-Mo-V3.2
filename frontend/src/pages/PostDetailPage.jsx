import { useEffect, useMemo } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
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
import { PostCard } from "../components/PostCard";
import { installVisibleReadTracker } from "../lib/readingStats";
import { logicalMediaFromRaw } from "../lib/mediaGallery";
import { MediaOpenButton } from "../components/MediaOpenButton";
import { useMediaLightbox } from "../contexts/MediaLightboxContext";
import { NoteDetail } from "../components/NoteDetail";
import { NoteExperience } from "../components/NoteExperience";

export function PostDetailPage({ type }) {
  const params = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const path = type === "article" ? `/posts/slug/${encodeURIComponent(params.slug)}` : `/posts/${params.id}`;
  const state = useAsyncData(() => api.get(path), [path]);
  const post = state.data?.redirect ? null : state.data;
  const galleryItems = useMemo(() => logicalMediaFromRaw(post?.bound_media, post), [post]);
  const { hydrateGallery } = useMediaLightbox();
  const postId = post?.id;
  usePageMeta(post?.title || (type === "article" ? "文章" : "随记"));

  useEffect(() => {
    if (state.data?.redirect && state.data?.canonical) {
      navigate(state.data.canonical, { replace: true });
    }
  }, [state.data, navigate]);

  useEffect(() => {
    if (!postId) return undefined;
    return installVisibleReadTracker({
      postId,
      onRead: (readPostId) => api.post(`/posts/${readPostId}/read`, {}).catch(() => undefined),
    });
  }, [postId]);

  useEffect(() => {
    if (galleryItems.length) hydrateGallery({ items: galleryItems, context: "post" });
  }, [galleryItems, hydrateGallery]);

  if (state.loading || state.data?.redirect) return <PageLoader />;
  if (state.error) return <main className="page-shell narrow-page"><ErrorState error={state.error} onRetry={state.reload} /></main>;
  if (!post) return null;
  const coverGalleryItem = galleryItems.find((item) => item.id === post.cover_media?.public_id);

  if (post.post_type === "note") {
    return (
      <main className="page-shell reading-page note-reading-page">
        {location.state?.fromHomeFeed ? (
          <button className="home-feed-back text-button" type="button" onClick={() => navigate(-1)}>返回首页时间流</button>
        ) : null}
        <NoteDetail post={post} galleryItems={galleryItems} coverGalleryItem={coverGalleryItem} />
        <NoteExperience experience={post.experience} />
        <CommentsPanel key={post.id} postId={post.id} />
      </main>
    );
  }

  const renderedBody = post.rendered_html ? (
    <ProtectedMarkdown html={post.rendered_html} media={post.bound_media} galleryItems={galleryItems} />
  ) : post.body ? <div className="prose"><p>{post.body}</p></div> : null;
  const postContent = (
    <>
      {renderedBody}

      <PostMediaGallery media={post.bound_media} coverMediaId={post.cover_media_id} body={post.body} galleryItems={galleryItems} />

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

      {post.post_type === "article" && post.related?.length ? (
        <section className="related-articles" aria-labelledby="related-articles-title">
          <div className="section-header">
            <div>
              <h2 id="related-articles-title">相关阅读</h2>
              <p>根据合集、分类与标签的明确关联整理</p>
            </div>
          </div>
          <div className="related-articles-grid">
            {post.related.map((item) => <PostCard key={item.id} post={item} compact />)}
          </div>
        </section>
      ) : null}
    </>
  );

  return (
    <main className={`page-shell reading-page ${post.post_type === "article" ? "reading-page-with-tools" : ""}`}>
      {location.state?.fromHomeFeed ? (
        <button className="home-feed-back text-button" type="button" onClick={() => navigate(-1)}>返回首页时间流</button>
      ) : null}
      <article className={`post-detail ${post.post_type === "article" ? "post-detail-with-tools" : ""}`}>
        <header className={`post-detail-header ${post.post_type === "article" ? "article-reading-width" : ""}`}>
          <div className="post-detail-meta">
            <span>{postTypeLabel(post.post_type)}</span>
            {post.author ? <Link to={`/users/${post.author.username}`}>{post.author.nickname}</Link> : null}
          </div>
          <h1>{post.title || (post.post_type === "note" ? "随记" : "未命名文章")}</h1>
          {post.summary ? <p className="lede">{post.summary}</p> : null}
          <div className="post-context">
            {post.collection ? <Link className="tag" to={`/collections/${post.collection.slug}`}>{post.collection.name}</Link> : null}
            {post.category ? <Link className="tag" to={`/categories/${post.category.slug}`}>{post.category.name}</Link> : null}
            {post.tags?.map((tag) => <Link className="tag" key={tag.id} to={`/tags/${tag.slug}`}>#{tag.name}</Link>)}
          </div>
          <dl className="post-facts">
            {post.post_type === "article" ? (
              <>
                <div><dt>发布</dt><dd><time dateTime={post.published_at}>{formatDate(post.published_at, true)}</time></dd></div>
                <div><dt>更新</dt><dd><time dateTime={post.updated_at}>{formatDate(post.updated_at, true)}</time></dd></div>
                {post.reading_minutes ? <div><dt>阅读时间</dt><dd>约 {post.reading_minutes} 分钟</dd></div> : null}
              </>
            ) : (
              <>
                <div><dt>记录时间</dt><dd><time dateTime={post.semantic_time}>{formatDate(post.semantic_time, true)}</time></dd></div>
                <div><dt>发布时间</dt><dd><time dateTime={post.published_at}>{formatDate(post.published_at, true)}</time></dd></div>
                {post.location ? <div><dt>地点</dt><dd>{post.location}</dd></div> : null}
                {post.mood ? <div><dt>心情</dt><dd>{post.mood}</dd></div> : null}
              </>
            )}
          </dl>
        </header>

        {post.cover_media ? <MediaOpenButton item={coverGalleryItem} items={galleryItems} context="post" label="在灯箱中查看封面"><ProtectedImage
          media={post.cover_media}
          useOriginal
          alt=""
          className={`post-detail-cover ${post.post_type === "article" ? "article-reading-width" : ""}`}
        /></MediaOpenButton> : null}

        {post.post_type === "article" ? (
          <ArticleReadingLayout outline={post.outline}>{postContent}</ArticleReadingLayout>
        ) : postContent}
      </article>

      <CommentsPanel key={post.id} postId={post.id} />
    </main>
  );
}
