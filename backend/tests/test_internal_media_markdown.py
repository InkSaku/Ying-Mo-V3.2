from app.common.markdown import (
    media_ids_in_markdown,
    remove_media_placeholders,
    render_safe_markdown,
    render_safe_markdown_document,
)

from .conftest import auth, register, token_from


P0_MARKDOWN_SAMPLE = """# 标题

这是一段包含 **加粗** 的正文。

- 无序项目
- 第二项

1. 有序项目
2. 第二项

> 引用内容

[安全链接](https://example.com/read)

![外部图片](https://example.com/image.png)

| 姓名 | 状态 |
| --- | --- |
| 映墨 | 完成 |

```python
import torch
```

[[ym-media:42]]

<script>alert("unsafe")</script>

[危险链接](javascript:alert(1))
"""


def test_internal_media_placeholder_is_rendered_as_safe_marker():
    html = render_safe_markdown("before\n\n[[ym-media:42]]\n\nafter")

    assert 'data-media-id="42"' in html
    assert "[[ym-media:42]]" not in html
    assert "before" in html
    assert "after" in html


def test_internal_media_helpers_extract_and_remove_selected_ids():
    body = "[[ym-media:3]] keep [[ym-media:9]]"

    assert media_ids_in_markdown(body) == {3, 9}
    assert remove_media_placeholders(body, {3}) == " keep [[ym-media:9]]"


def test_markdown_preview_still_strips_unsafe_html():
    html = render_safe_markdown('<script>alert(1)</script>\n\n[[ym-media:2]]')

    assert "<script" not in html
    assert 'data-media-id="2"' in html


def test_p0_markdown_matrix_renders_supported_elements_and_sanitizes_xss():
    html = render_safe_markdown(P0_MARKDOWN_SAMPLE)

    for expected in (
        "<h1", "<p>", "<ul>", "<ol>", "<blockquote>",
        "<a href=", "<img", "<table>", "<pre><code", 'data-media-id="42"',
    ):
        assert expected in html
    assert '<a href="https://example.com/read">' in html
    assert '<img alt="外部图片" src="https://example.com/image.png">' in html
    assert "<script" not in html
    assert "javascript:" not in html


def test_preview_and_saved_post_share_the_same_safe_markdown_renderer(client):
    token = token_from(register(client, "markdownmatrix"))
    preview = client.post(
        "/api/v1/posts/preview",
        headers=auth(token),
        json={"body": P0_MARKDOWN_SAMPLE},
    )
    created = client.post(
        "/api/v1/posts",
        headers=auth(token),
        json={"post_type": "article", "body": P0_MARKDOWN_SAMPLE},
    )

    assert preview.status_code == 200
    assert created.status_code == 201
    assert preview.get_json()["data"]["rendered_html"] == created.get_json()["data"]["rendered_html"]


def test_p1_footnotes_render_references_backlinks_and_safe_nested_markdown():
    html = render_safe_markdown(
        "正文脚注[^1]，再次引用[^1]。\n\n"
        "[^1]: 包含 **加粗** 和 [安全链接](https://example.com)。"
    )

    assert '<sup id="fnref:1"><a class="footnote-ref" href="#fn:1">1</a></sup>' in html
    assert '<sup id="fnref2:1"><a class="footnote-ref" href="#fn:1">1</a></sup>' in html
    assert '<div class="footnote">' in html
    assert '<li id="fn:1">' in html
    assert html.count('class="footnote-backref"') == 2
    assert 'title="返回正文中的脚注 1"' in html
    assert "<strong>加粗</strong>" in html
    assert '<a href="https://example.com">安全链接</a>' in html


def test_footnote_allowlist_strips_unrelated_attributes_and_unsafe_links():
    html = render_safe_markdown(
        '正文[^safe]\n\n[^safe]: <span onclick="alert(1)">说明</span> '
        '[危险](javascript:alert(1))\n\n'
        '<div class="not-footnote" style="position:fixed">伪造容器</div>'
    )

    assert 'id="fnref:safe"' in html
    assert 'class="footnote"' in html
    assert "onclick" not in html
    assert "javascript:" not in html
    assert "style=" not in html
    assert 'class="not-footnote"' not in html
    assert "伪造容器" in html


