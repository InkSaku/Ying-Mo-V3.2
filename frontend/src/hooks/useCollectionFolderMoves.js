import { useEffect, useRef, useState } from "react";
import { api } from "../lib/api";
import { canMoveTo, movingLabel } from "../lib/collectionFolders";

const DRAG_TYPE = "application/x-yingmo-collection-move";
const SPRING_OPEN_DELAY = 650;
const ROOT_KEY = "root";

function showDragPreview(event, moving) {
  const preview = document.createElement("div");
  preview.className = "collection-drag-preview";
  preview.setAttribute("aria-hidden", "true");
  const icon = event.currentTarget.querySelector(".collection-file-icon");
  if (icon) preview.append(icon.cloneNode(true));
  const text = document.createElement("span");
  text.className = "collection-drag-preview-copy";
  const name = document.createElement("strong");
  name.textContent = moving.kind === "folder" ? moving.item.name : moving.items[0]?.title || "一则随记";
  const detail = document.createElement("small");
  detail.textContent = moving.kind === "folder" ? "目录" : moving.items.length > 1 ? `${moving.items.length} 则记录 · 一起移动` : moving.items[0]?.post_type === "article" ? "文章" : "随记";
  text.append(name, detail);
  preview.append(text);
  if (moving.kind === "post" && moving.items.length > 1) {
    const count = document.createElement("span");
    count.className = "collection-drag-preview-count";
    count.textContent = String(moving.items.length);
    preview.append(count);
  }
  document.body.append(preview);
  event.dataTransfer.setDragImage(preview, 22, 24);
  window.setTimeout(() => preview.remove(), 0);
}

// 目录视图和右侧目录树共用：拖拽状态、落点校验、移动请求和撤销都在这里。
export function useCollectionFolderMoves({ collection, index, onChanged }) {
  const base = `/collections/${collection.id}`;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [moved, setMoved] = useState(null);
  const [undoError, setUndoError] = useState("");
  const [dragging, setDragging] = useState(null);
  const [dropKey, setDropKey] = useState(null);
  const spring = useRef({ key: null, timer: 0 });
  // 落点校验读 ref：dragstart 时立刻可用，不用等下一次渲染；state 只负责视觉反馈。
  const activeDrag = useRef(null);

  useEffect(() => {
    const pending = spring.current;
    return () => window.clearTimeout(pending.timer);
  }, []);

  const clearFeedback = () => {
    setError("");
    setNotice("");
    setMoved(null);
    setUndoError("");
  };

  const run = async (action, success) => {
    setBusy(true);
    clearFeedback();
    try {
      await action();
      await onChanged();
      if (success) setNotice(success);
      return true;
    } catch (failure) {
      setError(failure.message);
      return false;
    } finally {
      setBusy(false);
    }
  };

  const sendMove = (moving, target) => (moving.kind === "folder"
    ? api.patch(`${base}/folders/${moving.item.id}`, { parent_id: target })
    : api.put(`${base}/posts/folder`, { post_ids: moving.items.map((post) => post.id), folder_id: target }));

  const move = async (moving, target) => {
    const done = await run(() => sendMove(moving, target));
    if (done) {
      const place = target === null ? collection.name : index.byId.get(target)?.name;
      setMoved({ moving, message: `已把${movingLabel(moving)}移到「${place}」` });
    }
    return done;
  };

  const undoMove = async () => {
    const { moving } = moved;
    setBusy(true);
    setUndoError("");
    try {
      await sendMove(moving, moving.kind === "folder" ? moving.item.parent_id ?? null : moving.from);
      await onChanged();
      setMoved(null);
      setNotice("已撤销移动。");
    } catch (failure) {
      setUndoError(failure.message);
    } finally {
      setBusy(false);
    }
  };

  const dismissMoved = () => {
    setMoved(null);
    setUndoError("");
  };

  const clearSpring = () => {
    window.clearTimeout(spring.current.timer);
    spring.current.key = null;
  };

  const endDrag = () => {
    clearSpring();
    activeDrag.current = null;
    setDragging(null);
    setDropKey(null);
  };

  const startDrag = (event, moving) => {
    event.stopPropagation();
    event.dataTransfer.clearData();
    event.dataTransfer.setData(DRAG_TYPE, "1");
    event.dataTransfer.effectAllowed = "move";
    showDragPreview(event, moving);
    activeDrag.current = moving;
    // 在 dragstart 里同步改 DOM，Chrome 可能直接取消这次拖动。
    window.setTimeout(() => {
      if (activeDrag.current === moving) setDragging(moving);
    }, 0);
  };

  // onHold：在目标上停留片刻后执行，用来展开目录树里折叠的节点。
  const dropProps = (target, onHold) => {
    const key = target ?? ROOT_KEY;
    // dragenter 也要接受落点：快速甩到目标上松手时，浏览器可能来不及派发 dragover。
    const acceptDrop = (event) => {
      if (!canMoveTo(index, activeDrag.current, target)) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
      setDropKey(key);
    };
    return {
      onDragEnter: (event) => {
        acceptDrop(event);
        if (!onHold || spring.current.key === key) return;
        window.clearTimeout(spring.current.timer);
        spring.current.key = key;
        spring.current.timer = window.setTimeout(onHold, SPRING_OPEN_DELAY);
      },
      onDragOver: acceptDrop,
      onDragLeave: (event) => {
        if (event.currentTarget.contains(event.relatedTarget)) return;
        if (spring.current.key === key) clearSpring();
        setDropKey((value) => (value === key ? null : value));
      },
      onDrop: (event) => {
        const current = activeDrag.current;
        if (!canMoveTo(index, current, target)) return;
        event.preventDefault();
        endDrag();
        void move(current, target);
      },
    };
  };

  const dropClass = (target) => (dropKey === (target ?? ROOT_KEY) ? "is-drop-target" : "");

  return {
    busy, error, notice, moved, undoError, dragging,
    run, clearFeedback, move, undoMove, dismissMoved, startDrag, endDrag, dropProps, dropClass,
  };
}
