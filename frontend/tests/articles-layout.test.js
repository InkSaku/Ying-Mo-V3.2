import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function source(path) {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

test("Articles uses a dedicated editorial composition without restyling Notes", () => {
  const page = source("../src/pages/PostsPage.jsx");
  const publication = source("../src/components/ArticlePublication.jsx");
  const filters = source("../src/components/PostFilters.jsx");
  const styles = source("../src/styles/articles.css");

  assert.match(page, /styles\/articles\.css/);
  assert.match(page, /article-magazine-opening-main/);
  assert.match(page, /LATEST STORY/);
  assert.match(page, /article-year-groups/);
  assert.match(page, /groupArticlesByYear/);
  assert.match(styles, /\.browse-page-article/);
  assert.match(styles, /article-magazine-opening-label/);
  assert.match(styles, /article-magazine-rail/);
  assert.match(styles, /article-magazine-index-list/);
  assert.match(styles, /article-year-group/);
  assert.match(filters, /post-filters-index-line/);
  assert.match(filters, /post-filters-drawer/);
  assert.match(publication, /ArticleLeadStory/);
  assert.match(publication, /ArticleMarginStory/);
  assert.match(publication, /ArticleIndexRow/);
  assert.doesNotMatch(publication, /post-card article-card|<PostCard[\s>]/);
  assert.doesNotMatch(styles, /\.post-card-/);
  assert.doesNotMatch(styles, /\.browse-page-note/);
  assert.doesNotMatch(styles, /linear-gradient|backdrop-filter|border-radius:\s*999px/);
});
