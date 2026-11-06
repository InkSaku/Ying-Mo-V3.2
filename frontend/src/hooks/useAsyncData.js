import { useCallback, useEffect, useRef, useState } from "react";

export function useAsyncData(loader, dependencies = []) {
  const [state, setState] = useState({ data: null, meta: null, loading: true, error: null });
  const sequence = useRef(0);
  const latestLoad = useRef(null);
  const active = useRef(true);

  const load = useCallback(async () => {
    // A completed mutation may still hold the reload from the previous page.
    if (!active.current || latestLoad.current !== load) return null;
    const request = ++sequence.current;
    setState((current) => ({ ...current, owner: load, loading: true, error: null }));
    try {
      const result = await loader();
      if (!active.current || latestLoad.current !== load || request !== sequence.current) return null;
      setState({ owner: load, data: result.data, meta: result.meta, loading: false, error: null });
      return result;
    } catch (error) {
      if (!active.current || latestLoad.current !== load || request !== sequence.current) return null;
      setState({ owner: load, data: null, meta: null, loading: false, error });
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

  return state.owner === load ? { ...state, reload: load }
    : { data: null, meta: null, loading: true, error: null, reload: load };
}
