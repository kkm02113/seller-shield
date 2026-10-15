# Seller Shield 코드 검증 보고서 (Codex 작업용)

- 검증일: 2026-10-14
- 대상: 현재 작업 트리 (Slice 0, 1A, 1B-1, 1B-2, 1C-1 구현분)
- 방식: 소스 전체를 읽는 정적 검토. **어떤 명령도 실행하지 않았다** (테스트, 빌드, DB 모두 미실행).
- 형식: `docs/codex/REVIEW_TEMPLATE.md`의 "Review output" 순서(심각도 순, 위치/영향/최소 수정)를 따른다.

## 검토 범위와 한계

읽은 것: `src/**` 전부, `scripts/*`, `drizzle/*.sql`, `next.config.ts`, `drizzle*.config.ts`, `.env.example`, `.gitignore`, `package.json`, 테스트 중 `tenancy.integration`, `email`, `auth-config`, `auth-boundary`, `auth-grants`, `auth-ui`, `auth-database-negative`, `e2e/magic-link.spec`, 그리고 `docs/`의 계획/SECURITY/ADR-002/PRODUCT/domain/claims.

읽지 않은 것: `auth-adapter.integration.test.ts`와 `magic-link.integration.test.ts`의 대부분, `auth-schema`/`tenancy-schema` 테스트, `DATABASE.md`, `DATA_MODEL.md`, vitest/playwright/tsconfig/eslint 설정, `pnpm-workspace.yaml`.

검증하지 못한 것: 의존성 버전(better-auth 1.7.7, resend 6.32.0, vitest 5.0.2 등)의 실제 존재/동작. 아래 Better Auth 관련 옵션 이름은 **설치된 1.7.7의 타입/문서로 반드시 재확인**할 것.

---

## 발견 사항 (심각도 순)

### F1. [높음] 로그인 메일 요청 제한이 클라이언트가 조작 가능한 값에 묶여 있고, 수신자별 제한이 없다

- 위치: `src/platform/auth/factory.ts` (`rateLimit`, `magicLink({ rateLimit })`), `tests/magic-link.integration.test.ts:31,140-143`, `tests/e2e/magic-link.spec.ts:22`
- 근거: 테스트가 임의의 `x-forwarded-for` 값을 직접 넣고, 제한 키가 `${ip}|/sign-in/magic-link`로 `rate_limits`에 저장되는 것을 단언한다. 즉 요청자가 헤더만 바꾸면 키가 바뀐다. `factory.ts`에는 신뢰 프록시/IP 헤더 설정이 없다. 수신자(이메일)별 제한은 진행 기록에 "deferred"로만 남아 있다. 화면의 60초 쿨다운은 클라이언트 코드일 뿐이다.
- 영향: 공개 배포 시 임의 주소로 메일을 대량 발송할 수 있다. Resend 비용, 발신 도메인 평판, 제3자 스팸 문제가 생긴다.
- 최소 수정:
  1. 배포 토폴로지에 맞춰 Better Auth의 IP 판별 설정(`advanced.ipAddress` 계열)을 명시한다. 신뢰하는 프록시가 덧붙인 헤더만 쓰도록 한다. (옵션명은 1.7.7 기준으로 확인)
  2. 수신자 이메일의 정규화 해시 기준 DB 카운터를 추가한다 (예: 10분당 3회, 하루 N회). `before` 훅이나 `sendMagicLink` 직전에 검사하고, 초과해도 응답은 존재 여부를 드러내지 않게 한다.
- 수락 기준:
  - [ ] 같은 이메일로 헤더 값을 바꿔 가며 요청해도 한도 초과 후 발송이 일어나지 않는다 (테스트).
  - [ ] 응답/타이밍이 해당 이메일의 가입 여부를 구분해 주지 않는다.
  - [ ] 만료된 `rate_limits` 정리 방안이 문서나 코드에 있다 (F9 참고).

### F2. [높음] 사용자 삭제(개인정보 파기)가 스키마상 막혀 있고 정책이 없다