def test_footnote_preview_and_saved_post_use_identical_html(client):
    token = token_from(register(client, "markdownfootnotes"))
    body = "统一渲染[^same]\n\n[^same]: 预览和发布结果必须一致。"
    preview = client.post(
        "/api/v1/posts/preview",
        headers=auth(token),
        json={"body": body},
    )
    created = client.post(
        "/api/v1/posts",
        headers=auth(token),
        json={"post_type": "article", "body": body},
    )

    assert preview.status_code == 200
    assert created.status_code == 201
    assert preview.get_json()["data"]["rendered_html"] == created.get_json()["data"]["rendered_html"]


def test_p1_math_emits_safe_inline_and_block_placeholders_without_touching_code():
    html = render_safe_markdown(
        "行内 $E = mc^2$。\n\n"
        "$$\n\\int_0^1 x^2 \\, dx\n$$\n\n"
        "`$not_math$`\n\n```text\n$$not math$$\n```\n\n"
        "    $$\n    indented code\n    $$\n\n"
        r"转义 \$not-math$"
    )

    assert '<span class="math-inline" data-math="E = mc^2">E = mc^2</span>' in html
    assert '<div class="math-block" data-math="\\int_0^1 x^2 \\, dx">' in html
    assert "<code>$not_math$</code>" in html
    assert "$$not math$$" in html
    assert "indented code" in html
    assert "data-math=\"not_math\"" not in html


def test_inline_math_does_not_consume_currency_or_ambiguous_spaced_delimiters():
    html = render_safe_markdown("价格 $5 and $10；保留 $ x $、$x $ 和 $ x$；只渲染 $x$。")

    assert html.count('class="math-inline"') == 1
    assert 'data-math="x"' in html
    assert "$5 and $10" in html
    assert "$ x $" in html


def test_math_placeholder_escapes_formula_attributes_and_rejects_fake_markup():
    html = render_safe_markdown(
        '$x &lt; y$\n\n'
        '<span class="fake-math" data-math="x" onclick="alert(1)">fake</span>'
    )

    assert 'class="math-inline"' in html
    assert 'data-math="x &lt; y"' in html
    assert "onclick" not in html
    assert 'class="fake-math"' not in html


def test_math_preview_and_saved_post_use_identical_html(client):
    token = token_from(register(client, "markdownmath"))
    body = "能量 $E = mc^2$。\n\n$$\\sum_{i=1}^n i$$"
    preview = client.post("/api/v1/posts/preview", headers=auth(token), json={"body": body})
    created = client.post(
        "/api/v1/posts",
        headers=auth(token),
        json={"post_type": "article", "body": body},
    )

    assert preview.status_code == 200
    assert created.status_code == 201
    assert preview.get_json()["data"]["rendered_html"] == created.get_json()["data"]["rendered_html"]


def test_article_outline_uses_stable_unicode_ids_and_only_heading_levels_two_to_four():
    document = render_safe_markdown_document(
        "# 正文一级标题\n\n"
        "## 第一节\n\n"
        "### 子节 *强调*\n\n"
        "#### 深入\n\n"
        "## 第一节\n\n"
        "##### 不进入目录"
    )

    assert document["outline"] == [
        {"id": "第一节", "level": 2, "label": "第一节"},
        {"id": "子节-强调", "level": 3, "label": "子节 强调"},
        {"id": "深入", "level": 4, "label": "深入"},
        {"id": "第一节_1", "level": 2, "label": "第一节"},
    ]
    for item in document["outline"]:
        assert f'id="{item["id"]}"' in document["html"]
    assert "正文一级标题" not in {item["label"] for item in document["outline"]}
    assert "不进入目录" not in {item["label"] for item in document["outline"]}


def test_preview_and_article_response_share_outline_while_note_hides_it(client):
    token = token_from(register(client, "markdownoutline"))
    body = "## 起点\n\n正文\n\n## 终点"
    preview = client.post("/api/v1/posts/preview", headers=auth(token), json={"body": body})
    article = client.post(
        "/api/v1/posts",
        headers=auth(token),
        json={"post_type": "article", "body": body},
    )
    note = client.post(
        "/api/v1/posts",
        headers=auth(token),
        json={"post_type": "note", "body": body},
    )

    assert preview.status_code == 200
    assert article.status_code == 201
    assert note.status_code == 201
    assert preview.get_json()["data"]["outline"] == article.get_json()["data"]["outline"]
    assert note.get_json()["data"]["outline"] == []
