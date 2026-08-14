const API_BASE = (import.meta.env.VITE_API_BASE_URL || "/api/v1").replace(/\/$/, "");

let accessToken = null;
let refreshPromise = null;
const authInvalidationListeners = new Set();

export class ApiError extends Error {
  constructor(message, { status = 0, code = "NETWORK_ERROR", details = null, requestId = null } = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
    this.requestId = requestId;
  }
}

export function getAccessToken() {
  return accessToken;
}

export function setAccessToken(token) {
  accessToken = token || null;
}

export function subscribeAuthInvalidated(listener) {
  authInvalidationListeners.add(listener);
  return () => authInvalidationListeners.delete(listener);
}

export function clearLocalAccess(reason = "SESSION_ENDED") {
  const hadToken = Boolean(accessToken);
  accessToken = null;
  if (hadToken || reason !== "BOOTSTRAP_ANONYMOUS") {
    authInvalidationListeners.forEach((listener) => listener(reason));
  }
}

export function fieldErrorsFrom(error) {
  const rows = Array.isArray(error?.details) ? error.details : [];
  return rows.reduce((result, item) => {
    if (item && typeof item.field === "string" && typeof item.message === "string") {
      result[item.field] = item.message;
    }
    return result;
  }, {});
}

function readCookie(name) {
  if (typeof document === "undefined") return "";
  const prefix = `${encodeURIComponent(name)}=`;
  const item = document.cookie.split("; ").find((part) => part.startsWith(prefix));
  return item ? decodeURIComponent(item.slice(prefix.length)) : "";
}

function authPath(path) {
  return ["/auth/login", "/auth/register", "/auth/refresh", "/auth/logout"].includes(path);
}

function requestUrl(path) {
  if (path.startsWith("/api/")) {
    return API_BASE.startsWith("http") ? new URL(path, API_BASE).toString() : path;
  }
  return `${API_BASE}${path}`;
}

function shouldTryRefresh(responseStatus, code, path) {
  if (responseStatus !== 401 || authPath(path)) return false;
  return ["AUTHENTICATION_REQUIRED", "TOKEN_EXPIRED", "INVALID_TOKEN", "TOKEN_REVOKED"].includes(code);
}

async function parseJsonResponse(response) {
  const type = response.headers.get("content-type") || "";
  if (type.includes("application/json")) {
    return response.json();
  }
  if (response.redirected) {
    const url = new URL(response.url, window.location.origin);
    return {
      ok: true,
      data: { redirect: true, canonical: `${url.pathname}${url.search}${url.hash}` },
    };
  }
  throw new ApiError("服务器返回了无法识别的响应。", {
    status: response.status,
    code: "UNEXPECTED_RESPONSE",
  });
}

async function errorPayload(response) {
  const type = response.headers.get("content-type") || "";
  if (!type.includes("application/json")) return null;
  try {
    return await response.json();
  } catch {
    return null;
  }
}

async function execute(path, options = {}, retry = true, responseType = "json") {
  const headers = new Headers(options.headers || {});
  const hasBody = options.body !== undefined && options.body !== null;
  const isFormData = typeof FormData !== "undefined" && options.body instanceof FormData;

  if (hasBody && !isFormData && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  if (accessToken && options.auth !== false) {
    headers.set("Authorization", `Bearer ${accessToken}`);
  }

  let response;
  try {
    response = await fetch(requestUrl(path), {
      ...options,
      headers,
      credentials: "include",
      body: hasBody && !isFormData && typeof options.body !== "string"
        ? JSON.stringify(options.body)
        : options.body,
    });
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new ApiError("请求已取消。", { code: "REQUEST_ABORTED" });
    }
    throw new ApiError("无法连接服务器，请检查网络或稍后重试。", { code: "NETWORK_ERROR" });
  }

  if (responseType === "blob" && response.ok) {
    return {
      data: await response.blob(),
      meta: null,
      requestId: response.headers.get("X-Request-ID"),
    };
  }

  const payload = responseType === "blob"
    ? await errorPayload(response)
    : await parseJsonResponse(response);

  if (!response.ok || payload?.ok === false) {
    const error = payload?.error || {};
    if (retry && shouldTryRefresh(response.status, error.code, path)) {
      const refreshed = await refreshAccessToken();
      if (refreshed) return execute(path, options, false, responseType);
    }
    throw new ApiError(error.message || `请求失败（${response.status}）`, {
      status: response.status,
      code: error.code || "HTTP_ERROR",
      details: error.details,
      requestId: payload?.request_id || response.headers.get("X-Request-ID") || null,
    });
  }

  return {
    data: payload?.data ?? null,
    meta: payload?.meta ?? null,
    requestId: payload?.request_id ?? null,
  };
}

export async function refreshAccessToken() {
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    const csrf = readCookie("csrf_refresh_token");
    const headers = {};
    if (csrf) headers["X-CSRF-TOKEN"] = csrf;

    try {
      const response = await fetch(`${API_BASE}/auth/refresh`, {
        method: "POST",
        credentials: "include",
        headers,
      });
      const payload = await errorPayload(response);
      if (!response.ok || !payload?.ok || !payload?.data?.access_token) {
        clearLocalAccess("REFRESH_FAILED");
        return null;
      }
      setAccessToken(payload.data.access_token);
      return payload.data;
    } catch {
      clearLocalAccess("REFRESH_FAILED");
      return null;
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

export async function logoutRequest() {
  const csrf = readCookie("csrf_refresh_token");
  const headers = {};
  if (csrf) headers["X-CSRF-TOKEN"] = csrf;
  try {
    await fetch(`${API_BASE}/auth/logout`, {
      method: "POST",
      credentials: "include",
      headers,
    });
  } finally {
    clearLocalAccess("LOGOUT");
  }
}

export const api = {
  get(path, options = {}) {
    return execute(path, { method: "GET", ...options });
  },
  blob(path, options = {}) {
    return execute(path, { method: "GET", ...options }, true, "blob");
  },
  post(path, body, options = {}) {
    return execute(path, { method: "POST", body, ...options });
  },
  patch(path, body, options = {}) {
    return execute(path, { method: "PATCH", body, ...options });
  },
  put(path, body, options = {}) {
    return execute(path, { method: "PUT", body, ...options });
  },
  delete(path, options = {}) {
    return execute(path, { method: "DELETE", ...options });
  },
  authPost(path, body) {
    return execute(path, { method: "POST", body, auth: false }, false);
  },
};

export { API_BASE };
