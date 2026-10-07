"use client";

import { useState, type FormEvent } from "react";

import { verificationDestination } from "../../../platform/auth/magic-link";

export function ConfirmationForm() {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  function confirm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    try {
      // Reading/navigating happens only here, never on mount or in an effect.
      const destination = verificationDestination(window.location.hash);
      setBusy(true);
      window.history.replaceState(null, "", "/auth/verify");
      window.location.assign(destination);
    } catch { setError("로그인 링크를 확인할 수 없습니다."); }
  }

  return <form onSubmit={confirm} className="auth-form">
    <p>계속하면 이 링크가 발급된 이메일 계정으로 로그인합니다.</p>
    {error && <p role="alert" className="auth-error">{error}</p>}
    <button type="submit" disabled={busy}>{busy ? "로그인 확인 중…" : "로그인 계속"}</button>
    <noscript>로그인 확인에는 자바스크립트가 필요합니다. 활성화한 뒤 메일 링크를 다시 열어주세요.</noscript>
  </form>;
}
