import { useCallback, useEffect, useState } from "react";

export function useAsyncData(loader, dependencies = []) {
  const [state, setState] = useState({ data: null, meta: null, loading: true, error: null });

  const load = useCallback(async () => {
    setState((current) => ({ ...current, loading: true, error: null }));
    try {
      const result = await loader();
      setState({ data: result.data, meta: result.meta, loading: false, error: null });
      return result;
    } catch (error) {
      setState({ data: null, meta: null, loading: false, error });
      return null;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, dependencies);

  useEffect(() => {
    load();
  }, [load]);

  return { ...state, reload: load };
}
