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
PAREN_MATH_RE = re.compile(r"(?<!\\)\\\((.+?)\\\)")
FENCE_OPEN_RE = re.compile(r"^[ ]{0,3}(`{3,}|~{3,})")
PANDOC_RAW_TEX_INLINE_RE = re.compile(r"`([^`]+?)`\{=(?:tex|latex)\}", re.DOTALL)
PANDOC_RAW_TEX_FENCE_RE = re.compile(
    r"(?ms)^[ \t]*(?:`{3,}|~{3,})\{=(?:tex|latex)\}[ \t]*\n"
    r"(.*?)\n[ \t]*(?:`{3,}|~{3,})[ \t]*$"
)


def normalize_math_expression(expression):
    """Remove Markdown/Pandoc wrappers introduced while converting LaTeX."""
    normalized = PANDOC_RAW_TEX_FENCE_RE.sub(lambda match: match.group(1), expression)
    normalized = PANDOC_RAW_TEX_INLINE_RE.sub(lambda match: match.group(1), normalized)
    # Pandoc escapes Markdown punctuation outside raw TeX spans. Once the whole
    # region is known to be math, those escapes must become LaTeX operators.
    normalized = normalized.replace(r"\_", "_").replace(r"\^", "^")
    # Converted documents sometimes escape literal interval brackets inside
    # an outer display region (for example ``\[ \[-1,1\] \]``).
    normalized = normalized.replace(r"\[", "[").replace(r"\]", "]")
    return normalized.strip()


def _math_placeholder(md, expression):
    normalized = normalize_math_expression(expression)
    escaped_attribute = html_lib.escape(normalized, quote=True)
    escaped_text = html_lib.escape(normalized)
    return md.htmlStash.store(
        f'<div class="math-block" data-math="{escaped_attribute}">{escaped_text}</div>'
    )


def _delimiter_outside_code_span(value, delimiter, start=0):
    """Return a delimiter offset while ignoring Markdown backtick code spans."""
    active_backticks = 0
    index = start
    while index < len(value):
        if value[index] == "`":
            closing = index
            while closing < len(value) and value[closing] == "`":
                closing += 1
            run_length = closing - index
            if active_backticks == 0:
                active_backticks = run_length
            elif active_backticks == run_length:
                active_backticks = 0
            index = closing
            continue
        if active_backticks == 0 and value.startswith(delimiter, index):
            if index == 0 or value[index - 1] != "\\":
                return index
        index += 1
    return -1


def _display_close(value, depth):
    """Find the outer ``\\]`` while balancing converted nested brackets."""
    index = 0
    while index < len(value) - 1:
        if value[index] == "\\" and (index == 0 or value[index - 1] != "\\"):
            delimiter = value[index:index + 2]
            if delimiter == r"\[":
                depth += 1
                index += 2
                continue
            if delimiter == r"\]":
                depth -= 1
                if depth == 0:
                    return index, depth
                index += 2
                continue
        index += 1
    return -1, depth


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
        expression = normalize_math_expression(match.group(1))
        element = etree.Element("span")
        element.set("class", "math-inline")
        element.set("data-math", expression)
        element.text = expression
        return element, match.start(0), match.end(0)


class MathBlockPreprocessor(Preprocessor):
    def _placeholder(self, expression):
        return _math_placeholder(self.md, expression)

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


class LatexDisplayMathPreprocessor(Preprocessor):
    """Convert LaTeX ``\\[...\\]`` regions before Markdown consumes escapes."""

    def run(self, lines):
        output = []
        index = 0
        fence_marker = None

        while index < len(lines):
            line = lines[index]

            if fence_marker is not None:
                output.append(line)
                stripped = line.lstrip(" ")
                if len(line) - len(stripped) <= 3:
                    closing = stripped.rstrip()
                    if closing and set(closing) == {fence_marker[0]} and len(closing) >= len(fence_marker):
                        fence_marker = None
                index += 1
                continue

            fence_match = FENCE_OPEN_RE.match(line)
            if fence_match:
                fence_marker = fence_match.group(1)
                output.append(line)
                index += 1
                continue

            if len(line) - len(line.lstrip(" ")) >= 4:
                output.append(line)
                index += 1
                continue

            opening = _delimiter_outside_code_span(line, r"\[")
            if opening < 0:
                output.append(line)
                index += 1
                continue

            expression_lines = []
            first_remainder = line[opening + 2:]
            depth = 1
            closing, depth = _display_close(first_remainder, depth)
            closing_index = index
            if closing >= 0:
                expression_lines.append(first_remainder[:closing])
                suffix = first_remainder[closing + 2:]
            else:
                expression_lines.append(first_remainder)
                closing_index += 1
                suffix = ""
                while closing_index < len(lines):
                    candidate = lines[closing_index]
                    closing, depth = _display_close(candidate, depth)
                    if closing >= 0:
                        expression_lines.append(candidate[:closing])
                        suffix = candidate[closing + 2:]
                        break
                    expression_lines.append(candidate)
                    closing_index += 1

            if closing < 0:
                output.append(line)
                index += 1
                continue

            prefix = line[:opening]
            expression = "\n".join(expression_lines)
            normalized = normalize_math_expression(expression)
            if not normalized:
                output.append(line)
                index += 1
                continue
            if prefix.strip():
                output.append(prefix.rstrip())
            output.extend(["", _math_placeholder(self.md, normalized), ""])
            if suffix.strip():
                output.append(suffix.lstrip())
            index = closing_index + 1

        return output


class MathExtension(Extension):
    def extendMarkdown(self, md):
        # LaTeX display delimiters must be captured before fenced-code and
        # Markdown escape processing. The preprocessor tracks ordinary fences
        # itself, while accepting Pandoc raw-TeX fences inside a math region.
        md.preprocessors.register(LatexDisplayMathPreprocessor(md), "ym_latex_display_math", 26)
        # Fenced code runs at 25; math blocks run immediately afterwards so
        # dollar delimiters inside code fences are already protected.
        md.preprocessors.register(MathBlockPreprocessor(md), "ym_math_block", 24)
        # Parenthesized LaTeX math runs after code spans but before Markdown
        # consumes the backslash delimiters. Dollar math still runs after
        # escapes to keep escaped currency and code behavior unchanged.
        md.inlinePatterns.register(
            MathInlineProcessor(PANDOC_RAW_TEX_INLINE_RE.pattern),
            "ym_pandoc_raw_tex_inline",
            195,
        )
        md.inlinePatterns.register(MathInlineProcessor(PAREN_MATH_RE.pattern), "ym_latex_inline_math", 185)
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
