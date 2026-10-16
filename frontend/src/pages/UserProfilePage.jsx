import { DefaultAvatar } from "../components/DefaultAvatar";
import { InkSketch } from "../components/InkSketch";
import { useEffect } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../contexts/AuthContext";
import { useAsyncData } from "../hooks/useAsyncData";
import { usePageMeta } from "../hooks/usePageMeta";
import { PostCard } from "../components/PostCard";
import { CollectionCard } from "../components/CollectionCard";
import { Pagination } from "../components/Pagination";
import { EmptyState, ErrorState, PageLoader } from "../components/States";
import { ProtectedImage } from "../components/ProtectedImage";
import "../styles/profile-editorial.css";

const PAGE_SIZE = 12;

function cleanPage(value) {
  const parsed = Number.parseInt(value || "1", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

export function UserProfilePage() {
  const { username } = useParams();
  const { user: currentUser } = useAuth();
  const [params, setParams] = useSearchParams();
  const postsPage = cleanPage(params.get("posts_page"));
  const collectionsPage = cleanPage(params.get("collections_page"));
  const state = useAsyncData(
    () => api.get(
      `/users/${encodeURIComponent(username)}?posts_page=${postsPage}` +
      `&collections_page=${collectionsPage}&page_size=${PAGE_SIZE}`
    ),
    [collectionsPage, postsPage, username]
  );
  const data = state.data;
  const postsPagination = state.meta?.posts_pagination || {};
  const collectionsPagination = state.meta?.collections_pagination || {};
  const isSelf = currentUser?.username === data?.user?.username;
  const loadingCurrentProfile = state.loading && data?.user?.username === username.trim().toLowerCase();
  usePageMeta(data?.user?.nickname || "成员");

  useEffect(() => {
    if (state.loading || state.error) return;
    const nextPostsPage = postsPagination.total_pages > 0 && postsPage > postsPagination.total_pages
      ? postsPagination.total_pages
      : postsPage;
    const nextCollectionsPage = collectionsPagination.total_pages > 0 && collectionsPage > collectionsPagination.total_pages
      ? collectionsPagination.total_pages
      : collectionsPage;
    if (nextPostsPage === postsPage && nextCollectionsPage === collectionsPage) return;

    const next = new URLSearchParams();
    if (nextPostsPage > 1) next.set("posts_page", String(nextPostsPage));
    if (nextCollectionsPage > 1) next.set("collections_page", String(nextCollectionsPage));
    setParams(next, { replace: true });
  }, [
    collectionsPage,
    collectionsPagination.total_pages,
    postsPage,
    postsPagination.total_pages,
    setParams,
    state.error,
    state.loading,
  ]);

  const changePage = (key, value, sectionId) => {
    const next = new URLSearchParams(params);
    if (value === 1) next.delete(key);
    else next.set(key, String(value));
    setParams(next);
    window.requestAnimationFrame(() => {
      const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      document.getElementById(sectionId)?.scrollIntoView({
        block: "start",
        behavior: reducedMotion ? "auto" : "smooth",
      });
    });
  };

  if (state.loading && !loadingCurrentProfile) return <PageLoader label="正在读取成员主页" />;
  if (state.error) return <main className="page-shell"><ErrorState error={state.error} onRetry={state.reload} /></main>;

  return (
    <main className="page-shell profile-page" aria-busy={loadingCurrentProfile || undefined}>
      {loadingCurrentProfile ? <div className="profile-refresh" role="status">正在更新内容…</div> : null}
      <header className="profile-hero">
        <div className="profile-hero-kicker"><span></span><small></small></div>
        <figure className="profile-portrait">
          <ProtectedImage
            media={data.user.avatar_media}
            alt={`${data.user.nickname}的头像`}
            className="profile-avatar"
            fallback={<DefaultAvatar className="profile-avatar" />}
          />
          <figcaption aria-hidden="true">PORTRAIT / {data.user.username}</figcaption>
        </figure>
        <div className="profile-copy">
          <p className="profile-copy-label"></p>
          <InkSketch variant="writer" className="ink-profile-signature" />
          <h1>{data.user.nickname}</h1>
          <p className="profile-handle">@{data.user.username}</p>
          {data.user.bio ? <p className="profile-bio">{data.user.bio}</p> : <p className="muted">这位成员还没有填写简介。</p>}
          {data.user.region ? <p className="profile-region">所在地：{data.user.region}</p> : null}
          {isSelf ? <div className="profile-actions"><Link className="btn btn-secondary" to="/me/settings">编辑资料</Link></div> : null}
        </div>
        <dl className="profile-counts">
          <div><dt>可见内容</dt><dd>{data.visible_post_count}</dd></div>
          <div><dt>共同合集</dt><dd>{data.visible_collection_count}</dd></div>
        </dl>
      </header>

      <nav className="profile-local-nav" aria-label="个人主页目录">
        <a href="#profile-posts"><span>01</span>记录目录</a>
        <a href="#profile-collections"><span>02</span>共同合集</a>
      </nav>

      <section className="content-section profile-section" id="profile-posts" aria-labelledby="profile-posts-heading">
        <div className="profile-section-heading">
          <div>
            <p className="profile-section-kicker"></p>
            <h2 id="profile-posts-heading">记录目录</h2>
            <p></p>
          </div>
          <span className="tabular">共 {data.visible_post_count} 篇</span>
        </div>
        {data.posts?.length
          ? <div className="profile-post-catalogue">{data.posts.map((post, index) => <PostCard key={post.id} post={post} variant="profile" index={(postsPage - 1) * PAGE_SIZE + index} />)}</div>
          : <EmptyState title="暂无可读内容" description="" />}
        <Pagination
          page={postsPagination.page || postsPage}
          totalPages={postsPagination.total_pages || 0}
          onChange={(nextPage) => changePage("posts_page", nextPage, "profile-posts")}
        />
      </section>

      <section className="content-section profile-section" id="profile-collections" aria-labelledby="profile-collections-heading">
        <div className="profile-section-heading">
          <div>
            <p className="profile-section-kicker"></p>
            <h2 id="profile-collections-heading">共同合集</h2>
            <p>你与这位成员共同参与的合集。</p>
          </div>
          <span className="tabular">共 {data.visible_collection_count} 个</span>
        </div>
        {data.collections?.length
          ? <div className="profile-collection-shelf">{data.collections.map((item, index) => <CollectionCard key={item.id} collection={item} variant="shelf" index={(collectionsPage - 1) * PAGE_SIZE + index} />)}</div>
          : <EmptyState title="暂无共同合集" description="" />}
        <Pagination
          page={collectionsPagination.page || collectionsPage}
          totalPages={collectionsPagination.total_pages || 0}
          onChange={(nextPage) => changePage("collections_page", nextPage, "profile-collections")}
        />
      </section>
    </main>
  );
}
