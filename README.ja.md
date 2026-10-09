# GitHub Discover

**探す時間を減らして、発見をもっと。** 技術スタックに合うオープンソースと出会う場所。

[简体中文](README.md) · [English](README.en.md) · [日本語](README.ja.md) · [한국어](README.ko.md) · [Русский](README.ru.md)

![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=nextdotjs)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white)
![Cloudflare](https://img.shields.io/badge/Cloudflare-Workers%20%2B%20D1-F38020?logo=cloudflare&logoColor=white)

![ホーム画面](public/首页.png)

## 発見のための機能

- 言語・Topics・Star・保存・閲覧からおすすめ。小さなプロジェクトにも出会えます。
- 閲覧済みを再推薦しない、安定した Masonry と戻り位置を保つ詳細画面。
- 言語/分類の複数選択、プリセット付き詳細フィルター、適用とキャンセル。
- 丸みのあるカード、Star/Fork の段階色、ワンクリックでライト/ダーク、5 言語。
- GitHub OAuth/PAT ログイン、保存・履歴・設定。

## 起動

Node.js 22+ の対応 LTS、pnpm 11+。

```sh
pnpm install
cp .dev.vars.example .dev.vars
pnpm db:migrate:local
pnpm dev
```

PowerShell では `Copy-Item` を使用。http://localhost:3000 を開きます。
GitHub ログインには OAuth App を作成し、callback を `http://localhost:3000/api/auth/callback` に設定します。`.dev.vars` の `GITHUB_CLIENT_ID`、`GITHUB_CLIENT_SECRET`、`TOKEN_ENCRYPTION_KEY` を設定し、`APP_URL` を実際のアドレスに合わせます。

```sh
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

上記で暗号化キーを生成できます。OAuth 未設定でも PAT ログインは利用可能。PAT はブラウザーのみに保存し、検証/転送時のみサーバーへ一時送信します。OAuth トークンはサーバーで暗号化保存します。

## デモと公開

`pnpm demo:dev`（4173）で体験、`pnpm demo:build` で `demo/dist` を生成。デモは同じ UI と明示的なサンプルデータを使用し、実際の認証/書き込みは行いません。

- **本番**: https://github-discover.ypyt147.workers.dev
- **デモ**: https://github-discover-demo.ypyt147.workers.dev

本番は Workers + D1 と実際の GitHub データを使用。PAT ログインは利用可能ですが、OAuth App は未設定です。サーバー側トークン未設定のため API 制限にご注意ください。

[デモ](demo/README.md) · [本番デプロイ](doc/Cloudflare部署.md) · [技術説明](doc/技术说明.md)（中国語）

検証：`pnpm lint`、`pnpm test`、`pnpm build`、`pnpm cf:build`。複数選択は同じグループ内 OR、グループ間 AND。API 制限があり、トレンドには履歴が必要です。GitHub 非提携の独立プロジェクトです。