- 위치: `src/platform/db/schema/tenancy.ts`, `drizzle/0002_tenancy-foundation.sql` (`tenants.created_by_user_id`, `memberships.user_id`, `memberships.created_by_user_id`가 모두 `ON DELETE restrict`), `docs/SECURITY.md` (삭제 워크플로 OPEN)
- 영향: 워크스페이스를 한 번이라도 만든 사용자는 `users` 행을 지울 수 없다. 구매자 개인정보를 다루는 서비스에서 이용자 삭제 요청에 대응할 방법이 없다. 케이스/증거 테이블이 붙기 전에 정하지 않으면 마이그레이션 비용이 커진다.
- 최소 수정: 코드 변경 전에 결정부터 한다. 선택지는 (a) 사용자 익명화(이메일/이름 치환 + 세션/계정 삭제, 행은 유지), (b) 소프트 삭제 컬럼 추가다. 결정을 `docs/SECURITY.md`와 `docs/DATABASE.md`에 기록하고, 필요하면 **새 마이그레이션**으로 처리한다. 이미 적용된 `0000`~`0002`는 수정하지 않는다.
- 수락 기준:
  - [ ] 삭제/익명화 절차와 보존 대상이 문서화되어 있다.
  - [ ] 워크스페이스 생성 이력이 있는 사용자도 절차를 끝까지 수행할 수 있음을 보이는 DB 테스트가 있다.

### F3. [중간] 로그인 요청 경로의 실제 프로덕션 배선이 어떤 테스트에서도 실행되지 않는다

- 위치: `tests/e2e/magic-link.spec.ts:20-33`, `src/app/api/auth/[...all]/route.ts`, `src/platform/auth/auth.ts`
- 근거: E2E는 `/api/auth/sign-in/magic-link` POST를 `page.route`로 가로채 테스트 프로세스 안의 `createAuthentication(..., captureSender)`로 처리한다. 따라서 실제 Next 라우트 핸들러, `getAuth()`의 동적 import와 Resend 발송 배선(`requireEmailEnvironment` → `createResendEmailSender`)은 로그인 요청 흐름에서 한 번도 통과하지 않는다. (`email.test.ts`는 Resend 발송기만 단독으로 검증한다.)
- 영향: 라우트/환경변수/발송기 연결에서 생기는 오류가 배포 전까지 드러나지 않는다.
- 최소 수정: `getAuth()`가 발송기를 하드코딩하므로 테스트용 주입 지점이 필요하다. 라우트 핸들러를 직접 호출하고 전역 `fetch`를 모킹해 Resend 요청이 만들어지는지 검증하는 테스트를 추가한다. 프로덕션 코드에 테스트 전용 엔드포인트는 만들지 않는다.
- 수락 기준:
  - [ ] 실제 `route.ts`의 POST를 거쳐 Resend 요청 본문/인증 헤더가 생성됨을 단언하는 테스트가 있다.
  - [ ] 환경변수 누락 시 503 + 비밀 미노출을 라우트 수준에서 단언한다.

### F4. [중간] 보안 헤더가 일부 경로에만 걸려 있고 기본 보안 헤더가 없다

- 위치: `next.config.ts`
- 근거: `"/app"`은 정확히 `/app`만 매칭한다. 앞으로 `/app/...` 하위 경로가 생겨도 `Cache-Control: no-store`와 `Referrer-Policy`가 적용되지 않는다. CSP, `X-Frame-Options`/`frame-ancestors`, `X-Content-Type-Options`, HSTS는 어디에도 없다.
- 영향: 증거/케이스 화면이 붙으면 민감 화면이 캐시되거나 프레임에 삽입될 수 있다.
- 최소 수정: 인증이 필요한 영역은 `/app/:path*`로 바꾸고, 전역 기본 헤더(`X-Content-Type-Options: nosniff`, `frame-ancestors 'none'` 등)를 추가한다. CSP는 Next의 인라인 스크립트 요구와 충돌할 수 있으므로 별도 확인한다. HSTS는 배포 환경에서 설정한다.
- 수락 기준:
  - [ ] `/app/anything`에 `no-store`가 붙음을 확인하는 테스트가 있다.

