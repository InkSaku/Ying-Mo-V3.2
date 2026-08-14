from app.common.markdown import media_ids_in_markdown, remove_media_placeholders, render_safe_markdown


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
