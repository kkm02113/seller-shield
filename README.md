# Seller Shield · 셀러방패

> 반품·클레임 대응을 위한, 증거 중심의 셀러 워크스페이스.

국내 온라인 셀러가 흩어진 증거와 정책 근거를 정리하고, 사람이 검토할 수 있는
대응 자료를 만들도록 돕는 제품을 개발하고 있습니다.
설계의 중심은 **증거 우선, 사례 단위 분석, 사람의 최종 검토**입니다.

[현재 상태](#현재-상태) · [빠른 시작](#빠른-시작) · [개발 명령어](#개발-명령어) · [문서](#문서)

## 현재 상태

현재는 MVP의 개발·DB 기반과 이메일 인증 흐름까지 로컬 검증한 단계입니다.

| 단계 | 구현 범위 | 상태 |
| --- | --- | --- |
| Slice 0 | Next.js 개발용 셸, 프로세스 헬스체크 | 구현·로컬 검증 완료 |
| Slice 1A | PostgreSQL 연결, Drizzle 설정, migration 기반 | 구현·로컬 검증 완료 |
| Slice 1B-1 | Better Auth 핵심 테이블, DB 세션, 런타임 CRUD 권한 | 구현·로컬 검증 완료 |
| Slice 1B-2 | Magic Link, 확인 화면, 이름 입력, 세션·로그아웃 | 구현·캡처 메일/실DB/Edge 검증; 실제 메일 발송 미검증 |

**아직 구현하지 않은 것:** Tenant/Membership·RLS,
케이스·증거 관리, AI 지원, 마켓플레이스 연동, PDF 내보내기.
현재 홈 화면에는 케이스나 마켓플레이스 데이터가 없습니다.
인증은 사용자 식별만 제공합니다. 판매자 조직의 권한이나 테넌트 격리는 아직 없습니다.
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

설정이 끝나면 DB 게이트를 실행합니다.

```powershell
pnpm db:check
pnpm db:migrate
pnpm db:grant-auth
pnpm test:db
```

현재 두 migration은 `users`, `accounts`, `sessions`, `verifications`와 공식 제한 저장용
`rate_limits`만 생성합니다. 제품 도메인 테이블은 없습니다.
`db:grant-auth`는 같은 DB의 별도 migration 계정으로 이 테이블들의 CRUD 권한만 부여하며,
런타임 계정에 소유권·schema CREATE 권한을 주거나 계정을 생성하지 않습니다.
자세한 범위는 [인증 DB 기반 문서](docs/DATABASE.md#slice-1b-1-foundation--implemented-local-validation)를 참고하세요.

인증 handler는 `/api/auth/[...all]`에 연결되어 있습니다. `/sign-in`에서 이메일을 입력하면
메일의 `/auth/verify#token=...` 링크를 열고 **로그인 계속**을 눌러 인증합니다.
처음에는 `/onboarding`에서 이름을 입력하고 `/app`에 진입합니다. `/app`은 인증 확인용 화면입니다.
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

일반 코드 검증과 production build는 별도의 게이트입니다.

```powershell
pnpm check
pnpm build
```

`db:check`는 DB 연결 실패를 정상으로 처리하지 않습니다.
`test:db`도 `DATABASE_URL`이 없으면 테스트를 건너뛰지 않고 실패합니다.
기본 build 명령은 `next build`를 유지합니다. `--webpack`은 진단용 fallback이며 기본 게이트를 대체하지 않습니다.
환경별 검증 기록은 [Slice 1B-1 기록](docs/plans/active/0001-mvp-foundation.md#slice-1b-1--better-auth-persistence-foundation)에 있습니다.

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