### F5. [중간] `/update-user`가 `image` 등 이름 외 필드를 검증 없이 받을 수 있다

- 위치: `src/platform/auth/factory.ts` (`databaseHooks.user.update.before`는 `name`만 검증), `src/platform/db/schema/auth.ts` (`users.image`)
- 영향: 로그인한 사용자가 `image`에 임의 문자열/URL을 저장할 수 있다. 지금은 화면에 쓰지 않지만, 아바타를 렌더링하는 순간 추적 픽셀이나 `javascript:` 같은 값이 문제가 된다.
- 최소 수정: `before` 훅에서 `image`를 거부하거나 null로 강제한다. 허용 필드를 `name`으로 한정하는 방식이 더 안전하다. (정확한 훅 시그니처는 1.7.7로 확인)
- 수락 기준:
  - [ ] `updateUser({ image: "..." })`가 거부되거나 저장되지 않음을 보이는 DB 포함 테스트가 있다.

### F6. [중간] Resend 래퍼가 SDK 내부 구현에 의존하고, 타임아웃 전달은 테스트되지 않는다

- 위치: `src/platform/email/resend.ts`, `tests/email.test.ts`
- 근거: `RedactedResend`는 `fetchRequest`와 `baseUrl`을 재정의한다. 주석은 "공개 확장점"이라고 하지만 SDK 업그레이드 시 조용히 깨질 수 있다. `email.test.ts`는 본문과 `Authorization` 헤더는 단언하지만, `AbortSignal.timeout(10_000)`이 실제 `fetch`에 전달되는지는 단언하지 않는다 (이 파일 기준. 다른 테스트에 있는지는 확인하지 못함).
- 영향: 발송 지연 시 요청이 무기한 대기할 수 있다 (확인되지 않음).
- 최소 수정: `init.signal`이 존재하고 abort 가능한지 단언하는 테스트를 추가한다. `resend` 버전을 고정(이미 정확한 버전이 고정되어 있음)한 채, 업그레이드 시 이 테스트가 반드시 돌게 한다.
- 수락 기준:
  - [ ] `fetch` 모킹에서 `signal`이 전달되고 10초 후 abort됨을 단언한다 (fake timer 사용).

### F7. [중간] 인증 로그가 전부 가려져 운영 중 장애 진단이 불가능하다

- 위치: `src/platform/auth/factory.ts` (`logger.log`), `src/app/api/auth/[...all]/route.ts`, `src/platform/auth/session.ts`
- 근거: 모든 인증 오류가 "Authentication error; details redacted." 한 줄로 끝난다. 오류 종류, 요청 ID, 단계 구분이 없다.
- 영향: 메일 미발송, DB 오류, 설정 오류를 로그만으로 구분할 수 없다.
- 최소 수정: 고정 카테고리 코드(예: `auth.email_send_failed`, `auth.db_unavailable`, `auth.config_invalid`)와 요청 상관관계 ID만 기록한다. 이메일, 토큰, SQL 매개변수는 계속 기록하지 않는다.
- 수락 기준:
  - [ ] 오류 유형별로 서로 다른 고정 문자열이 로그에 남고, 어떤 경우에도 토큰/이메일이 나오지 않음을 보이는 테스트가 있다.

### F8. [중간] 파괴적 통합 테스트에 대상 DB 안전장치가 없다

