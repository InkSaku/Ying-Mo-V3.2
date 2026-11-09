// 纸品共用一套轮廓：闭合墨面与纸色留白形成笔压，靛蓝只落在索引签、折角和装订处。
// 保持矢量，目录树的小尺寸和拖拽预览也使用同一幅图形。
export function CollectionFileIcon({ kind = "folder", open = false, className = "" }) {
  const artwork = kind === "collection" ? <>
    <path fill="currentColor" d="m13 8 35-1.1 3.2 2.8-.8 44.5-3.1 2.1-35.7-1.2-2.1-3.4.8-39.8Z" />
    <path className="file-paper" d="m18 11.1 29.5-.8-.5 37.8-29.5 1.1Z" />
    <path className="file-paper" d="m14.3 13.7 1.1-.1-.7 36.6 31.8 1.4-.1 2-32.9-1.8Z" />
    <path className="file-accent" d="m35.4 10.4 7.5-.2-.3 17.6-3.4-3-4.1 3.6Z" />
    <path fill="currentColor" d="m23 36.5 14.1-.5-.1 1.6-14.3.5Zm.2 5 17-.6-.1 1.3-17.1.6Z" />
  </> : kind === "article" ? <>
    <path fill="currentColor" d="m14.3 6.6 27.4.7 11 12.4-.9 36.5-2.1 1.3-36.2-1.3-.8-2.8.7-44.7Z" />
    <path className="file-paper" d="m17.1 10 22.5.2.1 13.2 10.2-.2-.9 30.6-32.4-.9Z" />
    <path className="file-accent" d="m42 10.2 8.3 10.4-8.3-.1Z" />
    <path fill="currentColor" d="m22 27.6 19.7.3-.2 2.5-19.8-.5Zm.2 7.3 22.2.2-.3 1.8-22.1-.1Zm-.2 6.4 17 .2-.2 1.5-17-.2Z" />
    <path className="file-paper" d="m14.4 20.2.8-1.4-.3 9-.8 1.4Zm15 34.6 8.5.3-.6.7-7.2-.2Z" />
  </> : kind === "note" ? <>
    <path fill="currentColor" d="m12.8 15.6 38.9-2.7 1.9 2.2 1.1 36.6-6.4-1.6-5 2.7-5.3-1.9-5.4 2.6-5.5-2.1-5.4 2.7-7.2-1.7-1.2-3.1-.2-31.6Z" />
    <path className="file-paper" d="m16.3 18.5 32.8-2.1 2 31.4-3.3-1-4.7 2.6-5.4-1.8-5.5 2.5-5.4-2.1-5.4 2.6-5.6-1.2Z" />
    <path className="file-accent" d="M23.1 8.5c-4.8.2-5.9 3.8-5.7 8l.6 8.2c.2 3.7 2.2 5.1 4.6 4.9 3-.1 4.5-2.1 4.2-5.3l-.4-7.5-2.2.2.4 7.4c.2 2.1-.6 2.8-1.9 2.9-1.2.1-2-.5-2.1-2.8l-.6-8c-.2-3.1.5-5.5 3.3-5.6 2.6-.1 3.9 1.6 4 4.3l.1 2.9 2.5-.2-.1-2.9c-.2-4.3-2.8-6.7-6.7-6.5Z" />
    <path fill="currentColor" d="m23.9 34.1 20.2-1.4.2 2-20.1 1.1Zm.4 6.5 14.4-.9.2 1.7-14.5 1Z" />
    <path className="file-paper" d="m13.4 29.6 1-.9.1 9.4-.7 1.2Z" />
  </> : <>
    <path fill="currentColor" d="M8.1 14.8 9 11l16.2-.3 6.2 5.2 22-.4 2.7 2.1-.1 32.5-3.4 2.6-44.7-.6-1.3-3.5.5-31.9Z" />
    <path className="file-paper" d="m11.4 14.2 12.6-.3 6.4 5.3 22.3-.5-.4 28.5-41.8.7Z" />
    <path fill="currentColor" d="m17.2 19.1 31.9-.9 1.1 23.1-33.6 1.4Z" />
    <path className="file-paper" d="m19.2 21.3 27.7-.8.6 19-28.9 1.1Z" />
    <path className="file-accent" d="m37.8 18.2 7.2-.2.4 13.6-3.8-2.6-3.4 2.9Z" />
    {open ? <>
      <path fill="currentColor" d="m2.8 29.4 53.7-2.2 3.9 3.2-6.1 22.8-47.5-.4-2.1-3.1Z" />
      <path className="file-paper" d="m6.6 32.3 49.6-1.7-4.7 19.7-41.9-.1Z" />
      <path fill="currentColor" d="m13.3 44.2 11.4-.2-.1 1.6-11.1.1Z" />
    </> : <>
      <path fill="currentColor" d="m4.1 25.8 53.7-1.4 2.1 2.8-4.8 25.9-47.5-.4-2.1-3.1Z" />
      <path className="file-paper" d="m7.6 29.2 48.5-1.5-3.7 22.6-41.9-.1Z" />
      <path fill="currentColor" d="m14 42.7 11.7-.2-.2 1.7-11.5.1Z" />
    </>}
    <path className="file-paper" d="m6.1 34.8.9-.3.6 8.3-.7 1.1Zm29.8 16.6 10.3.1-.9.7-8.9-.1Z" />
  </>;

  return <svg className={`collection-file-icon collection-file-icon-${kind}${open ? " is-open" : ""} ${className}`} viewBox="0 0 64 64" width="64" height="64" fill="none" aria-hidden="true" focusable="false">{artwork}</svg>;
}
