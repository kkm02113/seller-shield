"use client";

import { useState, type FormEvent } from "react";

import { authClient } from "../../platform/auth/client";
import { parseName } from "../../platform/auth/validation";

export function OnboardingForm() {
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    let validated;
    try { validated = parseName(name); }
    catch { setError("이름은 공백을 제외하고 1~80자로 입력해주세요."); return; }
    setError(""); setBusy(true);
    try {
      const result = await authClient.updateUser({ name: validated });
      if (result.error) { setError("이름을 저장하지 못했습니다. 다시 시도해주세요."); return; }
      window.location.assign("/app");
    } catch { setError("이름을 저장하지 못했습니다. 다시 시도해주세요."); }
    finally { setBusy(false); }
  }

  return <form onSubmit={submit} noValidate className="auth-form">
    <label htmlFor="onboarding-name">이름</label>
    <input id="onboarding-name" autoComplete="name" required value={name}
      disabled={busy} onChange={(event) => setName(event.target.value)} />
    {error && <p role="alert" className="auth-error">{error}</p>}
    <button type="submit" disabled={busy}>{busy ? "저장 중…" : "이름 저장하고 계속"}</button>
  </form>;
}
