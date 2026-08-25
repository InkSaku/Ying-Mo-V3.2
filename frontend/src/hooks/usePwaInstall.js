import { useEffect, useState } from "react";
import {
  getPwaInstallSnapshot,
  requestPwaInstall,
  subscribePwaInstall,
} from "../lib/pwaInstall";

export function usePwaInstall() {
  const [state, setState] = useState(() => getPwaInstallSnapshot());

  useEffect(() => subscribePwaInstall(setState), []);

  return {
    ...state,
    requestInstall: requestPwaInstall,
  };
}
