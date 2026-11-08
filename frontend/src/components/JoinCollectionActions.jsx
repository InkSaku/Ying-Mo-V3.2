import { useEffect, useState } from "react";
import { api } from "../lib/api";

// 新人引导第二期：合集创建者把新朋友加进自己的合集。options 来自后端（只含当前成员创建的合集），
// 每个合集一个文字按钮；加入成功后就地变成“已在《合集》”，重复点击由后端保证只保留一条成员关系。
export function JoinCollectionActions({ member, options = [], className = "" }) {
  const [items, setItems] = useState(options);
  const [busyId, setBusyId] = useState(null);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  useEffect(() => { setItems(options); }, [options]);

  if (!member?.id || !items.length) return null;
  const name = member.nickname || member.username;

  const add = async (collection) => {
    setBusyId(collection.id);
    setStatus("");
    setError("");
    try {
      await api.post(`/collections/${collection.id}/members/${member.id}`, {});
      setItems((current) => current.map((item) => (item.id === collection.id ? { ...item, is_member: true } : item)));
      setStatus(`已把${name}加进《${collection.name}》。`);
    } catch (addError) {
      setError(`没有加进《${collection.name}》：${addError.message}`);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className={`join-collection-actions ${className}`.trim()}>
      <ul aria-label={`把${name}加进你的合集`}>
        {items.map((collection) => (
          <li key={collection.id}>
            {collection.is_member
              ? <span className="join-collection-done">已在《{collection.name}》</span>
              : <button type="button" className="text-button" disabled={busyId !== null} onClick={() => void add(collection)}>
                {busyId === collection.id ? "正在加入…" : `加进《${collection.name}》`}
              </button>}
          </li>
        ))}
      </ul>
      {status ? <p className="join-collection-status" role="status">{status}</p> : null}
      {error ? <p className="join-collection-error" role="alert">{error}</p> : null}
    </div>
  );
}
