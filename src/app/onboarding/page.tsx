import { redirect } from "next/navigation";

import { requireUser } from "../../platform/auth/session";
import { OnboardingForm } from "./onboarding-form";

export const dynamic = "force-dynamic";
export default async function OnboardingPage() {
  const user = await requireUser();
  if (user.name.trim() !== "") redirect("/app");
  return <main className="shell" lang="ko"><section className="panel auth-panel">
    <p className="eyebrow">Seller Shield</p><h1>이름을 알려주세요</h1>
    <p>이메일 인증을 완료했습니다. 사용할 이름을 입력해주세요.</p>
    <OnboardingForm />
    <p className="auth-note">이름 등록은 판매자 조직 가입이나 권한 부여가 아닙니다.</p>
  </section></main>;
}
