# GitHub Discover

**검색은 줄이고, 발견은 더 많이.** 내 기술 스택에 맞는 오픈소스를 만나는 공간.

[简体中文](README.md) · [English](README.en.md) · [日本語](README.ja.md) · [한국어](README.ko.md) · [Русский](README.ru.md)

![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=nextdotjs)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white)
![Cloudflare](https://img.shields.io/badge/Cloudflare-Workers%20%2B%20D1-F38020?logo=cloudflare&logoColor=white)

![홈 화면](public/首页.png)

## 발견을 위한 기능

- 언어, Topics, Star, 저장/방문 신호로 추천하고 작은 프로젝트도 발견합니다.
- 본 프로젝트 제외, 안정적인 Masonry, 돌아올 위치를 유지하는 상세 화면.
- 언어/분류 다중 선택, 프리셋과 적용/취소가 있는 고급 필터.
- 둥근 카드, 단계별 Star/Fork 색상, 한 번 클릭으로 밝게/어둡게, 5개 언어.
- GitHub OAuth/PAT 로그인, 저장 목록, 기록과 환경설정.

## 실행

Node.js 22+ 지원 LTS, pnpm 11+.

```sh
pnpm install
cp .dev.vars.example .dev.vars
pnpm db:migrate:local
pnpm dev
```

PowerShell에서는 `Copy-Item`을 사용하세요. http://localhost:3000 에 접속합니다.
GitHub 계정 로그인은 OAuth App과 `http://localhost:3000/api/auth/callback` 콜백이 필요합니다. `.dev.vars`에 `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `TOKEN_ENCRYPTION_KEY`를 설정하고 `APP_URL`을 실제 주소에 맞추세요.

```sh
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

위 명령으로 암호화 키를 생성합니다. OAuth 미설정 시에도 PAT 로그인은 가능합니다. PAT는 브라우저에만 저장하고 검증/전달 시 서버로 일시 전송합니다. OAuth 토큰은 서버에 암호화하여 저장합니다.

## 데모와 배포

`pnpm demo:dev`（4173）로 체험하고 `pnpm demo:build`로 `demo/dist`를 생성합니다. 데모는 동일 UI와 표시된 샘플 데이터를 사용하며 실제 인증/쓰기는 하지 않습니다.

- **정식 앱**: https://github-discover.ypyt147.workers.dev
- **데모**: https://github-discover-demo.ypyt147.workers.dev

정식 앱은 Workers + D1 및 실제 GitHub 데이터를 사용하며 OAuth/PAT 로그인이 가능합니다. 홈페이지는 정적으로 제공되고 계정과 피드는 브라우저에서 불러옵니다. 동적 API에는 무료 Worker 리소스 한도와 GitHub API 제한이 적용됩니다.

[데모](demo/README.md) · [정식 배포](doc/Cloudflare部署.md) · [기술 설명](doc/技术说明.md)（중국어）

검사: `pnpm lint`, `pnpm test`, `pnpm build`, `pnpm cf:build`. 다중 선택은 그룹 내 OR, 그룹 간 AND입니다. API 제한이 있고 트렌드에는 과거 스냅샷이 필요합니다. GitHub와 제휴하지 않은 독립 프로젝트입니다.