- 위치: `tests/tenancy.integration.test.ts` (superuser `DATABASE_TEST_ADMIN_URL`), `.env.example` (DB 이름 `seller_shield`), `tests/e2e/magic-link.spec.ts`
- 근거: 세 개의 역할이 같은 DB를 가리키는지만 검사하고, 그 DB가 테스트 전용인지는 검사하지 않는다. "전용 로컬/테스트 DB"는 주석뿐이다. 슈퍼유저 계정으로 `users`, `tenants`, `memberships`를 삽입/삭제한다.
- 영향: 실수로 개발/스테이징 DB URL을 넣으면 같은 테스트가 거기서 실행된다.
- 최소 수정: DB 이름이 `*_test`로 끝나는지, 또는 명시적 `ALLOW_DESTRUCTIVE_DB_TESTS=1`이 있는지 확인하고, 아니면 테스트를 실패시킨다. `.env.example`의 DB 이름도 개발용/테스트용을 분리한다.
- 수락 기준:
  - [ ] `seller_shield` 같은 비테스트 DB 이름에서는 `pnpm test:db`가 시작 단계에서 실패한다.

### F9. [낮음] 만료 데이터 정리 작업이 없다

- 위치: `src/platform/db/schema/rate-limit.ts`, `sessions` 테이블
- 근거: `rate_limits`는 IP+경로 키로 계속 늘어난다. 만료된 `sessions`/`verifications` 정리는 Better Auth의 동작에 의존한다 (진행 기록상 verification은 조회 시 정리됨. sessions는 확인하지 못함).
- 최소 수정: 정리 책임(스크립트 또는 주기 작업)을 문서에 정하고, 필요하면 `db:cleanup-auth` 스크립트를 추가한다.

### F10. [낮음] 테넌트 모델의 불변식 보완 (Slice 1C-2 설계 때 반영)

- 위치: `src/platform/db/schema/tenancy.ts`, `drizzle/0002_tenancy-foundation.sql`
- 항목:
  - `(tenant_id, user_id)` 유니크 때문에 해지 후 재가입 시 같은 행을 재사용하게 되어 이전 `revoked_at` 이력이 사라진다. 이력이 필요하면 감사 이벤트로 남길 것.
  - 테넌트당 ACTIVE `OWNER` 최소 1명 불변식은 제약으로 막을 수 없으므로 트랜잭션 로직과 테스트가 필요하다.
  - `updated_at`은 Drizzle `$onUpdate`(앱 측)에만 의존한다. SQL 직접 수정은 갱신하지 않는다.
  - `tenants_name_check`의 `btrim`은 일반 공백만 제거하고, 앱의 `trim()`은 유니코드 공백도 제거한다. 두 규칙이 어긋난다.
  - `users.name`에는 DB 제약이 없고 앱 훅에서만 길이를 제한한다.
  - 허용 정책 도입 시 현재의 "런타임 권한 없음 확인" 테스트를 의도적으로 갱신해야 한다 (그 테스트가 실패하는 것은 정상).

### F11. [낮음] CI가 없고 기본 빌드가 한 번도 통과하지 못했다

- 위치: 저장소 루트 (CI 설정 없음), `package.json` (`check`에 build와 `test:db` 없음), `docs/plans/active/0001-mvp-foundation.md` (Windows SWC 차단 기록)
- 영향: Linux에서의 빌드/테스트 가능 여부가 미검증이다. 환경 문제와 코드 문제를 구분할 수 없다.
- 최소 수정: Linux 러너에서 `pnpm install --frozen-lockfile`, `typecheck`, `lint`, `test`, `build`를 실행하는 워크플로를 추가한다. DB가 필요한 `test:db`는 서비스 컨테이너로 별도 job으로 둔다. 기존 보안 정책(OS 통제 완화 금지)은 건드리지 않는다.

### F12. [낮음] 문서 정합성

- `docs/PRODUCT.md` (최종 수정 2026-09-28): 인증 제공자와 PDF 방식이 아직 "열려 있음"으로 적혀 있으나 ADR로 결정되었다. 구현 상태 표기도 현재 계획서와 다르다.
- 진행 기록(`.superpowers/sdd/*`)은 gitignore 대상이므로 저장소 지식으로 쓰지 않는다. 필요한 결정은 `docs/`로 옮길 것.

---

