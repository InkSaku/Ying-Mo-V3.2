import { Fragment } from "react";
import { Link } from "react-router-dom";
import { collectionFolderHref } from "../lib/collectionFolders";

// 内容所在位置：合集 / 目录 / 子目录。无权查看目录时后端返回空路径，只显示合集名。
export function CollectionPathTags({ post }) {
  if (!post.collection) return null;
  const { slug, name } = post.collection;
  return <>
    <Link className="tag" to={collectionFolderHref(slug)}>{name}</Link>
    {(post.collection_path || []).map((folder) => <Fragment key={folder.id}>
      <span aria-hidden="true">/</span>
      <Link className="tag" to={collectionFolderHref(slug, folder.id)}>{folder.name}</Link>
    </Fragment>)}
  </>;
}
