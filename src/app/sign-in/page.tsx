import Link from "next/link";

import { SignInForm } from "./sign-in-form";

export default async function SignInPage({ searchParams }: {
  searchParams?: Promise<{ error?: string | string[] }>;
}) {
  const error = (await searchParams)?.error;
  return <main className="shell" lang="ko"><section className="panel auth-panel">
    <p className="eyebrow">Seller Shield · 인증 검증</p><h1>이메일로 로그인</h1>
    {error && <p role="alert" className="auth-error">
      {error === "INVALID_TOKEN" ? "만료되었거나 이미 사용한 링크입니다. 로그인 링크를 다시 요청해주세요."
        : "로그인을 완료하지 못했습니다. 로그인 링크를 다시 요청해주세요."}
    </p>}
    <SignInForm />
    <p className="auth-note">개발·검증용 인증 단계입니다. 판매자 조직과 사건 기능은 아직 제공하지 않습니다.</p>
    <Link href="/">프로젝트 홈</Link>
  </section></main>;
}
