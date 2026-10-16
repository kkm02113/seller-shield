# Seller Shield · 셀러방패

> 반품·클레임 대응을 위한, 증거 중심의 셀러 워크스페이스.

국내 온라인 셀러가 흩어진 증거와 정책 근거를 정리하고, 사람이 검토할 수 있는
대응 자료를 만들도록 돕는 제품을 개발하고 있습니다.
설계의 중심은 **증거 우선, 사례 단위 분석, 사람의 최종 검토**입니다.

[현재 상태](#현재-상태) · [빠른 시작](#빠른-시작) · [개발 명령어](#개발-명령어) · [문서](#문서)

## 현재 상태

현재는 DB·이메일 인증과 테넌트 권한 기반을 workspace 생성·선택 화면에 연결한 단계입니다.

| 단계 | 구현 범위 | 상태 |
| --- | --- | --- |
| Slice 0 | Next.js 개발용 셸, 프로세스 헬스체크 | 구현·로컬 검증 완료 |
| Slice 1A | PostgreSQL 연결, Drizzle 설정, migration 기반 | 구현·로컬 검증 완료 |
| Slice 1B-1 | Better Auth 핵심 테이블, DB 세션, 런타임 CRUD 권한 | 구현·로컬 검증 완료 |
| Slice 1B-2 | Magic Link, 확인 화면, 이름 입력, 세션·로그아웃 | 구현·캡처 메일/실DB/Edge 검증; 실제 메일 발송 미검증 |
| Slice 1C-1 | Tenant/Membership 스키마·제약조건·ENABLE/FORCE RLS | APPROVED — local/test; 실DB·기본 build 검증 완료 |
| Slice 1C-2 | RLS 허용 정책, 세션 기반 transaction context, 제한된 workspace 서버 서비스 | APPROVED — local/test; baseline `13262fc` |
| Slice 1C-3 | workspace 생성·선택, 서버 재검증, workspace 기반 `/app` | 구현·로컬 회귀 검증 완료; 독립 리뷰 1회 차단 지적 없음 |
| Slice 1D-1 | Case·원본 Snapshot·Timeline 저장 기반, 제약·RLS·최소 권한 | 구현·합성 데이터 실DB 검증; 서비스·화면은 미구현 |

**아직 구현하지 않은 것:** 케이스·증거 관리, AI 지원, 마켓플레이스 연동,
PDF 내보내기, 초대·멤버십 관리.
현재 홈 화면에는 케이스나 마켓플레이스 데이터가 없습니다.
인증 자체는 사용자 식별만 제공합니다. `/app`은 매 요청 ACTIVE Membership을 검증하고
사용자 이름·이메일, workspace 이름·현재 role과 로그아웃만 표시합니다.
실제 고객 운영은 [보안 문서의 미해결 승인 조건](docs/SECURITY.md#slice-1b-2-controls--implemented-local-validation)으로 차단되어 있습니다.

다음 단계와 검증 범위는 [MVP 구현 계획](docs/plans/active/0001-mvp-foundation.md)에서 확인할 수 있습니다.

## 기술 스택

| 영역 | 사용 기술 |
| --- | --- |
| 애플리케이션 | Next.js App Router · React · TypeScript |
| 데이터베이스 | PostgreSQL · Drizzle ORM · Drizzle Kit |
| 인증 기반 | Better Auth · 공식 Drizzle adapter · DB 세션 |
| 이메일 | Resend adapter · 얇은 EmailSender 경계 |
| 코드 검증 | strict TypeScript · ESLint · Vitest · React Testing Library · Playwright |

정확한 패키지 버전은 [package.json](package.json)과 [pnpm-lock.yaml](pnpm-lock.yaml)을 기준으로 합니다.

## 빠른 시작

준비 사항:

- Node.js `24.19.0` — [.node-version](.node-version)에 고정
- pnpm `11.19.0` — [package.json](package.json)에 고정
- PostgreSQL `18.6` — DB 명령어와 인증 저장 기능을 사용할 때 필요

저장소 루트에서 실행합니다.

```powershell
pnpm install --frozen-lockfile
pnpm dev
```

브라우저에서 <http://localhost:3000>을 엽니다.
현재 개발용 홈 화면과 build에는 환경 변수나 PostgreSQL이 필요하지 않습니다.

`GET /api/health`는 Next.js 프로세스 상태만 확인합니다.
DB·인증·외부 서비스의 정상 동작을 보장하는 헬스체크는 아닙니다.

## DB·인증 설정

먼저 PostgreSQL을 시작하고, [DB 문서의 역할 분리](docs/DATABASE.md#slice-1a-foundation--implemented-local-validation)에 따라
DB와 별도의 런타임·migration 계정을 준비합니다. 앱이 DB나 계정을 자동으로 생성하지는 않습니다.

`.env.local`이 없을 때만 예제 파일을 복사합니다.
이미 있다면 기존 DB 자격 증명을 유지하고 필요한 키만 추가하세요.

```powershell
if (-not (Test-Path .env.local)) {
  Copy-Item .env.example .env.local
}
```

[.env.example](.env.example)의 placeholder를 실제 로컬 설정으로 교체합니다.
아래 값은 모두 서버 전용입니다.

| 환경 변수 | 용도 |
| --- | --- |
| `DATABASE_URL` | 비소유자 런타임 계정의 PostgreSQL 연결 URL |
| `DATABASE_MIGRATION_URL` | 별도 schema-owner 계정의 migration·권한 부여용 URL |
| `BETTER_AUTH_SECRET` | 인증 요청용 랜덤 비밀키. 최소 32자이며 예제 placeholder는 사용할 수 없음 |
| `BETTER_AUTH_URL` | 인증 요청용 origin. 로컬은 `http://localhost:3000`, 배포 환경은 HTTPS |
| `RESEND_API_KEY` | 실제 메일 발송에만 필요한 서버 전용 API key |
| `AUTH_EMAIL_FROM` | Resend에서 검증한 도메인의 발신 이메일 주소 |

비밀키는 다음 명령어로 생성한 뒤 `BETTER_AUTH_SECRET`에 설정합니다.

```powershell
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"
```

설정이 끝나면 기존 setup 관리자 URL을 `DATABASE_PROVISION_URL`로 이 설정 프로세스에만
주입한 뒤 다음 순서로 실행합니다. 관리자 값을 앱 환경에 남기지 마세요.

```powershell
pnpm db:check
pnpm db:provision-tenancy --prepare
if ($LASTEXITCODE -ne 0) { throw "Tenancy preparation failed" }
try {
  pnpm db:migrate
  if ($LASTEXITCODE -ne 0) { throw "Migration failed" }
  pnpm db:grant-auth
  if ($LASTEXITCODE -ne 0) { throw "Auth grant failed" }
  pnpm db:grant-tenancy
  if ($LASTEXITCODE -ne 0) { throw "Tenancy grant failed" }
  pnpm db:grant-cases
  if ($LASTEXITCODE -ne 0) { throw "Case grant failed" }
} finally {
  pnpm db:provision-tenancy --finalize
  Remove-Item Env:DATABASE_PROVISION_URL -ErrorAction SilentlyContinue
}
```

현재 다섯 migration은 인증 테이블 5개, `tenants`, `memberships`와 Case 저장 테이블 3개를 생성합니다.
ENABLE/FORCE RLS는 유지하고, 명시적인 정책과 최소 column grant로 접근을 제한합니다.
`db:grant-auth`는 같은 DB의 별도 migration 계정으로 인증 테이블 5개의 CRUD 권한만 부여하며,
런타임 계정에 소유권·schema CREATE 권한을 주거나 계정을 생성하지 않습니다.
`db:grant-tenancy`는 SELECT, workspace 이름 변경, Membership 잠금용 column UPDATE와
bootstrap 함수 EXECUTE만 부여합니다. 함수 권한은 migrator의 임시 helper 역할로 부여하고
`--finalize`가 그 역할을 회수합니다. 런타임에는 helper 역할·일반 INSERT/DELETE를 주지 않습니다.
자세한 범위는 [테넌트 권한 문서](docs/DATABASE.md#slice-1c-2-authorization--implemented-local-validation)를 참고하세요.
`db:grant-cases`는 세 Case 테이블의 SELECT·명시적 컬럼 INSERT와 초기 Case 정규화 UPDATE만
부여합니다. 상태 전이·원본 수정·물리 삭제 권한은 주지 않습니다. 두 DB URL의 query 옵션은
거부합니다. 정확한 쓰기 계약과 범위는 [Case 저장 문서](docs/DATABASE.md#slice-1d-1-persistence--implemented-local-validation)를 참고하세요.

테넌트 실DB 테스트에는 기존 런타임·migration URL 외에 `DATABASE_TEST_ADMIN_URL`을
테스트 프로세스에 별도로 제공해야 합니다. 같은 전용 로컬/테스트 DB의 기존 setup 관리자
계정을 사용하며, 새 역할을 만들거나 RLS를 끄지 않습니다. 이 값이 없으면 테스트가 실패합니다.
관리자는 합성 fixture 준비·제약조건 검증·정리만 수행하며 런타임 접근 검증을 대신하지 않습니다.
앱/배포 환경에는 관리자 자격 증명을 제공하지 마세요.

F8 안전장치가 DB/browser 테스트의 연결 전에 대상 DB를 확인합니다. 기본적으로 DB 이름은
`*_test`여야 하고 모든 URL의 host·port·DB가 같아야 합니다. 드라이버의 대상/사용자 override를
막기 위해 테스트 DB URL의 query 옵션은 전부 거부합니다. 기존 전용 합성 로컬 DB를 사용할
때만 다음 두 값을 테스트 프로세스에 명시적으로 지정합니다. `_test` 이름이나 opt-in은
데이터가 폐기 가능하다는 자동 증명이 아닙니다. 고객 DB를 대상으로 실행하지 마세요.
두 opt-in 값은 `.env` 파일에서 읽지 않습니다. Browser 테스트의 Next 자식 서버에는
runtime URL만 유지하고 migration/provision/test-admin URL 및 opt-in을 빈 값으로 차단합니다.

```powershell
# DATABASE_URL의 실제 host/port/DB와 정확히 맞춰야 합니다.
$env:ALLOW_DESTRUCTIVE_DB_TESTS = "1"
$env:DATABASE_TEST_TARGET = "localhost:5432/seller_shield"
try { pnpm test:db } finally {
  Remove-Item Env:ALLOW_DESTRUCTIVE_DB_TESTS, Env:DATABASE_TEST_TARGET -ErrorAction SilentlyContinue
}
```

인증 handler는 `/api/auth/[...all]`에 연결되어 있습니다. `/sign-in`에서 이메일을 입력하면
메일의 `/auth/verify#token=...` 링크를 열고 **로그인 계속**을 눌러 인증합니다.
처음에는 `/onboarding`에서 이름을 입력합니다. 이후 ACTIVE Membership이 없으면
`/workspaces/new`에서 최초 workspace를 만들고, 하나면 자동 진입하며, 여러 개면
`/workspaces`에서 선택합니다. 유효한 선택 힌트가 있으면 다시 권한 확인 후 `/app`으로 진입합니다.
`current_workspace`는 ID만 담는 HttpOnly/SameSite=Lax 쿠키이며 운영 환경에서는 Secure입니다.
잘못되거나 철회된 힌트는 읽기 요청에서 무시하고, 잘못된 선택 제출은 쿠키를 지웁니다.
쿠키 자체는 권한 증명이 아닙니다. 상세 경계는 [Architecture](docs/ARCHITECTURE.md#slice-1c-3--workspace-ui-implemented-local-validation)를 참고하세요.
인증 설정이 없거나 잘못되면 일반적인 503 응답으로 실패하며 비밀값을 노출하지 않습니다.
메일 설정이 없거나 발송이 실패하면 성공으로 처리하지 않습니다.

실제 발송에는 Resend 계정·API key·발신 도메인의 SPF/DKIM 검증이 필요합니다.
도메인 생성 시 Tokyo를 선택하고 open/click tracking을 끄세요. 이 외부 설정은 아직 검증하지 않았습니다.
해외 처리·보관 정책 검토/수락 전에는 실제 고객에게 사용하지 마세요.
세부 결정과 검증 경계는 [Slice 1B-2 문서](docs/ARCHITECTURE.md#slice-1b-2--implemented-local-validation)를 따릅니다.

`.env.local`은 커밋하지 말고, migration 계정을 앱 런타임에 사용하지 마세요.
DB 명령어는 기존 프로세스 환경 변수 → `.env.local` → `.env` 순서로 값을 우선합니다.

## 개발 명령어

| 명령어 | 설명 |
| --- | --- |
| `pnpm dev` | 로컬 개발 서버 실행 |
| `pnpm build` | 기본 Turbopack production build |
| `pnpm start` | build 결과로 production 서버 실행 |
| `pnpm check` | typecheck → lint → 외부 서비스가 필요 없는 테스트 |
| `pnpm typecheck` | strict TypeScript 검사 |
| `pnpm lint` | ESLint 검사 |
| `pnpm test` | 외부 서비스가 필요 없는 테스트 |
| `pnpm test:db` | 실제 PostgreSQL 연결·adapter·세션·권한·실패 경로 검증 |
| `pnpm test:browser` | build 결과 + 실제 로컬 PostgreSQL + 테스트 캡처 메일로 인증 흐름 검증 |
| `pnpm db:generate` | Drizzle 스키마에서 검토할 SQL migration 생성. DB 연결 불필요 |
| `pnpm db:migrate` | migration 계정으로 저장소의 migration 적용 |
| `pnpm db:check` | 런타임 계정으로 실제 `SELECT 1` 실행 |
| `pnpm db:grant-auth` | 다섯 인증 기반 테이블의 런타임 CRUD 권한 부여 |
| `pnpm db:provision-tenancy --prepare/--finalize` | 설정 전용 관리자로 제한된 helper 준비·migrator 임시 역할 회수 |
| `pnpm db:grant-tenancy` | 두 tenancy 테이블의 최소 column grant와 bootstrap EXECUTE 권한 부여 |
| `pnpm db:grant-cases` | 세 Case 저장 테이블의 최소 column grant 부여; 상태 전이·삭제 제외 |

일반 코드 검증과 production build는 별도의 게이트입니다.

```powershell
pnpm check
pnpm build
```

`db:check`는 DB 연결 실패를 정상으로 처리하지 않습니다.
`test:db`도 `DATABASE_URL`이 없으면 테스트를 건너뛰지 않고 실패합니다.
기본 build 명령은 `next build`를 유지합니다. `--webpack`은 진단용 fallback이며 기본 게이트를 대체하지 않습니다.
2026-10-08에는 Windows Application Control이 native SWC를 차단하여 기본 build가 실패했습니다.
2026-10-12에는 원본과 동일 파일 복사본에서 기본 Turbopack build가 모두 통과했습니다.
OS 정책·코드·build 기본값은 변경하지 않았고, 과거 차단이 재현되지 않는 이유는 미확정입니다.
환경별 검증 기록과 승인 범위는 [MVP 구현 계획](docs/plans/active/0001-mvp-foundation.md)에 있습니다.

브라우저 검증은 로컬 HTTP `BETTER_AUTH_URL`과 migration/grant가 적용된 DB를 사용합니다.
전용 테스트 서버를 시작하므로 같은 포트의 개발 서버는 먼저 종료하세요.
Windows에서는 설치된 Edge, 다른 환경에서는 Playwright Chromium이 필요합니다.
메일 발송 POST만 테스트 프로세스의 실제 Better Auth/DB와 캡처 수신기로 처리하고,
검증·이름 변경·가드·로그아웃은 실행 중인 Next.js를 사용합니다. 실제 Resend E2E를 대체하지 않습니다.
테스트는 합성 인증 비밀값을 사용하며 메일 API key 없이 실행됩니다.

```powershell
pnpm build
pnpm test:browser
```

## 문서

README는 프로젝트의 입구이며, 상세 제품·설계·보안 지식의 기준은 [docs/](docs/README.md)입니다.

| 문서 | 내용 |
| --- | --- |
| [제품](docs/PRODUCT.md) | 목표 사용자, 제품 방향, MVP 범위 |
| [아키텍처](docs/ARCHITECTURE.md) | 시스템 경계, 구현 상태, 기술 결정 |
| [데이터베이스](docs/DATABASE.md) | 테이블 설계, migration, DB 역할과 권한 |
| [보안](docs/SECURITY.md) | 인증, 개인정보, 테넌트 격리 등 보안 기준 |
| [MVP 구현 계획](docs/plans/active/0001-mvp-foundation.md) | 단계별 범위, 검증 기록, 남은 결정 |
| [문서 전체 보기](docs/README.md) | 도메인 문서, 데이터 모델, ADR, Codex 템플릿 |

Codex 작업 지침은 [AGENTS.md](AGENTS.md)를 따릅니다.
