// 把 Jupyter Notebook（.ipynb，nbformat 4）转换成正文 Markdown。只搬运内容，不执行代码：
// Markdown 单元格原样保留；代码单元格变成代码块；运行结果按“图片 > Markdown > LaTeX >
// 表格 > 纯文本”的顺序取一种呈现。图片先用占位符记下，由编辑器上传为文章图片后再替换。
import { mediaPlaceholder } from "./internalMedia.js";

export const NOTEBOOK_ACCEPT = ".ipynb,application/x-ipynb+json";
export const MAX_NOTEBOOK_BYTES = 40 * 1024 * 1024;
export const NOTEBOOK_IMAGE_FAILED = "*（这张 Notebook 图片未能导入）*";

const RASTER_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp"];
const IMAGE_EXTENSIONS = { "image/png": "png", "image/jpeg": "jpg", "image/gif": "gif", "image/webp": "webp" };
const OUTPUT_LANGUAGE = "output";
// 终端颜色与标题控制序列（ESC[…m、ESC]…BEL）。
// eslint-disable-next-line no-control-regex
const ANSI_RE = /\u001b\[[0-9;?]*[ -/]*[@-~]|\u001b\][^\u0007\u001b]*(?:\u0007|\u001b\\)/g;
const FENCE_RE = /^ {0,3}(`{3,}|~{3,})/;
const BARE_MATH_RE = /^\s*\\begin\{((?:equation|align|alignat|gather|multline|eqnarray|flalign)\*?)\}/;
const MD_ATTACHMENT_RE = /!\[[^\]\n]*\]\(\s*<?attachment:([^)\s>]+)>?(?:\s+(?:"[^"]*"|'[^']*'))?\s*\)/g;
const HTML_ATTACHMENT_RE = /<img\b[^>]*?\bsrc\s*=\s*["']attachment:([^"']+)["'][^>]*>/gi;
const OBJECT_REPR_RE = /^<[\w.]+ object>$/;

export function isNotebookFile(file) {
  return Boolean(file) && (/\.ipynb$/i.test(file.name || "") || String(file.type || "").startsWith("application/x-ipynb"));
}

function joined(value) {
  return Array.isArray(value) ? value.join("") : String(value ?? "");
}

function withoutEdgeNewlines(value) {
  return value.replace(/^\n+/, "").replace(/\s+$/, "");
}

function fenced(body, language = "") {
  const content = body.replace(/\n+$/, "");
  const longest = (content.match(/`+/g) || []).reduce((length, run) => Math.max(length, run.length), 0);
  const fence = "`".repeat(Math.max(3, longest + 1));
  return `${fence}${language}\n${content}\n${fence}`;
}

// 终端输出：去掉颜色控制符，并像终端一样只保留回车（进度条）后最后一次写入的内容。
function terminalText(value) {
  return joined(value)
    .replace(ANSI_RE, "")
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => {
      const settled = line.replace(/\r+$/, "");
      return settled.slice(settled.lastIndexOf("\r") + 1);
    })
    .join("\n");
}

function notebookLanguage(notebook) {
  const metadata = notebook.metadata || {};
  const raw = metadata.language_info?.name || metadata.kernelspec?.language || "python";
  return String(raw).trim().toLowerCase().replace(/[^-\w+.]/g, "") || "python";
}

function addImage(images, mime, data) {
  const index = images.length;
  const token = `ym-notebook-image-${index}`;
  images.push({ token, mime, data, name: `notebook-image-${index + 1}` });
  return token;
}

function safeDecode(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function replaceAttachments(markdown, attachments, images) {
  if (!attachments || typeof attachments !== "object") return markdown;
  const replace = (match, name) => {
    const bundle = attachments[name] || attachments[safeDecode(name)];
    const mime = bundle && [...RASTER_TYPES, "image/svg+xml"].find((type) => bundle[type]);
    return mime ? `\n\n${addImage(images, mime, joined(bundle[mime]))}\n\n` : match;
  };
  return markdown.replace(MD_ATTACHMENT_RE, replace).replace(HTML_ATTACHMENT_RE, replace);
}

// Jupyter 允许直接写 \begin{align}…\end{align}；这里只给单独成段、尚未处于 $$ 中的公式环境补上 $$。
function wrapBareMathEnvironments(markdown) {
  const lines = markdown.split("\n");
  const output = [];
  let fence = null;
  let insideDisplay = false;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const fenceMatch = line.match(FENCE_RE);
    if (fence) {
      if (fenceMatch && fenceMatch[1][0] === fence[0] && fenceMatch[1].length >= fence.length && !line.slice(fenceMatch[0].length).trim()) fence = null;
      output.push(line);
      continue;
    }
    if (fenceMatch) {
      fence = fenceMatch[1];
      output.push(line);
      continue;
    }
    const environment = !insideDisplay && !(output.at(-1) || "").trim() ? line.match(BARE_MATH_RE) : null;
    if (environment) {
      const end = `\\end{${environment[1]}}`;
      let last = index;
      while (last < lines.length && !lines[last].includes(end)) last += 1;
      if (last < lines.length) {
        output.push("$$", ...lines.slice(index, last + 1), "$$");
        index = last;
        continue;
      }
    }
    if ((line.match(/(?<!\\)\$\$/g) || []).length % 2) insideDisplay = !insideDisplay;
    output.push(line);
  }
  return output.join("\n");
}

