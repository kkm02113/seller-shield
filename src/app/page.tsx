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
          Authentication, integrations, and product workflows are intentionally
          not implemented in this foundation slice.
        </p>
        <a href="/api/health">View process health</a>
      </section>
    </main>
  );
}
