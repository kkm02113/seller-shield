"use client";

import { useState } from "react";

import { authClient } from "../../platform/auth/client";

export function SignOutButton() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function signOut() {
    if (busy) return;
    setBusy(true); setError("");
    try {
      const result = await authClient.signOut();
      if (result.error) { setError("로그아웃하지 못했습니다. 다시 시도해주세요."); return; }
      window.location.assign("/sign-in");
    } catch { setError("로그아웃하지 못했습니다. 다시 시도해주세요."); }
    finally { setBusy(false); }
  }
  return <div className="auth-form">
    <button type="button" disabled={busy} onClick={signOut}>{busy ? "로그아웃 중…" : "로그아웃"}</button>
    {error && <p role="alert" className="auth-error">{error}</p>}
  </div>;
}
