# 私有封装打包手册

面向**私有封装版本**（brand / theme 定制层）的服务器端打包作业手册：如何正确拉取自建 tag、
如何构建前端镜像与后端镜像、如何推送到私有仓库并部署，以及上游升级后品牌定制层的维护流程。

> 适用版本：`v0.9.0-private` 及之后的自建 tag
> 仓库地址：<https://github.com/DawnOf1996/WeKnora.git>
> 一键脚本：`scripts/build_private_images.sh`（见 [§6](#6-一键构建脚本)）

---

## 0. 最短路径

推荐用一把梭脚本（拉 tag → 检出 → 构建 → 可选推送）：

```bash
# 本机默认走宿主机构建（容器内 npm CDN 太慢，见 §1）
NODE_BIN_DIR=~/nodedist/node-v24.9.0-linux-x64/bin \
    ./scripts/build_private_images.sh --host-build

# 基础镜像已就位、容器内 npm 够快时，走标准 Dockerfile
./scripts/build_private_images.sh
```

手工三步版：

```bash
git fetch origin --force --tags          # ① 必须带 --force，否则旧 tag 不会被刷新
git checkout --detach v0.9.0-private     # ② 检出自建 tag
make docker-build-frontend               # ③ 构建前端镜像
```

> **首次打包前先把 builder 基础镜像拉好**，否则构建会卡在下载上：
>
> ```bash
> DIGEST="sha256:ba849c60be29959425b8734d57b8b4b7d56f98edd9504c9af091d5281095a71e"
> docker pull docker.m.daocloud.io/library/node:24-bookworm-slim@$DIGEST
> docker pull node:24-bookworm-slim@$DIGEST
> ```
>
> 实在拉不下来就用附录 A 的宿主机构建路径（实测 `npm ci` 8 s + `vite build` 47 s）。

带 npm 镜像源（国内服务器推荐，构建更快）：

```bash
docker build --platform linux/amd64 \
  --build-arg VITE_FRONTEND_COMMIT="$(git rev-parse --short HEAD)" \
  --build-arg NPM_REGISTRY=https://registry.npmmirror.com \
  -f frontend/Dockerfile \
  -t wechatopenai/weknora-ui:v0.9.0-private \
  -t wechatopenai/weknora-ui:latest \
  frontend/
```

---

## 1. 环境要求

| 项目 | 最低 | 推荐 | 说明 |
| --- | --- | --- | --- |
| Docker | 24.0 | 26.x | 需支持 BuildKit（`DOCKER_BUILDKIT=1`） |
| buildx | 0.10 | 0.14+ | 仅多架构构建需要 |
| 架构 | x86_64 / aarch64 | — | 自动检测，产物为 `linux/amd64` 或 `linux/arm64` |
| 内存 | 8 GB | 32 GB+ | Vite 构建该 SPA 极易打满 Node 默认堆 |
| 磁盘 | 20 GB | 100 GB+ | 构建缓存 + 镜像层 |
| Node | 不需要宿主机安装 | — | 宿主机构建走 Docker 多阶段，npm 在容器内执行；只有走附录 A 的宿主机构建路径才需要 Node 20.19+ |

**网络出口**必须可达：

- `docker.io` —— 基础镜像按 digest 锁定（`node:24-bookworm-slim`、`nginx:1.30.3-alpine`）
- `registry.npmmirror.com` 或 `registry.npmjs.org` —— npm 依赖
- `cdn.sheetjs.com` —— `xlsx` 包以远程 tarball 形式锁定在 `package-lock.json`

连通性自检：

```bash
curl -sS -o /dev/null -w "npmjs=%{http_code}\n"     https://registry.npmjs.org/vue
curl -sS -o /dev/null -w "npmmirror=%{http_code}\n" https://registry.npmmirror.com/vue
curl -sS -o /dev/null -w "sheetjs=%{http_code}\n"   https://cdn.sheetjs.com/xlsx-0.20.2/xlsx-0.20.2.tgz
docker pull nginx:1.30.3-alpine@sha256:0d3b80406a13a767339fbe2f41406d6c7da727ab89cf8fae399e81f780f814d1
```

**镜像加速器**：本机 `/etc/docker/daemon.json` 配置了多个 registry-mirrors。实测
`dockerpull.cn` 返回的镜像**校验失败**（`image config verification failed`），
`atomhub.openatom.cn` 对按 digest 锁定的镜像返回 **404**。
`docker.m.daocloud.io` 可用，但吞吐很低。

**基础镜像先拉好**（首次打包必做，否则构建会卡在下载上）：

```bash
# 从可用加速器拉同一 digest —— 镜像站代理的是同一份内容，digest 一致
DIGEST="sha256:ba849c60be29959425b8734d57b8b4b7d56f98edd9504c9af091d5281095a71e"
docker pull docker.m.daocloud.io/library/node:24-bookworm-slim@$DIGEST

# 再从官方源拉一次：各层已在本地内容库里，只需补 manifest，立刻完成
docker pull node:24-bookworm-slim@$DIGEST
```

第 2 步之后，Dockerfile 里 `FROM node:24-bookworm-slim@sha256:...` 就能直接命中本地镜像
（实测 base 镜像解析耗时 0.0s）。注意：中断过的 pull 会保留已下载的层，重新 pull 时会复用，
不必从头再来。

### npm 源速度：容器内极慢，宿主机极快（重要）

本机 npmmirror 的 **CDN 域名 `cdn.npmmirror.com` 很慢**，容器内实测每个 tarball 要
**136～225 秒**，还会间歇 `ECONNRESET`。容器里没有 npm 缓存，456 个包逐个下载，
标准 `docker build` 路径实际不可用。

而**宿主机有 946 MB 预热的 npm 缓存**（`~/.npm/_cacache`），同样的 `npm ci` 只要 **8 秒**。

所以本机**优先走宿主机构建路径**（附录 A / `--host-build`）。若一定要用容器内构建，
可给 Dockerfile 的 npm 步骤加缓存挂载，让 BuildKit 复用宿主机缓存：

```dockerfile
RUN --mount=type=cache,target=/root/.npm,sharing=locked \
    if [ -n "$NPM_REGISTRY" ]; then npm ci --registry="$NPM_REGISTRY"; else npm ci; fi
```

> **别在宿主机仓库里用容器跑 `npm ci`** —— 容器以 root 写入 `frontend/node_modules`，
> 之后宿主机的 `npm ci` 会报 `EACCES: permission denied, rmdir '.../node_modules/...'`
> 而无法清理。万一发生，用 root 容器删掉即可：
>
> ```bash
> docker run --rm -v "$PWD/frontend":/frontend -w /frontend node:24-bookworm-slim rm -rf node_modules
> ```

> **宿主机 Node 版本无关**。`frontend/Dockerfile` 是多阶段构建，`npm ci` 与 `vite build`
> 都在 `node:24` 容器内完成。宿主机装的是 Node 18 也不影响打包。

---

## 2. 拉取自建 tag（最易踩坑的一步）

### 2.1 为什么必须 `--force`

`v0.9.0-private` 是 **annotated tag**（带说明的标签对象）。Git 对已存在的 tag **默认拒绝覆盖**：

```console
$ git fetch origin --tags
 ! [rejected]        v0.9.0-private -> v0.9.0-private (would clobber existing tag)
```

这条报错不会让命令整体失败（退出码 0），但 **tag 仍停留在旧 commit 上**。后果是
「命令跑通了、打出来的镜像却是旧代码」，且因为前端构建静默成功，不会有任何报错提示。

本仓库就发生过这个情况：本地 tag 指向 `c0ecc84`（14 个提交之前），远端已更新到 `669edcfd`
（含朋克主题层）。必须强制刷新才对得上。

### 2.2 标准流程

```bash
cd /path/to/WeKnora

# 拉取，并强制刷新本地已存在的 tag
git fetch origin --force --tags --prune

# 确认 tag 存在并指向预期 commit
git rev-parse v0.9.0-private^{commit}
```

### 2.3 校验 tag 与远端一致

```bash
# 本地 tag 的 commit
git rev-parse v0.9.0-private^{commit}

# 远端 tag 的 commit（权威来源）
git ls-remote --tags origin | grep 'v0.9.0-private'
# 输出形如：
#   5ceb8076...  refs/tags/v0.9.0-private          ← annotated tag 对象
#   669edcfd9...  refs/tags/v0.9.0-private^{}       ← 实际指向的 commit

# 两者应与 origin/custom/brand 的 head 一致
git rev-parse origin/custom/brand
```

三者一致才说明拉取正确。

### 2.4 首次克隆（服务器上还没有仓库）

```bash
git clone https://github.com/DawnOf1996/WeKnora.git
cd WeKnora
git fetch origin --force --tags          # 克隆默认不拉 tag，必须补这一条
git checkout --detach v0.9.0-private
```

> `git clone` **不会**自动拉取 tag。克隆后不补 `git fetch --tags`，`git tag -l` 会是空的。

### 2.5 私有仓库访问

若仓库或 tag 后续转为私有，需要凭据：

```bash
git remote set-url origin https://<用户名>@github.com/DawnOf1996/WeKnora.git
# 或用 SSH
git remote set-url origin git@github.com:DawnOf1996/WeKnora.git
```

---

## 3. 检出代码

私有 tag 用 **detached HEAD** 检出，构建结果与 tag 严格绑定：

```bash
git checkout --detach v0.9.0-private
git log -1 --format='%H %d %s'
# 669edcfd9... (HEAD, tag: v0.9.0-private, origin/custom/brand)
```

若需要在 tag 之上继续开发（而不是纯打包），建一个指向它的分支：

```bash
git checkout -b private/v0.9.0 v0.9.0-private
```

打包完成后切回主干：

```bash
git checkout main
```

> **构建前务必确认工作区干净**，否则 `git checkout` 可能带入未提交改动，
> 导致「同一个 tag 打出两个不同的镜像」：
>
> ```bash
> git status --porcelain     # 必须为空
> ```

---

## 4. 前端镜像构建

### 4.1 推荐命令

```bash
cd /path/to/WeKnora
export DOCKER_BUILDKIT=1

docker build \
  --platform linux/amd64 \
  --build-arg VITE_FRONTEND_COMMIT="$(git rev-parse --short HEAD)" \
  --build-arg NPM_REGISTRY=https://registry.npmmirror.com \
  -f frontend/Dockerfile \
  -t wechatopenai/weknora-ui:v0.9.0-private \
  -t wechatopenai/weknora-ui:latest \
  frontend/
```

或走 Makefile（自动注入版本信息，但默认走官方 npm 源）：

```bash
make docker-build-frontend
```

### 4.2 构建参数

| 参数 | 默认值 | 说明 |
| --- | --- | --- |
| `VITE_FRONTEND_COMMIT` | `unknown` | 注入前端的 commit 号，在「系统信息」页展示。**建议显式传**，否则显示 unknown |
| `NPM_REGISTRY` | 空 | npm 源。空则用官方源；国内服务器建议 `https://registry.npmmirror.com` |
| `NODE_MAX_OLD_SPACE_SIZE` | `4096` | Node 堆上限（MB）。内存小的机器出现 OOM 时调大 |
| `VITE_BASE_PATH` | `/` | 前端部署在子路径时使用，参见 `docs/subpath-deployment.md` |

### 4.3 镜像分层说明

`frontend/Dockerfile` 是两阶段构建：

1. **builder**：`node:24-bookworm-slim`（按 digest 锁定）→ `npm ci` → `vite build` → `/frontend/dist`
2. **runtime**：`nginx:1.30.3-alpine`（按 digest 锁定）→ 拷贝 `dist` 与 nginx 模板 → `docker-entrypoint.sh` 启动

> 基础镜像**故意按 digest 锁定**而非用浮动 tag。浮动 tag 会随上游 stable 版本漂移，
> 且新版 Alpine 基础镜像在 CentOS 7（kernel 3.10 + 旧 libseccomp）这类老主机上起不来——
> v0.7.0 就踩过这个坑。**不要改回 `nginx:stable-alpine`。**

产物镜像约 85 MB（上游 v0.9.0 实测 85.8 MB）。

### 4.4 多架构构建（arm64 服务器或需要双架构）

```bash
docker buildx create --name wk-builder --use   # 仅首次

docker buildx build \
  --platform linux/amd64,linux/arm64 \
  --build-arg VITE_FRONTEND_COMMIT="$(git rev-parse --short HEAD)" \
  --build-arg NPM_REGISTRY=https://registry.npmmirror.com \
  -f frontend/Dockerfile \
  -t registry.example.com/weknora/weknora-ui:v0.9.0-private \
  --push \
  frontend/
```

`--push` 是多架构构建的必需项：不加 `--push` 时 `docker buildx build` 只留在本地缓存里，
`docker images` 看不到。

### 4.5 镜像验证

```bash
# 1) 确认镜像存在与大小
docker images wechatopenai/weknora-ui --format '{{.Repository}}:{{.Tag}} {{.Size}}'

# 2) 起一个容器
#    -e APP_HOST=127.0.0.1：单跑时 nginx 要能解析上游 "app"，否则启动即报
#    host not found in upstream "app"；正式部署由 compose 的网络提供该名字
#    端口按实际挑一个没被占用的
docker run -d --name wk-ui-check -p 18099:80 -e APP_HOST=127.0.0.1 \
  wechatopenai/weknora-ui:v0.9.0-private

# 3) 首页可访问（应为 200）
curl -sS -o /dev/null -w "%{http_code}\n" http://127.0.0.1:18099/

# 4) 运行时配置已注入
curl -sS http://127.0.0.1:18099/config.js

# 5) 标题已换成品牌名（定制生效的直接证据）
curl -sS http://127.0.0.1:18099/ | grep -oE "<title>[^<]*</title>"
#   <title>知识库助手</title>

# 6) 嵌入页与 MCP 代理路由（上游自带的冒烟测试，使用后端 fixture，无需真实后端）
#    注意：测试会在临时目录里写 fixture 文件并挂进容器，nginx worker 以
#    非 root 运行。宿主机 umask 必须是 022，否则 fixture 文件是 0600，
#    nginx 读不到会返回 403。
(umask 022 && python3 scripts/test_embed_nginx.py wechatopenai/weknora-ui:v0.9.0-private)
#   Embed and MCP Nginx integration checks passed

docker rm -f wk-ui-check
```

### 4.6 品牌定制是否生效

私有 tag 的定制层通过 `frontend/src/config/branding.ts` 单一配置源驱动，
打包后无需额外操作即生效。快速确认镜像里带的是定制版而非上游版：

```bash
docker run --rm wechatopenai/weknora-ui:v0.9.0-private \
  sh -c "grep -o '知识库助手' /usr/share/nginx/html/assets/*.js | head -1"
```

或在页面「系统信息」页确认 commit 号与 tag 对应。

---

## 5. 推送私有仓库与部署

### 5.1 推送

```bash
docker tag wechatopenai/weknora-ui:v0.9.0-private registry.example.com/weknora/weknora-ui:v0.9.0-private
docker push registry.example.com/weknora/weknora-ui:v0.9.0-private
```

### 5.2 部署

**方案 A：不改镜像名（推荐，改动最小）**

沿用上游镜像名 `wechatopenai/weknora-ui`，只是本地/私有仓库里换成自己的镜像。
在 `.env` 中指定版本：

```bash
WEKNORA_VERSION=v0.9.0-private
```

`docker-compose.yml` 中前端服务是 `image: wechatopenai/weknora-ui:${WEKNORA_VERSION:-latest}`，
版本号一改即可命中。

```bash
docker compose up -d frontend
```

> **注意**：`docker-compose.yml` 里 `frontend` 服务同时声明了 `build:` 段。
> 用 `docker compose build frontend` 会触发**本地重新构建**，而不是用你打好的镜像。
> 部署已构建好的镜像请用 `docker compose up -d frontend`（不带 `build`），
> 或先 `docker compose pull frontend`。

**方案 B：改用私有仓库命名空间**

需要同时改 `docker-compose.yml` 里三个服务的 `image:` 字段：

```yaml
frontend:
  image: registry.example.com/weknora/weknora-ui:${WEKNORA_VERSION:-latest}
app:
  image: registry.example.com/weknora/weknora-app:${WEKNORA_VERSION:-latest}
docreader:
  image: registry.example.com/weknora/weknora-docreader:${WEKNORA_VERSION:-latest}
```

### 5.3 验证部署

```bash
docker compose ps                       # 容器状态
docker compose logs -f frontend         # nginx 日志
curl -sS -o /dev/null -w "%{http_code}\n" http://<服务器IP>/   # 首页
```

---

## 6. 一键构建脚本

`scripts/build_private_images.sh` 把「拉 tag → 检出 → 构建 → 可选推送」串成一步：

```bash
# 前端镜像（默认 tag: v0.9.0-private）
./scripts/build_private_images.sh

# 指定 tag
./scripts/build_private_images.sh --tag v0.9.0-private

# 全部镜像 + 推送到私有仓库
./scripts/build_private_images.sh --all \
    --registry registry.example.com/weknora --push

# 强制指定平台与 npm 源
./scripts/build_private_images.sh --platform linux/arm64 \
    --npm-registry https://registry.npmmirror.com

# builder 基础镜像拉不下来时：宿主机构建 vite 产物再打 runtime 镜像
NODE_BIN_DIR=~/nodedist/node-v24.9.0-linux-x64/bin \
    ./scripts/build_private_images.sh --host-build

# 工作区还有未提交改动时强制构建（默认拒绝）
./scripts/build_private_images.sh --allow-dirty
```

脚本内置的安全护栏：

- `git fetch --force --tags`，杜绝旧 tag 陷阱
- 工作区不干净时直接中止（`--allow-dirty` 可放行，并打印未提交文件清单）
- 检出后校验 `HEAD` 与 tag commit 一致
- `--push` 必须配合 `--registry`，避免误推到上游 `wechatopenai` 仓库
- 自动把非法字符的 git tag 转成合法镜像 tag
- `--host-build` 模式下自动 `chmod -R a+rX`，规避宿主机 umask 0077 导致的 403

---

## 7. 后端镜像构建

### 7.1 应用镜像（app）

```bash
eval "$(./scripts/get_version.sh env)"
docker build --platform linux/amd64 \
  --build-arg VERSION_ARG="$VERSION" \
  --build-arg COMMIT_ID_ARG="$COMMIT_ID" \
  --build-arg BUILD_TIME_ARG="$BUILD_TIME" \
  --build-arg GOPROXY_ARG="https://goproxy.cn,direct" \
  -f docker/Dockerfile.app \
  -t wechatopenai/weknora-app:v0.9.0-private \
  .
```

或：

```bash
make docker-build-app
```

> `Dockerfile.app` 默认 `WITH_ANYDOC=1`，需要 Rust 工具链构建 anydoc 静态库，
> 显著拉长构建时间。仅需 PDF/Office 基础解析时可传 `--build-arg WITH_ANYDOC=0`。

### 7.2 文档读取器镜像（docreader）

```bash
docker build --platform linux/amd64 \
  --build-arg VERSION_ARG="$(cat VERSION)" \
  --build-arg COMMIT_ID_ARG="$(git rev-parse --short HEAD)" \
  -f docker/Dockerfile.docreader \
  -t wechatopenai/weknora-docreader:v0.9.0-private \
  .
```

或：

```bash
make docker-build-docreader
```

### 7.3 沙箱镜像（可选）

```bash
make docker-build-sandbox
```

沙箱镜像会产出 `latest` / `main` / `latest-cube` / `main-cube` / `latest-desktop` / `main-desktop` /
`latest-desktop-cube` / `main-desktop-cube` 共 8 个 tag，体积大，仅在启用浏览器沙箱能力时才需要构建。

---

## 8. 品牌定制层维护（上游升级后必做）

私有封装的核心是 `frontend/src/config/branding.ts` 这一层「规则覆盖」，
它**不删除**上游条目，只在消费点做过滤 —— 这是上游升级不冲突的关键。

上游升级后按顺序跑：

```bash
cd frontend
npm ci

# 1) 漂移检测：上游重构可能悄悄删掉我们的过滤调用
npm run check-branding

# 2) 自动整改集成点（先 dry-run 看清楚要改什么）
npm run branding:apply -- --dry
npm run branding:apply

# 3) 文案层对账（45 个 key × 6 种语言）
npm run branding:merge

# 4) 列出 locale 里残留的上游品牌词
npm run branding:list zh-CN
npm run branding:list              # 全部 6 种语言

# 5) 常规校验
npm test && npm run type-check && npm run build
```

> **`check-branding` 必须过**。它的存在意义是捕捉「编译通过、测试通过，
> 但隐藏功能已经静默失效（菜单项又冒出来了）」这类问题。
> `npm run branding:apply` 退出码 1 表示有集成点无法自动整改，需要人工介入。

### 8.1 站点图标（favicon）

站点图标是**原位替换**的：`frontend/public/favicon.ico` 文件名不变、只换内容，
`index.html` / `embed.html` 里的 `<link rel="shortcut icon" href="./public/favicon.ico">`
一行都不用动。

这样做的目的只有一个：**合并上游升级时，前端目录只有一个文件是分歧点**
（就是这个 `.ico`），而不是散落一地的 HTML 改动 + 多个新增图标文件。

```
frontend/
├── public/favicon.ico              ← 唯一被替换的文件（与上游同名）
└── scripts/brand/
    ├── favicon.svg                  ← 图标源文件（深蓝底 #102030 + 朋克黄 #ffc02d 的摊开书）
    └── build-favicon.sh             ← 由 SVG 生成 .ico
```

改配色或换造型时，只改 `scripts/brand/favicon.svg` 里的色值/路径，然后重跑：

```bash
./frontend/scripts/brand/build-favicon.sh
```

依赖 `google-chrome`（把 SVG 渲染成 PNG，保留 alpha）和 `python3` + `Pillow`（组装 ICO）。
脚本会输出 16 与 32 两个尺寸的 ICO；16px 会自动剔除 SVG 里 `@favicon:detail` 标记的
页面文字线（那个尺寸下线条只会糊成噪点）。

> 图标配色不跟随主题切换：`public/` 下的静态资源不会被 vite 注入，颜色是硬编码的。
> 目前用的是朋克黄 `#ffc02d`；若要与默认主题（绿 `#07c05f`）对齐，改 SVG 里的
> 三个色值重跑脚本即可。

---

## 9. 故障排查

| 现象 | 原因 | 处理 |
| --- | --- | --- |
| `! [rejected] v0.9.0-private -> v0.9.0-private (would clobber existing tag)` | 本地已有旧 tag | `git fetch origin --force --tags`；脚本已内置 |
| 构建卡在 `Pulling fs layer` 很久不动 | docker.io 直连慢 / 加速器在重试 | 先按 [§1](#1-环境要求) 把 builder 基础镜像拉好；中断过的 pull 可复用已下载的层，重新 pull 即可 |
| `image config verification failed for digest` | 加速器返回了损坏/不一致的镜像 | 换加速器；已下载的层不要信，重新用可用加速器按同一 digest 拉 |
| `Error response from daemon: ... 404 ... /v2/library/node/manifests/sha256:...` | 加速器不代理按 digest 的请求 | 直连官方源，或先用可用加速器拉同一 digest 再从官方源补 manifest |
| **容器内 `npm ci` 跑到 290s 后 `ETIMEDOUT`** | npmmirror 的 CDN 域名很慢，每个 tarball 136～225s，还间歇 ECONNRESET | 走宿主机构建路径（`--host-build`），本机 npm 缓存是热的，8s 就能装完；详见 [§1](#1-环境要求) |
| 宿主机 `npm ci` 报 `EACCES: permission denied, rmdir .../node_modules/...` | 之前用容器在仓库里跑过 `npm ci`，留下 root 属主的 node_modules | 用 root 容器删掉：`docker run --rm -v "$PWD/frontend":/frontend -w /frontend node:24-bookworm-slim rm -rf node_modules` |
| 打完的镜像功能是旧的 | tag 没刷新，检出的是旧 commit | `git rev-parse v0.9.0-private^{commit}` 与 `git ls-remote --tags origin` 对比 |
| `git tag -l` 为空 | `git clone` 默认不拉 tag | `git fetch origin --tags` |
| `npm ci` 卡住 / 超时 | npm 源慢 | 加 `--build-arg NPM_REGISTRY=https://registry.npmmirror.com` |
| `npm ci` 报 `xlsx` 下载失败 | `cdn.sheetjs.com` 不可达 | 确认出口网络；`package-lock.json` 锁定了该远程 tarball 及其哈希，不能换源 |
| Vite 构建 `JavaScript heap out of memory` | Node 默认堆不够 | `--build-arg NODE_MAX_OLD_SPACE_SIZE=8192` |
| 基础镜像拉不下来 | Docker Hub 不通 | 配置镜像加速器 / 代理 |
| 容器起不来，`nginx` 报错 | 基础镜像 Alpine 版本过新 | 确认用的是按 digest 锁定的 `nginx:1.30.3-alpine`，不要换成浮动 tag |
| 页面显示 commit 为 `unknown` | 没传 `VITE_FRONTEND_COMMIT` | 构建时显式传 `--build-arg VITE_FRONTEND_COMMIT="$(git rev-parse --short HEAD)"` |
| `docker compose up` 后镜像还是旧的 | compose 触发了本地 `build:` | 用 `docker compose up -d`（不带 `build`），或先 `docker compose pull` |
| 容器起不来，报 `host not found in upstream "app"` | 单跑前端容器时没有 compose 网络提供 `app` 这个名字 | 单跑验证时加 `-e APP_HOST=127.0.0.1` |
| 首页返回 **403 Forbidden**，但容器在跑 | 静态文件权限是 0600/0700，nginx worker（非 root）读不到 | 宿主机 umask 是 0077 时会踩到：`chmod -R a+rX dist`；用附录 A 的宿主机构建路径时，`cp` 后要再 `chmod -R a+rX` 暂存目录 |
| `test_embed_nginx.py` 报 `Permission denied` / 403 | 同上，测试 fixture 文件继承了宿主机 umask | 用 `(umask 022 && python3 scripts/test_embed_nginx.py <镜像>)` 跑 |
| 磁盘写满 | 构建缓存堆积 | `docker builder prune -af && docker image prune -af` |

---

## 10. 打包检查清单

打包前：

- [ ] `git status --porcelain` 为空
- [ ] `git rev-parse v0.9.0-private^{commit}` 与远端一致
- [ ] Docker 服务在跑，磁盘/内存充足
- [ ] npm 源与 `cdn.sheetjs.com` 可达

打包后：

- [ ] 镜像 tag 与预期版本号一致
- [ ] `docker run` + `curl` 首页返回 200
- [ ] `curl /config.js` 有运行时配置
- [ ] `npm run check-branding` 通过
- [ ] 页面「系统信息」显示的 commit 与 tag 对应
- [ ] 品牌定制生效（Logo/菜单隐藏/文案覆盖）

---

## 附录 A. 备用路径：构建镜像拉不下来时

当 `node:24-bookworm-slim` 无论怎么拉都拿不到时，可以**把 vite 构建放到宿主机做**，
只用本地已有的 nginx 基础镜像打运行时层。实测耗时：`npm ci` 约 8 s，`vite build` 约 47 s。

> 前提：宿主机有 **Node 20.19+ / 22.12+ / 24**（Vite 7 的硬性要求）。
> 本机自带的是 Node 18.20.4，**不够**，需先装一份新版 Node。

**第 1 步：准备 Node 24**（npmmirror 镜像，实测 ~540 KB/s）

```bash
mkdir -p ~/nodedist && cd ~/nodedist
curl -sSLO https://cdn.npmmirror.com/binaries/node/v24.9.0/node-v24.9.0-linux-x64.tar.xz
tar -xf node-v24.9.0-linux-x64.tar.xz
export PATH=~/nodedist/node-v24.9.0-linux-x64/bin:$PATH
node -v          # v24.9.0
```

**第 2 步：构建静态资源**

```bash
cd /path/to/WeKnora/frontend
export VITE_IS_DOCKER=true
export VITE_FRONTEND_COMMIT="$(git rev-parse --short HEAD)"
export NODE_OPTIONS="--max-old-space-size=8192"

npm ci --registry=https://registry.npmmirror.com --no-audit --no-fund
npm run build          # 产物在 frontend/dist

# 关键：把权限放开
# 宿主机 umask 常为 0077，vite 写出的文件是 0600 / 目录 0700。
# nginx worker 以非 root 运行，读不到就返回 403 Forbidden。
chmod -R a+rX dist
```

**第 3 步：用 runtime-only Dockerfile 打镜像**

`frontend/.dockerignore` 里排除了 `dist`，所以不能用 `frontend/` 当构建上下文，
要把 `dist` 和配置文件**暂存**到一个干净目录再构建：

```bash
cd /path/to/WeKnora/frontend

STAGE="$(mktemp -d)"
cp -r dist "$STAGE/"
cp nginx.conf nginx-api-proxy.conf nginx-http.conf docker-entrypoint.sh "$STAGE/"
chmod -R a+rX "$STAGE"          # cp 会按当前 umask 重建权限，这里再放开一次

docker build -f- -t wechatopenai/weknora-ui:v0.9.0-private "$STAGE" <<'EOF'
FROM nginx:1.30.3-alpine@sha256:0d3b80406a13a767339fbe2f41406d6c7da727ab89cf8fae399e81f780f814d1
COPY dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/templates/default.conf.template
COPY nginx-api-proxy.conf /etc/nginx/api-proxy.conf
COPY nginx-http.conf /etc/nginx/conf.d/00-weknora-http.conf
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh
ENV MAX_FILE_SIZE_MB=50
EXPOSE 80
ENTRYPOINT ["/docker-entrypoint.sh"]
EOF

rm -rf "$STAGE"
```

这段内容与 `frontend/Dockerfile` 的 runtime 阶段**逐行等价**，差别只是少了 builder 阶段
（builder 阶段在容器内以 root 运行、umask 022，因此不会踩到上面的权限坑）。
若 `nginx:1.30.3-alpine@sha256:...` 本地也没有，先用 §1 的加速器办法把它拉下来。

---

## 附录 B. 本机实测记录（2026-11-17）

在打包服务器（Ubuntu 22.04 / x86_64 / 32 核 / 117 GB 内存 / Docker 26.1.4 客户端 + 24.0.6 服务端）
上实测。

### B.1 `v0.9.0-private`（commit `669edcfd`）

| 项目 | 结果 |
| --- | --- |
| 拉取 tag | `git fetch origin --force --tags --prune` → 本地 tag 从 `c0ecc84c` 刷新到 `669edcfd` |
| 检出 | `git checkout --detach v0.9.0-private`，HEAD 与 tag commit 一致 |
| 品牌漂移检测 | `npm run check-branding` → `✓ 品牌定制漂移检测通过`（隐藏 im/cli/chrome/claw，保留 embed/api/mcpserver；文案覆盖 45 key × 6 语言） |
| `npm ci` | 8 s（npmmirror 源，456 个包，**走宿主机 946 MB 预热缓存**） |
| `vite build` | 47 s，产物 `frontend/dist` |
| 镜像体积 | 89.3 MB（上游 v0.9.0 为 85.8 MB） |
| 首页冒烟 | HTTP 200，`<title>知识库助手</title>`，静态资源 200 |
| `config.js` | 正确注入 `MAX_FILE_SIZE_MB` / `MAX_SKILL_BUNDLE_SIZE_MB` / `DEFAULT_LOCALE` |
| commit 注入 | 产物内含 `669edcf`（vite 取前 7 位） |
| embed/MCP 冒烟 | `(umask 022 && python3 scripts/test_embed_nginx.py <镜像>)` → `Embed and MCP Nginx integration checks passed` |

### B.2 `v0.9.0-private.2`（commit `a8e0d8db`）

相对 `.1` 多一个提交：`feat(theme): switch punk brand palette from neon pink to punk yellow`，
只改 `frontend/src/assets/theme/punk-theme.css`。

| 项目 | 结果 |
| --- | --- |
| 拉取 tag | `git fetch origin --force --tags`（GitHub 直连偶发 `RPC 失败 / HTTP2 framing layer`，重试即可） |
| 检出 | HEAD = `a8e0d8db` = `origin/custom/brand` HEAD |
| 镜像 | `wechatopenai/weknora-ui:v0.9.0-private.2`，89.3 MB |
| 主题校验 | 产物 CSS 中 `#ffc02d`（朋克黄）存在，`#ff2d78`（霓虹粉）已为 0 |
| 资源指纹 | `index-DQ0bSiTa.js`（`.1` 是 `index-Ctrc7j2S.js`），确认产物确实来自新源码 |
| commit 注入 | 产物内含 `a8e0d8d` |
| 首页 / 品牌 | HTTP 200，`<title>知识库助手</title>` |
| 品牌漂移检测 | 通过 |
| embed/MCP 冒烟 | 通过 |
| 站点图标 | 仍是上游字标（5558 bytes），与该 tag 的源码一致 |

### B.2.1 `v0.9.0-private.4`

相对 `.2` 多三个提交：打包手册与一键构建脚本、站点图标替换、手册与脚本默认 tag 同步。

| 项目 | 结果 |
| --- | --- |
| 镜像 | `wechatopenai/weknora-ui:v0.9.0-private.4`，89.3 MB |
| 站点图标 | 1119 bytes 书本图标（16+32），与源码 tag 的 `favicon.ico` 逐字节一致（sha256 `9bbb050c…`） |
| 前端源码 | 零改动，`git diff --stat frontend/` 只有一个 `favicon.ico` |
| tag 管理 | 新开 tag 而非移动 `.2`：`git update-ref` 精确还原 `.2` 的 tag 对象，远端 `.2` 无需 force push |

> **镜像 tag 与源码 tag 要一一对应。** 改了 `.2` 的源码却把镜像仍打成 `.2`，
> 部署时会出现「镜像比 tag 新」的情况，后续排查会很痛苦。
> 加了新内容就新开一个 tag + 同名镜像，别覆盖旧 tag。

### B.3 该机特有的坑（已在正文与故障排查表中标注）

1. **umask 是 0077** —— 宿主机构建出来的静态文件是 0600/0700，nginx worker 读不到 → 403。
   宿主机构建路径必须 `chmod -R a+rX`；跑上游冒烟脚本要包一层 `umask 022`。
2. **registry-mirrors 里有坏的** —— `dockerpull.cn` 返回校验失败的镜像，`atomhub.openatom.cn`
   对按 digest 锁定的镜像返回 404，只有 `docker.m.daocloud.io` 可用。
3. **容器内 npm 装不动** —— npmmirror 的 CDN 域名很慢（每个 tarball 136～225 s，还间歇
   ECONNRESET），容器又没缓存，标准 `docker build` 会跑到 290 s 超时。宿主机构建是热的（8 s）。
4. **DNS 被污染** —— `auth.docker.io` 在本机解析到 `face:b00c`（Facebook 段），
   直连必然超时；这正是基础镜像拉取迟迟不动的根因之一。
5. **别在仓库里用容器跑 `npm ci`** —— 会留下 root 属主的 `node_modules`，导致宿主机
   `npm ci` 报 EACCES。

> `node:24-bookworm-slim` 按 digest 从 `docker.m.daocloud.io` 拉取耗时较长
> （约 400 MB）。**建议首次打包前先单独把这张镜像拉好**，别让构建卡在这。
> 中断过的 pull 会保留已下载的层，重新 pull 时会复用。

---

## 参考

- 上游开发指南：`website-docs/06-development/01-dev-guide.md`
- 品牌定制源码：`frontend/src/config/branding.ts`
- 品牌维护脚本：`frontend/scripts/{check-branding,apply-branding,list-brand-text}.mjs`
- 前端 Dockerfile：`frontend/Dockerfile`
- 通用构建脚本：`scripts/build_images.sh`、`scripts/get_version.sh`
- 子路径部署：`docs/subpath-deployment.md`
