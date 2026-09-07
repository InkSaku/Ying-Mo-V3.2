import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { excerpt } from "../src/lib/format.js";

function source(path) {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

test("browse excerpts prefer the ACL-safe preview without exposing media placeholders", () => {
  assert.equal(excerpt({ content_excerpt: "## 今天 [[ym-media:7]] **下雨了**", body: "完整正文" }), "今天 下雨了");
  assert.equal(excerpt({ summary: "文章摘要", body: "文章正文" }), "文章摘要");
});

test("home feed dispatches Article and Note to independent components", () => {
  const dispatcher = source("../src/components/FeedPost.jsx");
  assert.match(dispatcher, /article: ArticleFeedPost/);
  assert.match(dispatcher, /note: NoteFeedPost/);
  assert.doesNotMatch(dispatcher, /isArticle|post_type ===/);

  const article = source("../src/components/ArticleFeedPost.jsx");
  const note = source("../src/components/NoteFeedPost.jsx");
  assert.match(article, /阅读全文与回应/);
  assert.match(article, /reading_minutes/);
  assert.match(note, /home-feed-note-text/);
  assert.doesNotMatch(note, /reading_minutes|未命名文章/);
});

test("browse cards keep a compatible dispatcher with type-specific semantics", () => {
  const dispatcher = source("../src/components/PostCard.jsx");
  assert.match(dispatcher, /article: ArticlePostCard/);
  assert.match(dispatcher, /note: NotePostCard/);
  assert.doesNotMatch(dispatcher, /isArticle|post_type ===/);

  const article = source("../src/components/ArticlePostCard.jsx");
  const note = source("../src/components/NotePostCard.jsx");
  assert.match(article, /发布：/);
  assert.match(article, /category/);
  assert.match(note, /发生：/);
  assert.match(note, /note-card-text/);
  assert.doesNotMatch(note, /category|未命名随记/);
});

test("Article and Note browsing use distinct editorial structures", () => {
  const page = source("../src/pages/PostsPage.jsx");

  assert.match(page, /function ArticleMagazine/);
  assert.match(page, /ArticleLeadStory/);
  assert.match(page, /ArticleMarginStory/);
  assert.match(page, /ArticleIndexRow/);
  assert.doesNotMatch(page, /variant="magazine-/);
  assert.match(page, /function NoteJournal/);
  assert.match(page, /groupNotesByYear/);
  assert.match(page, /variant="journal"/);
  assert.doesNotMatch(page, /two-column-grid|note-stream/);
});

test("shared display frames preserve media, author and canonical navigation", () => {
  const frame = source("../src/components/FeedPostFrame.jsx");
  const media = source("../src/components/PostCardMedia.jsx");
  assert.match(frame, /postHref\(post\)/);
  assert.match(frame, /home-feed-avatar/);
  assert.match(frame, /fromHomeFeed: true/);
  assert.match(media, /logicalMediaFromPostDisplay\(post\)/);
  assert.match(media, /context="post-card"/);
});

test("inline and gallery media use the author-maintained ALT text", () => {
  const markdown = source("../src/components/ProtectedMarkdown.jsx");
  const gallery = source("../src/components/PostMediaGallery.jsx");

  assert.match(markdown, /group\.image\.alt_text/);
  assert.match(gallery, /group\.image\?\.alt_text/);
  assert.doesNotMatch(markdown, /alt="正文图片"/);
});

test("home memories stay a compact editorial interlude inside the reading flow", () => {
  const feed = source("../src/components/HomeFeed.jsx");
  const memory = source("../src/components/FeedMemoryInterlude.jsx");

  assert.match(feed, /homeFeedMemoryInterludeIndex/);
  assert.match(feed, /data\.memory_interlude/);
  assert.match(memory, /往年今日/);
  assert.match(memory, /fromHomeFeed: true/);
  assert.match(memory, /postHref\(post\)/);
  assert.match(memory, /memory\.items\.map/);
  assert.doesNotMatch(memory, /PostCard|FeedPost/);
});

test("Note detail owns its content-first hierarchy instead of reusing the Article header", () => {
  const page = source("../src/pages/PostDetailPage.jsx");
  const detail = source("../src/components/NoteDetail.jsx");

  assert.match(page, /<NoteDetail post={post}/);
  assert.match(page, /<NoteExperience experience={post\.experience}/);
  assert.match(detail, /note-detail-byline/);
  assert.match(detail, /post\.title \? <h1>/);
  assert.match(detail, /<h1 className="sr-only">/);
  assert.ok(detail.indexOf("{renderedBody}") < detail.indexOf("note-detail-cover"));
  assert.doesNotMatch(detail, /未命名随记/);
});

test("Article detail uses one continuous cover, metadata, contents and reading structure", () => {
  const page = source("../src/pages/PostDetailPage.jsx");
  const layout = source("../src/components/ArticleReadingLayout.jsx");

  assert.match(page, /article-detail-hero.*has-cover.*without-cover/);
  assert.ok(page.indexOf("article-detail-heading") < page.indexOf("article-detail-cover-frame"));
  assert.ok(page.indexOf("article-detail-folio") < page.indexOf("article-detail-cover-frame"));
  assert.match(layout, /article-toc-index/);
  assert.match(layout, /padStart\(2, "0"\)/);
});

test("Note experience follows explicit Collection relations with mixed content links", () => {
  const experience = source("../src/components/NoteExperience.jsx");

  assert.match(experience, /同一段共同经历/);
  assert.match(experience, /collection\.slug/);
  assert.match(experience, /postHref\(item\)/);
  assert.match(experience, /item\.post_type === "article"/);
  assert.match(experience, /item\.experience_position === "before"/);
  assert.match(experience, /ProtectedImage/);
});
