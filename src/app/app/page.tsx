import { requireOnboardedUser } from "../../platform/auth/session";
import { SignOutButton } from "./sign-out-button";

export const dynamic = "force-dynamic";
export default async function AccountPage() {
  const user = await requireOnboardedUser();
  return <main className="shell" lang="ko"><section className="panel auth-panel">
    <p className="eyebrow">Seller Shield · 인증 완료</p><h1>로그인했습니다</h1>
    <p>{user.name}님, 환영합니다.</p><p>{user.email}</p>
    <p>현재는 계정 인증만 제공합니다. 판매자 조직, 권한, 사건 기능은 아직 구현되지 않았습니다.</p>
    <SignOutButton />
  </section></main>;
}
