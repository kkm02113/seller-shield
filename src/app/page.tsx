import Link from "next/link";

export default function HomePage() {
  return (
    <main className="shell">
      <section className="panel" aria-labelledby="product-title">
        <p className="eyebrow">MVP development shell</p>
        <h1 id="product-title">
          Seller Shield <span lang="ko">셀러방패</span>
        </h1>
        <p className="status">No cases or marketplace data are available yet.</p>
        <p>
          Email sign-in and workspaces are available for development verification.
          Case workflows and marketplace integrations are not implemented yet.
        </p>
        <a href="/api/health">View process health</a>
        <p><Link href="/sign-in">이메일 로그인 검증</Link></p>
      </section>
    </main>
  );
}
