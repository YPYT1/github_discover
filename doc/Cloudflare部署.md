# 部署 GitHub Discover 到 Cloudflare

## 独立演示站

`pnpm demo:build` 生成 `demo/dist`。使用 `pnpm demo:deploy` 发布到独立 Worker `github-discover-demo`；配置为 `demo/wrangler.jsonc`，无 D1、OAuth、密钥依赖。也可将 `demo/dist` 交给 Cloudflare Pages。演示使用本地样本、不执行真实登录和写操作。以下步骤适用于正式应用。

网站部署到 **Workers**，数据库使用 **D1 / SQLite**。正式站已发布到 https://github-discover.ypyt147.workers.dev，演示站为 https://github-discover-demo.ypyt147.workers.dev。

远程迁移已应用，`TOKEN_ENCRYPTION_KEY` 与 `CRON_SECRET` 已通过 Worker Secrets 配置；OAuth App 和服务端 `GITHUB_TOKEN` 尚未配置。不要将本机部署令牌或 GitHub CLI 登录令牌当作应用采集令牌使用。

## 1. 创建数据库

后续配置 Cloudflare 账户登录或将 `CLOUDFLARE_API_TOKEN`、`CLOUDFLARE_ACCOUNT_ID` 注入本地/CI 环境，不写入代码。

```powershell
pnpm exec wrangler login
pnpm exec wrangler d1 create github-discover
```

将命令返回的真实 ID 填到 `wrangler.jsonc` 中的 `d1_databases[0].database_id`，替换全零 ID。保持 `binding` 为 `DB`，`database_name` 为 `github-discover`；若数据库改名，同步调整 package.json 中的迁移命令。

首次部署应用前执行：

```powershell
pnpm db:migrate:remote
```

该命令操作真实数据库，执行前确认账户及数据库 ID 正确。不要把本地 `.wrangler/state` 上传替代迁移。

## 2. 设置访问域名

在 `wrangler.jsonc` 的 `vars.APP_URL` 填入最终 HTTPS 网站地址，无末尾斜杠，例如你的 Workers 域名或绑定的自定义域名。

如修改 Worker 名称，同时修改 `services[0].service`，因为定时任务通过 `WORKER_SELF_REFERENCE` 调用同一个 Worker。

若启用自定义域名，在 Cloudflare Worker 控制台绑定该域名，确认 DNS/HTTPS 正常。`APP_URL` 必须与浏览器实际 Origin 相同，不能保留本地地址。

## 3. 配置密钥

PAT 登录不要求 OAuth App 或 Token 加密密钥，因为 PAT 不进入数据库。启用 OAuth 时配置：

```powershell
pnpm exec wrangler secret put GITHUB_CLIENT_ID
pnpm exec wrangler secret put GITHUB_CLIENT_SECRET
pnpm exec wrangler secret put TOKEN_ENCRYPTION_KEY
```

`TOKEN_ENCRYPTION_KEY` 是独立随机 32 字节的 base64 值，生成方式见 README。GitHub OAuth App 的线上回调为最终域名加 `/api/auth/callback`，本地/生产建议使用不同 OAuth App。

定时任务还需要独立随机 Secret：

```powershell
pnpm exec wrangler secret put CRON_SECRET
```

可选：提升公开请求与采集的 GitHub 限额，配置仅服务端使用、最小权限的公开信息访问令牌：

```powershell
pnpm exec wrangler secret put GITHUB_TOKEN
```

这里的 `GITHUB_TOKEN` 是**部署者的服务端采集凭证**，不是用户的 PAT。用户 PAT 仍然只在用户浏览器保存；不要把用户 PAT 手动保存成 Secret。

`CLOUDFLARE_API_TOKEN` 是部署凭证，不是应用运行凭证。绝不能给这些变量添加 `NEXT_PUBLIC_` 前缀。不要记录 Cookie、Authorization、`x-github-token` 或登录请求体；禁止在日志分析/代理配置中开启敏感头或请求体采集。

## 4. 构建与发布

```powershell
pnpm exec tsc --noEmit
pnpm lint
pnpm test
pnpm build
pnpm cf:build
pnpm deploy
```

`pnpm deploy` 会再次构建并发布。**只有准备发布时才执行最后一行。** OpenNext 官方提示 Windows 支持有限，线上建议使用 Linux CI 或 WSL 构建；本项目采用 pnpm hoisted 布局并已验证 Windows Worker 打包。

应用接口及页面是动态渲染，业务缓存放在 D1，当前不需要额外配置 R2。若以后增加 ISR/静态缓存，应按 OpenNext 文档添加缓存绑定，不能默认认为当前缓存可跨实例持久化。

## 5. 本地 Workers 预览

```powershell
pnpm preview
```

这是本地 Workers 运行时，不会发布。通常使用端口 8787；若要测试登录/写操作，需要将本地 `.dev.vars` 的 `APP_URL` 改为 `http://localhost:8787`，并匹配 OAuth 回调配置。回到 `pnpm dev` 时恢复 3000。

## 6. 初始化历史采样

Cron 配置为 UTC 每 6 小时的第 17 分钟。定时入口使用服务绑定及 `CRON_SECRET` 认证，公开访问 `/api/internal/sync` 没有正确 Secret 会被拒绝。

- 每次采集热门、AI、开发工具和新项目候选，并复查最多 40 个较早缓存的项目。
- 仓库 Star 快照按 UTC 日期保存，保留 100 天。
- 日/周/月趋势需要对应时间范围的真实基线；第一次部署不立即出现周/月增长数据是预期行为。
- 过期会话与缓存通过 Cron 清理。采集失败会在 Worker 日志中出现状态码，不记录令牌。

## 7. 发布后的人工验收

- 五种语言与一键浅色/深色主题，手机/平板/桌面没有横向溢出。
- OAuth 登录的回调、State 校验、拒绝授权场景、退出登录。
- PAT 登录：D1 的用户 `token_encrypted` 对 PAT-only 新用户为 NULL，数据库中不含 PAT；浏览器退出后 PAT 清除。此前通过 OAuth 登录过的同一用户可能保留其 OAuth 密文，但 PAT 从不写入该列。
- 收藏、历史、偏好刷新后存在，不同用户互不可见。
- 细粒度/经典 PAT 的 Star 权限差异，以及 OAuth 的可选写权限授权。
- 搜索限定符、组合筛选、分页、分享详情链接和返回位置。
- 真实 GitHub 超时/限流/撤销令牌后的提示与恢复。
- Cron 日志、快照增长和远程 D1 迁移状态。

本地构建和测试通过不等于以上远程功能已经验收。
