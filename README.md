# GitHub Discover

**少一点寻找，多一点发现。** 一个懂你技术栈的 GitHub 开源项目发现空间。

[简体中文](README.md) · [English](README.en.md) · [日本語](README.ja.md) · [한국어](README.ko.md) · [Русский](README.ru.md)

![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=nextdotjs)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white)
![Cloudflare](https://img.shields.io/badge/Cloudflare-Workers%20%2B%20D1-F38020?logo=cloudflare&logoColor=white)
![pnpm](https://img.shields.io/badge/pnpm-11-F69220?logo=pnpm&logoColor=white)

![GitHub Discover 首页](public/首页.png)

## 为探索而设计

- **推荐更合拍**：结合语言、Topics、Stars、收藏与浏览反馈，发现中小项目，减少反复看到熟面孔。
- **看过就向前**：真实曝光去重，稳定瀑布流，详情打开后返回原处。
- **筛选更顺手**：语言与分类多选，高级筛选支持快捷档位、日期范围，确认后统一应用。
- **信息更鲜明**：Star / Fork 分级配色、圆润卡片、一键浅色/深色，支持五种语言。
- **你的开源空间**：GitHub 账号或 PAT 登录，保存收藏、历史和偏好。

## 快速开始

Node.js 22+（受支持的 LTS）、pnpm 11+：

```sh
pnpm install
cp .dev.vars.example .dev.vars
pnpm db:migrate:local
pnpm dev
```

PowerShell 复制文件用 `Copy-Item .dev.vars.example .dev.vars`。打开 **http://localhost:3000**，只需启动一个开发服务。

### 登录配置

GitHub 账号登录需要创建 [GitHub OAuth App](https://github.com/settings/developers)，回调设为 `http://localhost:3000/api/auth/callback`，在 `.dev.vars` 配置 `GITHUB_CLIENT_ID`、`GITHUB_CLIENT_SECRET`、`TOKEN_ENCRYPTION_KEY`。线上改为正式 HTTPS 域名；`APP_URL` 必须匹配访问地址。

```sh
# 生成 TOKEN_ENCRYPTION_KEY
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

未配置 OAuth 时仍显示账号登录入口并说明原因，PAT 登录可用。**PAT 只保存在浏览器**，校验/转发时临时发送到服务端，不写数据库；OAuth Token 在服务端加密保存。

## 演示与部署

```sh
pnpm demo:dev       # 独立交互演示，端口 4173
pnpm demo:build     # 静态产物 demo/dist
```

演示复用正式 UI，使用明确标注的样本数据，不执行真实登录或写入。

- **正式体验**：https://github-discover.ypyt147.workers.dev
- **交互演示**：https://github-discover-demo.ypyt147.workers.dev

正式站已部署 Workers + D1，可浏览真实 GitHub 数据、使用 PAT 登录。GitHub OAuth 账号登录仍待配置 OAuth App；未配置服务端采集令牌时，公开请求受较严格的 GitHub API 限额限制。

- [演示部署](demo/README.md)：独立静态 Worker / Pages，无需数据库。
- [正式应用部署](doc/Cloudflare部署.md)：Workers + D1 + GitHub OAuth。
- [技术与数据说明](doc/技术说明.md)：推荐、隐私、数据范围与验证。

```sh
pnpm lint
pnpm test
pnpm build
pnpm cf:build
```

真实 GitHub 数据受 API 配额与采样范围限制；趋势需要历史快照。多选同组内为“或”，语言与分类之间为“且”。独立项目，与 GitHub 无隶属关系。
