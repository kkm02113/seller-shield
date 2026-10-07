"use client";

import { useEffect, useState, type FormEvent } from "react";

import { authClient } from "../../platform/auth/client";
import { parseMagicLinkBody } from "../../platform/auth/validation";

export function SignInForm() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  const [deadline, setDeadline] = useState(0);
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    if (!deadline) return;
    const timer = window.setInterval(() => {
      const remaining = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      setSeconds(remaining);
      if (remaining === 0) window.clearInterval(timer);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [deadline]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || seconds > 0) return;
    setError(""); setSent(false);
    let validated;
    try { validated = parseMagicLinkBody({ email }); }
    catch { setError("올바른 이메일 주소를 입력해주세요."); return; }
    setBusy(true);
    try {
      const result = await authClient.signIn.magicLink({ email: validated.email });
      if (result.error) {
        if (result.error.status === 429) {
          setDeadline(Date.now() + 60_000); setSeconds(60);
          setError("요청이 많습니다. 잠시 후 다시 시도해주세요.");
        } else setError("메일을 보내지 못했습니다. 잠시 후 다시 시도해주세요.");
        return;
      }
      setSent(true); setDeadline(Date.now() + 60_000); setSeconds(60);
    } catch { setError("메일을 보내지 못했습니다. 잠시 후 다시 시도해주세요."); }
    finally { setBusy(false); }
  }

  return <form onSubmit={submit} noValidate className="auth-form">
    <label htmlFor="sign-in-email">이메일</label>
    <input id="sign-in-email" type="email" autoComplete="email" required value={email}
      disabled={busy} onChange={(event) => setEmail(event.target.value)} />
    {error && <p role="alert" className="auth-error">{error}</p>}
    {sent && <p role="status">로그인 메일 발송 요청을 접수했습니다. 받은편지함과 스팸함을 확인해주세요.</p>}
    <button type="submit" disabled={busy || seconds > 0}>
      {busy ? "발송 요청 중…" : seconds > 0 ? `${seconds}초 후 재전송` : "로그인 링크 받기"}
    </button>
    <p className="auth-note">링크는 5분 동안 한 번 사용할 수 있습니다. 비밀번호는 필요하지 않습니다.</p>
  </form>;
}
