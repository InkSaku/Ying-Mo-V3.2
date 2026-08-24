import { useMediaLightbox } from "../contexts/MediaLightboxContext";

export function MediaOpenButton({ item, items = null, context = "media", pagination = null, className = "", label, children }) {
  const { openGallery } = useMediaLightbox();
  if (!item) return children || null;
  return <button
    type="button"
    className={`media-lightbox-trigger ${className}`}
    aria-label={label || "在灯箱中查看媒体"}
    onClick={(event) => openGallery({
      items: items || [item],
      initialMediaId: item.id,
      context,
      pagination,
      opener: event.currentTarget,
    })}
  >{children}</button>;
}
