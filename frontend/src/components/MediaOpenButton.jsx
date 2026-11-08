import { useState } from "react";
import { useMediaLightbox } from "../contexts/MediaLightboxContext";

// loadItems：列表缩略图只带第一张；点开时再取这篇内容的全部照片，交给同一个灯箱左右浏览。
// 读取失败时退回只看这一张，不让点按落空。
export function MediaOpenButton({ item, items = null, loadItems = null, context = "media", pagination = null, className = "", label, children }) {
  const { openGallery } = useMediaLightbox();
  const [loading, setLoading] = useState(false);
  if (!item) return children || null;

  const open = async (event) => {
    const opener = event.currentTarget;
    let sequence = items || [item];
    if (loadItems) {
      if (loading) return;
      setLoading(true);
      try {
        const loaded = await loadItems();
        if (loaded?.some((candidate) => candidate.id === item.id)) sequence = loaded;
      } catch {
        sequence = [item];
      } finally {
        setLoading(false);
      }
    }
    openGallery({ items: sequence, initialMediaId: item.id, context, pagination, opener });
  };

  return <button
    data-media-id={item.id}
    type="button"
    className={`media-lightbox-trigger ${className}`}
    aria-label={label || "在灯箱中查看媒体"}
    aria-busy={loading || undefined}
    onClick={(event) => { void open(event); }}
  >{children}</button>;
}
