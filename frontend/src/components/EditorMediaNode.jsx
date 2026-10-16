import { lazy, Suspense, useContext, useState } from "react";
import { NodeViewWrapper } from "@tiptap/react";
import { mediaPresentation } from "../lib/postMedia";
import { writeBesideMedia } from "../lib/internalMediaNode";
import { ProtectedImage } from "./ProtectedImage";
import { EditorMediaContext } from "../lib/editorMediaContext";

const MediaPresentationEditor = lazy(() => import("./MediaPresentationEditor").then((module) => ({ default: module.MediaPresentationEditor })));

export function EditorMediaNode({ editor, node, getPos, selected, deleteNode }) {
  const { mediaMap, management, onUpdateMedia } = useContext(EditorMediaContext);
  const image = mediaMap.get(Number(node.attrs.mediaId))?.primary;
  const presentation = mediaPresentation(image);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const position = getPos();
  const images = [];
  editor.state.doc.descendants((child, pos) => {
    if (child.type.name === "internalMedia") images.push({ node: child, pos });
  });
  const index = images.findIndex((item) => item.pos === position);
  const move = (direction) => {
    const target = images[index + direction];
    const from = getPos();
    if (!target || typeof from !== "number") return;
    const transaction = editor.state.tr.replaceWith(target.pos, target.pos + target.node.nodeSize, node);
    transaction.replaceWith(from, from + node.nodeSize, target.node);
    editor.view.dispatch(transaction);
    editor.commands.focus();
    editor.commands.setNodeSelection(target.pos);
  };
  const path = management
    ? image?.manage_thumbnail_path || image?.thumbnail_path || image?.manage_path || image?.read_path
    : image?.thumbnail_path || image?.read_path;
  const save = async (data) => {
    setSaving(true);
    try { await onUpdateMedia(node.attrs.mediaId, data); setEditing(false); }
    finally { setSaving(false); }
  };
  return <NodeViewWrapper as="figure" contentEditable={false} draggable
    className={`visual-media-block media-size-${presentation.display_size} media-align-${presentation.alignment}${selected ? " is-selected" : ""}`}
    aria-label={`正文图片 ${index + 1}`}>
    <div className="visual-media-block-toolbar" role="group" aria-label="图片操作">
      <span data-drag-handle title="拖动图片到正文中的新位置">图片 {index + 1}</span>
      <div>
        <button type="button" disabled={index <= 0} onClick={() => move(-1)}>上移</button>
        <button type="button" disabled={index >= images.length - 1} onClick={() => move(1)}>下移</button>
        <button type="button" onClick={() => writeBesideMedia(editor, getPos())}>下方写字</button>
        {onUpdateMedia && image ? <button type="button" aria-expanded={editing} onClick={() => setEditing((value) => !value)}>图片设置</button> : null}
        <button type="button" onClick={() => { deleteNode(); editor.commands.focus(); }}>从正文移除</button>
      </div>
    </div>
    <div data-drag-handle className="visual-media-block-surface" onClick={(event) => {
      if (!event.shiftKey) editor.chain().focus().setNodeSelection(getPos()).run();
    }}>
      {image ? <ProtectedImage path={path} alt={image.alt_text || ""} className="visual-media-block-image"
        fallback={<div className="visual-media-block-missing">图片暂时无法读取，可保留位置继续写作</div>} />
        : <div className="visual-media-block-missing">媒体 #{node.attrs.mediaId} 暂时不可用</div>}
    </div>
    {image?.caption ? <figcaption>{image.caption}</figcaption> : null}
    {editing && image ? <Suspense fallback={<div role="status">正在加载图片设置…</div>}>
      <MediaPresentationEditor media={image} busy={saving} compact onSave={save} onCancel={() => setEditing(false)} />
    </Suspense> : null}
  </NodeViewWrapper>;
}