function plainTitle(value) {
  return value
    .replace(/\s*\{#[^}]*\}\s*$/, "")
    .replace(/<[^>]+>/g, "")
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 240);
}

// 第一个单元格以一级标题开头时，把它提为文章标题，避免正文里重复出现。
function liftTitle(markdown) {
  const match = markdown.match(/^\s*#[ \t]+(.+?)[ \t]*#*[ \t]*(?:\n|$)/);
  const title = match ? plainTitle(match[1]) : "";
  return title ? { title, markdown: markdown.slice(match[0].length) } : { title: "", markdown };
}

function cellText(value) {
  return value.textContent.replace(/\s+/g, " ").trim()
    .replace(/[\\|*_`]/g, "\\$&")
    .replace(/</g, "&lt;");
}

// pandas DataFrame 等 HTML 表格转成 Markdown 表格；含合并单元格的复杂表格退回纯文本。
function htmlTableToMarkdown(html) {
  if (typeof DOMParser === "undefined" || !/<table[\s>]/i.test(html)) return "";
  const document = new DOMParser().parseFromString(html, "text/html");
  const tables = document.querySelectorAll("table");
  if (tables.length !== 1) return "";
  const table = tables[0];
  if (table.querySelector("[colspan]:not([colspan='1']), [rowspan]:not([rowspan='1'])")) return "";
  const cells = (row) => Array.from(row.cells, cellText);
  const headRows = table.tHead ? Array.from(table.tHead.rows, cells) : [];
  let bodyRows = Array.from(table.tBodies).flatMap((body) => Array.from(body.rows, cells));
  if (!headRows.length) {
    if (!bodyRows.length) return "";
    headRows.push(bodyRows[0]);
    bodyRows = bodyRows.slice(1);
  }
  const width = Math.max(...headRows.map((row) => row.length), ...bodyRows.map((row) => row.length));
  if (!width) return "";
  const header = Array.from({ length: width }, (_, column) => headRows.map((row) => row[column] || "").filter(Boolean).join(" "));
  const line = (row) => `| ${Array.from({ length: width }, (_, column) => row[column] || "").join(" | ")} |`;
  const notes = Array.from(document.querySelectorAll("p"), (paragraph) => cellText(paragraph)).filter(Boolean);
  return [[line(header), line(Array(width).fill("---")), ...bodyRows.map(line)].join("\n"), ...notes].join("\n\n");
}

function latexBlock(value) {
  const source = value.trim();
  const inline = source.match(/^\$(?!\$)([\s\S]+)\$$/);
  if (inline && !/(?<!\\)\$/.test(inline[1])) return `$$\n${inline[1].trim()}\n$$`;
  if (/^\$\$[\s\S]+\$\$$/.test(source) || /^\\\[[\s\S]+\\\]$/.test(source)) return source;
  return `$$\n${source}\n$$`;
}

function richOutput(data, images) {
  const raster = RASTER_TYPES.find((type) => data[type]);
  if (raster) return addImage(images, raster, joined(data[raster]));
  if (data["image/svg+xml"]) return addImage(images, "image/svg+xml", joined(data["image/svg+xml"]));
  if (data["text/markdown"]) return withoutEdgeNewlines(joined(data["text/markdown"]));
  if (data["text/latex"]) return latexBlock(joined(data["text/latex"]));
  const html = data["text/html"] ? joined(data["text/html"]) : "";
  const table = html ? htmlTableToMarkdown(html) : "";
  if (table) return table;
  const plain = data["text/plain"] ? terminalText(data["text/plain"]) : "";
  // 只有 HTML/JS 才能显示的结果（如 <IPython.core.display.HTML object>）在文章里没有意义。
  if (!plain.trim() || (OBJECT_REPR_RE.test(plain.trim()) && Object.keys(data).length > 1)) return "";
  return fenced(plain, OUTPUT_LANGUAGE);
}

function outputBlocks(outputs, images, stats) {
  const blocks = [];
  let stream = null;
  const flush = () => {
    const content = stream ? terminalText(stream.text) : "";
    if (content.trim()) blocks.push(fenced(content, OUTPUT_LANGUAGE));
    stream = null;
  };
  for (const output of Array.isArray(outputs) ? outputs : []) {
    const type = output?.output_type;
    if (type === "stream") {
      const name = output.name || "stdout";
      if (stream && stream.name !== name) flush();
      stream ||= { name, text: "" };
      stream.text += joined(output.text);
      continue;
    }
    flush();
    let block = "";
    if (type === "error") {
      const traceback = Array.isArray(output.traceback) ? output.traceback.join("\n") : "";
      const content = terminalText(traceback || `${output.ename || "Error"}: ${output.evalue || ""}`);
      block = content.trim() ? fenced(content, OUTPUT_LANGUAGE) : "";
    } else if (type === "execute_result" || type === "display_data") {
      block = richOutput(output.data || {}, images);
    }
    if (block) blocks.push(block);
    else stats.skippedOutputs += 1;
  }
  flush();
  return blocks;
}

/**
 * @param {string} source .ipynb 文件文本
 * @param {{ fileName?: string, liftTitle?: boolean }} options liftTitle 为真时提取标题（找不到一级标题就用文件名）
 */
export function convertNotebook(source, { fileName = "", liftTitle: shouldLiftTitle = false } = {}) {
  let notebook;
  try {
    notebook = JSON.parse(source);
  } catch {
    throw new Error("文件内容不是有效的 Notebook。");
  }
  if (!notebook || typeof notebook !== "object" || !Array.isArray(notebook.cells)) {
    if (Array.isArray(notebook?.worksheets)) throw new Error("这是旧版 Notebook 格式，请先在 Jupyter 中重新保存一次再导入。");
    throw new Error("文件中没有找到 Notebook 单元格。");
  }

  const language = notebookLanguage(notebook);
  const images = [];
  const blocks = [];
  const stats = { cells: 0, skippedOutputs: 0 };
  let title = "";
  let sawContent = false;

  for (const cell of notebook.cells) {
    if (!cell || typeof cell !== "object") continue;
    const tags = new Set(Array.isArray(cell.metadata?.tags) ? cell.metadata.tags : []);
    if (tags.has("remove-cell")) continue;
    const text = joined(cell.source).replace(/\r\n?/g, "\n");
    const parts = [];

    if (cell.cell_type === "markdown") {
      let markdown = text;
      if (!sawContent && shouldLiftTitle && markdown.trim()) {
        ({ title, markdown } = liftTitle(markdown));
      }
      markdown = withoutEdgeNewlines(wrapBareMathEnvironments(replaceAttachments(markdown, cell.attachments, images)));
      if (markdown) parts.push(markdown);
    } else if (cell.cell_type === "code") {
      if (!tags.has("remove-input") && text.trim()) parts.push(fenced(text, language));
      if (!tags.has("remove-output")) parts.push(...outputBlocks(cell.outputs, images, stats));
    } else if (cell.cell_type === "raw" && text.trim()) {
      parts.push(fenced(text));
    }

    if (parts.length || text.trim()) sawContent = true;
    if (!parts.length) continue;
    stats.cells += 1;
    blocks.push(...parts);
  }

  if (shouldLiftTitle && !title) title = plainTitle(fileName.replace(/\.ipynb$/i, ""));
  return { title, markdown: blocks.join("\n\n"), images, stats };
}

function base64Bytes(value) {
  const binary = atob(value.replace(/\s+/g, ""));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

async function rasterizeSvg(svg, name) {
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const width = image.naturalWidth || 800;
    const height = image.naturalHeight || 600;
    const scale = Math.min(2, 4096 / Math.max(width, height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    const context = canvas.getContext("2d");
    context.fillStyle = "#fff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise((resolve, reject) => {
      canvas.toBlob((value) => (value ? resolve(value) : reject(new Error("SVG 图片转换失败。"))), "image/png");
    });
    return new File([blob], `${name}.png`, { type: "image/png" });
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** 把 convertNotebook 返回的一张图片变成可上传的文件；SVG 先转成 PNG。 */
export async function notebookImageFile(image) {
  if (image.mime === "image/svg+xml") return rasterizeSvg(image.data, image.name);
  return new File([base64Bytes(image.data)], `${image.name}.${IMAGE_EXTENSIONS[image.mime]}`, { type: image.mime });
}

/** 用上传结果替换图片占位符；没有 mediaId 的图片在正文中留下说明。 */
export function fillNotebookImages(markdown, images, mediaIds) {
  let result = markdown;
  images.forEach((image, index) => {
    const mediaId = mediaIds[index];
    const replacement = mediaId ? mediaPlaceholder(mediaId) : NOTEBOOK_IMAGE_FAILED;
    result = result.replace(new RegExp(`\\n*${image.token}\\n*`, "g"), `\n\n${replacement}\n\n`);
  });
  return result.replace(/^\n+|\n+$/g, "");
}
