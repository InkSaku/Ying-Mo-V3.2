import { useMemo } from "react";
import { sourceHeadingInfo } from "../lib/headingAnchors";

export default function HeadingLinkWarnings({ source }) {
  const missing = useMemo(() => sourceHeadingInfo(source).missing, [source]);
  return missing.length ? <p className="editor-heading-link-warning" role="status">有 {missing.length} 处本文链接的目标标题已不存在：{missing.map((link) => link.text).join("、")}。请打开对应链接，重新选择标题或移除链接。</p> : null;
}
