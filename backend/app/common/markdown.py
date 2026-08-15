import re
import html as html_lib
from xml.etree import ElementTree as etree

import bleach
import markdown
from markdown.extensions import Extension
from markdown.extensions.toc import slugify_unicode
from markdown.inlinepatterns import InlineProcessor
from markdown.preprocessors import Preprocessor


MEDIA_PLACEHOLDER_RE = re.compile(r"\[\[ym-media:(\d+)\]\]")
INLINE_MATH_RE = re.compile(
    r"(?<!\\)(?<!\$)\$(?![\s$])((?:\\.|[^$\n])+?)(?<![\s\\])\$(?![$\w\\])"
)


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


class MathInlineProcessor(InlineProcessor):
    def handleMatch(self, match, data):
        expression = match.group(1)
        element = etree.Element("span")
        element.set("class", "math-inline")
        element.set("data-math", expression)
        element.text = expression
        return element, match.start(0), match.end(0)


class MathBlockPreprocessor(Preprocessor):
    def _placeholder(self, expression):
        escaped_attribute = html_lib.escape(expression, quote=True)
        escaped_text = html_lib.escape(expression)
        return self.md.htmlStash.store(
            f'<div class="math-block" data-math="{escaped_attribute}">{escaped_text}</div>'
        )

    def run(self, lines):
        output = []
        index = 0
        while index < len(lines):
            if len(lines[index]) - len(lines[index].lstrip(" ")) >= 4:
                output.append(lines[index])
                index += 1
                continue
            stripped = lines[index].strip()
            if stripped == "$$":
                closing = index + 1
                while closing < len(lines) and lines[closing].strip() != "$$":
                    closing += 1
                if closing < len(lines):
                    expression = "\n".join(lines[index + 1:closing]).strip()
                    if expression:
                        output.extend(["", self._placeholder(expression), ""])
                        index = closing + 1
                        continue
            elif stripped.startswith("$$") and stripped.endswith("$$") and len(stripped) > 4:
                expression = stripped[2:-2].strip()
                if expression:
                    output.extend(["", self._placeholder(expression), ""])
                    index += 1
                    continue
            output.append(lines[index])
            index += 1
        return output


class MathExtension(Extension):
    def extendMarkdown(self, md):
        # Fenced code runs at 25; math blocks run immediately afterwards so
        # dollar delimiters inside code fences are already protected.
        md.preprocessors.register(MathBlockPreprocessor(md), "ym_math_block", 24)
        # Backtick code and escapes have higher priority than inline math.
        md.inlinePatterns.register(MathInlineProcessor(INLINE_MATH_RE.pattern), "ym_math_inline", 174)


ALLOWED_TAGS = {
    "a", "blockquote", "br", "code", "del", "div", "em", "h1", "h2", "h3", "h4", "h5", "h6",
    "hr", "img", "li", "ol", "p", "pre", "span", "strong", "sup", "table", "tbody", "td",
    "th", "thead", "tr", "ul",
}
FOOTNOTE_ID_RE = re.compile(r"^(?:fn|fnref\d*):[-\w.]+$")
CODE_CLASS_RE = re.compile(r"^language-[-\w+.]+$")


def allowed_attribute(tag, name, value):
    if tag == "a":
        if name in {"href", "title"}:
            return True
        return name == "class" and value in {"footnote-ref", "footnote-backref"}
    if tag == "img":
        return name in {"src", "alt", "title", "data-media-id"}
    if tag == "code":
        return name == "class" and CODE_CLASS_RE.fullmatch(value) is not None
    if tag in {"h1", "h2", "h3", "h4", "h5", "h6"}:
        return name == "id"
    if tag == "div":
        if name == "class":
            return value in {"footnote", "math-block"}
        return name == "data-math"
    if tag == "span":
        if name == "class":
            return value == "math-inline"
        return name == "data-math"
    if tag in {"li", "sup"}:
        return name == "id" and FOOTNOTE_ID_RE.fullmatch(value) is not None
    return False


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


def _flatten_outline(tokens):
    outline = []
    for token in tokens or []:
        level = token.get("level")
        heading_id = str(token.get("id") or "").strip()
        label = str(token.get("name") or "").strip()
        if level in {2, 3, 4} and heading_id and label:
            outline.append({"id": heading_id, "level": level, "label": label[:240]})
        outline.extend(_flatten_outline(token.get("children")))
    return outline


def render_safe_markdown_document(value):
    if not value:
        return {"html": "", "outline": []}
    renderer = markdown.Markdown(
        extensions=[
            InternalMediaExtension(), MathExtension(), "fenced_code", "tables", "sane_lists", "footnotes", "toc",
        ],
        extension_configs={
            "footnotes": {"BACKLINK_TITLE": "返回正文中的脚注 {}"},
            "toc": {"permalink": False, "slugify": slugify_unicode},
        },
        output_format="html5",
    )
    rendered = renderer.convert(value)
    safe_html = bleach.clean(
        rendered,
        tags=ALLOWED_TAGS,
        attributes=allowed_attribute,
        protocols={"http", "https"},
        strip=True,
    )
    return {"html": safe_html, "outline": _flatten_outline(renderer.toc_tokens)}


def render_safe_markdown(value):
    return render_safe_markdown_document(value)["html"]
