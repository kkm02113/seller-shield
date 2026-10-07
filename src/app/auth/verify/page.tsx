import { ConfirmationForm } from "./confirmation-form";

// Public and non-consuming. No auth, token query parsing or DB read on this GET.
export default function VerifyPage() {
  return <main className="shell" lang="ko"><section className="panel auth-panel">
    <p className="eyebrow">Seller Shield</p><h1>로그인을 확인해주세요</h1>
    <ConfirmationForm /><a href="/sign-in">새 로그인 링크 요청</a>
  </section></main>;
}
