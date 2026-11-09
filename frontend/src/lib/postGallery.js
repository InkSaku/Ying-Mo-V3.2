import { api } from "./api";
import { logicalMediaFromRaw, readingOrderGallery } from "./mediaGallery";

// 列表只带第一张图；多图随记点开大图时，再读一次这篇内容（照常鉴权），取出全部照片按正文顺序浏览。
export function postGalleryLoader(post) {
  if (!post?.id || !(Number(post.visual_count) > 1)) return null;
  return async () => {
    const result = await api.get(`/posts/${post.id}`);
    return readingOrderGallery(logicalMediaFromRaw(result.data?.bound_media, result.data), result.data);
  };
}
