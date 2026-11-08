import { useCallback, useEffect, useRef, useState } from "react";

// keepPrevious：切换筛选、翻页或操作后重新读取时，继续显示上一次的数据（loading 仍为 true），
// 页面只在首次加载时出现骨架屏，避免整页闪白、焦点丢失和滚动跳回顶部。
// 传 true 表示同一个列表；传一个键（例如合集 slug）时，只有键相同才沿用旧数据，
// 换到另一个对象时仍按首次加载处理，不会把上一个对象的内容显示在新标题下。
export function useAsyncData(loader, dependencies = [], { keepPrevious = false } = {}) {
  const [state, setState] = useState({ data: null, meta: null, loading: true, error: null });
  const sequence = useRef(0);
  const latestLoad = useRef(null);
  const active = useRef(true);
  const keepKey = keepPrevious === false ? null : keepPrevious === true ? "same" : `key:${String(keepPrevious)}`;
  const keepKeyRef = useRef(keepKey);
  keepKeyRef.current = keepKey;

  const load = useCallback(async () => {
    // A completed mutation may still hold the reload from the previous page.
    if (!active.current || latestLoad.current !== load) return null;
    const request = ++sequence.current;
    const key = keepKeyRef.current;
    setState((current) => {
      // 未开启 keepPrevious 的调用方保持原有行为；开启时，换了键就不沿用旧数据。
      const reuse = key === null || current.keepKey === key;
      return { ...current, data: reuse ? current.data : null, meta: reuse ? current.meta : null, owner: load, keepKey: key, loading: true, error: null };
    });
    try {
      const result = await loader();
      if (!active.current || latestLoad.current !== load || request !== sequence.current) return null;
      setState({ owner: load, keepKey: key, data: result.data, meta: result.meta, loading: false, error: null });
      return result;
    } catch (error) {
      if (!active.current || latestLoad.current !== load || request !== sequence.current) return null;
      setState({ owner: load, keepKey: key, data: null, meta: null, loading: false, error });
      return null;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, dependencies);
  latestLoad.current = load;

  useEffect(() => {
    active.current = true;
    load();
    return () => { active.current = false; sequence.current += 1; };
  }, [load]);

  if (state.owner === load) return { ...state, reload: load };
  // 依赖刚变化、新请求还没发出的这一帧：同一个键下继续显示旧数据。
  if (keepKey !== null && state.keepKey === keepKey && state.data != null) {
    return { ...state, loading: true, error: null, reload: load };
  }
  return { data: null, meta: null, loading: true, error: null, reload: load };
}