## 코드로 확인된 양호한 점 (회귀 방지용)

- 오픈 리다이렉트: `callbackURL` 3종을 서버 `before` 훅에서 고정값으로 덮어쓴다 (`validation.ts`, `factory.ts`).
- 링크 스캐너 대응: 토큰은 URL fragment에 있고 `/auth/verify` GET은 토큰을 소비하지 않는다. 확인 버튼 후에만 `/api/auth/magic-link/verify`로 이동한다 (`confirmation-form.tsx`).
- 토큰 저장: `storeToken: "hashed"`, 만료 300초.
- `db-grant-auth.ts`: 런타임 역할이 superuser/BYPASSRLS/소유자 구성원이 아닌지 검사하고 5개 인증 테이블에만 CRUD를 부여한다. 역할 이름은 식별자로 이스케이프한다.
- 환경변수 검증: 시크릿 길이/placeholder, `BETTER_AUTH_URL` 형식(HTTPS 또는 로컬 HTTP, 경로/계정정보 없음).
- 테넌트 테이블: `ENABLE` + `FORCE ROW LEVEL SECURITY`, 허용 정책 0개, 런타임 권한 없음. 소유자 역할로도 접근이 막히는지 별도 테스트가 있다.
- 이메일 헤더 주입: `AUTH_EMAIL_FROM`에 CRLF가 들어가면 거부하는 테스트가 있다.

## Codex에 줄 후속 작업 (TASK_TEMPLATE 형식, 권장 순서)

### 작업 A: 로그인 메일 남용 방어 (F1)

- Goal: 로그인 메일 발송을 IP 위조와 수신자 반복 요청에서 보호한다.
- Scope: `src/platform/auth/factory.ts`, 필요 시 새 스키마/마이그레이션(수신자 카운터), 관련 테스트, `docs/SECURITY.md`.
- Out of scope: 실제 배포 프록시 설정, 이메일 제공자 교체, CAPTCHA.
- Constraints: 기존 `0000`~`0002` 마이그레이션 수정 금지. 응답이 가입 여부를 드러내면 안 된다. Better Auth 옵션명은 설치된 1.7.7 기준으로 확인하고, 확인하지 못한 항목은 보고서에 적는다.
- Acceptance: F1의 수락 기준 전부.
- Validation: 관련 단위/통합 테스트, `pnpm check`, 가능하면 `pnpm test:db`.

### 작업 B: 인증 경로 테스트 보강 (F3, F6, F5)

- Goal: 실제 라우트와 발송기 배선, 타임아웃, `image` 필드 처리를 테스트로 고정한다.
- Scope: `src/platform/auth/*`(필요한 최소 주입 지점), `tests/`.
- Out of scope: 신규 기능, 화면 변경.
- Acceptance: F3, F5, F6의 수락 기준.

### 작업 C: 헤더, 로그, 테스트 안전장치 (F4, F7, F8)

- Goal: 보안 헤더 범위 확대, 고정 카테고리 로깅, 파괴적 테스트 가드.
- Acceptance: F4, F7, F8의 수락 기준.

### 작업 D: CI 추가 (F11)

- Goal: Linux에서 install/typecheck/lint/test/build를 자동 실행한다.
- Out of scope: 배포 파이프라인.

### 작업 E (결정 문서, 코드 아님): 사용자 삭제/익명화 정책 (F2) 및 1C-2 불변식 정리 (F10)

- 코드 전에 `docs/SECURITY.md`, `docs/DATABASE.md`에 결정을 먼저 기록한다.

## 해결되지 않은 질문

1. 배포 환경(호스팅/프록시)은 무엇인가? F1의 IP 판별 설정은 이것에 달려 있다.
2. 개인정보 파기 요구에 어느 수준(익명화 vs 완전 삭제)으로 대응할 것인가?
3. Resend 도쿄 리전 사용과 해외 이전에 대한 동의 방침은 확정되었는가? (`SECURITY.md`에 OPEN)
