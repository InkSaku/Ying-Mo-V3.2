export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;

export function normalizedEmail(value) {
  return typeof value === "string" ? value.trim() : "";
}

export function passwordResetRequestPayload(email) {
  return { email: normalizedEmail(email) };
}

export function passwordResetFieldErrors({ password = "", confirmPassword = "" } = {}) {
  const errors = {};
  if (!password) {
    errors.password = "请输入新密码。";
  } else if (password.length < PASSWORD_MIN_LENGTH || password.length > PASSWORD_MAX_LENGTH) {
    errors.password = `密码长度需为 ${PASSWORD_MIN_LENGTH}-${PASSWORD_MAX_LENGTH} 个字符。`;
  }
  if (!confirmPassword) {
    errors.confirmPassword = "请再次输入新密码。";
  } else if (password && confirmPassword !== password) {
    errors.confirmPassword = "两次输入的密码不一致。";
  }
  return errors;
}

export function passwordResetConfirmPayload(token, password) {
  return {
    token: typeof token === "string" ? token.trim() : "",
    password,
  };
}

export function emailVerificationConfirmPayload(token) {
  return { token: typeof token === "string" ? token.trim() : "" };
}

export function securityTokenSnapshot(location = {}) {
  const rawHash = typeof location.hash === "string" ? location.hash : "";
  const fragment = rawHash.startsWith("#") ? rawHash.slice(1) : rawHash;
  const token = new URLSearchParams(fragment).get("token")?.trim() || "";
  const pathname = typeof location.pathname === "string" && location.pathname
    ? location.pathname
    : "/";
  const rawSearch = typeof location.search === "string" ? location.search : "";
  const searchParams = new URLSearchParams(rawSearch);
  const hadQueryToken = searchParams.has("token");
  searchParams.delete("token");
  const scrubbedSearch = searchParams.toString();
  const search = hadQueryToken
    ? (scrubbedSearch ? `?${scrubbedSearch}` : "")
    : rawSearch;
  return {
    token,
    cleanUrl: `${pathname}${search}`,
    shouldReplace: Boolean(rawHash) || hadQueryToken,
  };
}

export function clearSecurityTokenFragment(location, history) {
  const snapshot = securityTokenSnapshot(location);
  if (snapshot.shouldReplace && typeof history?.replaceState === "function") {
    history.replaceState(history.state ?? null, "", snapshot.cleanUrl);
  }
  return snapshot.cleanUrl;
}

export function emailVerificationState(user) {
  if (!user || !user.email) return "unknown";
  return user.email_verified === true ? "verified" : "pending";
}

export function needsEmailVerification(user) {
  return emailVerificationState(user) === "pending";
}

export function accountActionMessage(data, fallback) {
  return typeof data?.message === "string" && data.message.trim()
    ? data.message.trim()
    : fallback;
}
