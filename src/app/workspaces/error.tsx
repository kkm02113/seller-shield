"use client";
export default function WorkspaceError({ reset }: { reset: () => void }) {
  return <main className="shell" lang="ko"><section className="panel auth-panel">
    <h1>워크스페이스를 불러오지 못했습니다</h1>
    <p role="alert">일시적인 오류입니다. 잠시 후 다시 시도해주세요.</p>
    <div className="auth-form"><button type="button" onClick={reset}>다시 시도</button></div>
  </section></main>;
}
