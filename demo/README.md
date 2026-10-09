# Discover · Interactive demo

复用正式应用的卡片、多选筛选、主题和详情组件；数据为明确标注的本地演示样本。无需 D1、GitHub Token 或 OAuth，不执行真实登录/Star 写入。正式应用不会导入此目录。

在项目根目录运行：

```sh
pnpm demo:dev
pnpm demo:build
# 准备发布到独立 Cloudflare Worker 时运行
pnpm demo:deploy
```

Cloudflare 构建命令：`pnpm demo:build`；发布命令：`pnpm exec wrangler deploy --config demo/wrangler.jsonc`。
静态资产输出：`demo/dist`。也可将该目录部署到 Cloudflare Pages。
正式站使用根目录 `wrangler.jsonc`、`pnpm deploy` 和 D1，demo 使用独立 Worker 名称，无数据库绑定。
