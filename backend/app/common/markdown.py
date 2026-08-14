import re
from xml.etree import ElementTree as etree

import bleach
import markdown
from markdown.extensions import Extension
from markdown.inlinepatterns import InlineProcessor


MEDIA_PLACEHOLDER_RE = re.compile(r"\[\[ym-media:(\d+)\]\]")


class InternalMediaInlineProcessor(InlineProcessor):
    def handleMatch(self, match, data):
        element = etree.Element("img")
        element.set("data-media-id", match.group(1))
        element.set("alt", "")
        return element, match.start(0), match.end(0)


class InternalMediaExtension(Extension):
    def extendMarkdown(self, md):
        md.inlinePatterns.register(
            InternalMediaInlineProcessor(MEDIA_PLACEHOLDER_RE.pattern),
            "ym_internal_media",
            175,
        )


ALLOWED_TAGS = {
    "a", "blockquote", "br", "code", "del", "em", "h1", "h2", "h3", "h4", "h5", "h6",
    "hr", "img", "li", "ol", "p", "pre", "strong", "table", "tbody", "td", "th", "thead",
    "tr", "ul",
}
ALLOWED_ATTRIBUTES = {
    "a": ["href", "title"],
    "img": ["src", "alt", "title", "data-media-id"],
    "code": ["class"],
    "h1": ["id"], "h2": ["id"], "h3": ["id"], "h4": ["id"], "h5": ["id"], "h6": ["id"],
}


def media_ids_in_markdown(value):
    if not value:
        return set()
    return {int(match.group(1)) for match in MEDIA_PLACEHOLDER_RE.finditer(value)}


def remove_media_placeholders(value, media_ids):
    if not value:
        return value
    ids = {int(media_id) for media_id in media_ids}
    if not ids:
        return value
    return MEDIA_PLACEHOLDER_RE.sub(
        lambda match: "" if int(match.group(1)) in ids else match.group(0),
        value,
    )


def render_safe_markdown(value):
    if not value:
        return ""
    rendered = markdown.markdown(
        value,
        extensions=[InternalMediaExtension(), "fenced_code", "tables", "sane_lists", "toc"],
        extension_configs={"toc": {"permalink": False}},
        output_format="html5",
    )
    return bleach.clean(
        rendered,
        tags=ALLOWED_TAGS,
        attributes=ALLOWED_ATTRIBUTES,
        protocols={"http", "https"},
        strip=True,
    )
