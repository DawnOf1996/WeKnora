#!/usr/bin/env bash
set -euo pipefail

#
# 私有封装版本镜像构建脚本
#
# 一站式完成：拉取自建 tag → 检出代码 → 构建镜像 →（可选）推送私有仓库。
#
# 用法:
#   ./scripts/build_private_images.sh                        # 前端镜像，默认 tag
#   ./scripts/build_private_images.sh --tag v0.9.1-private   # 指定 tag
#   ./scripts/build_private_images.sh --frontend              # 仅前端
#   ./scripts/build_private_images.sh --all                   # 前端 + app + docreader
#   ./scripts/build_private_images.sh --registry registry.example.com/weknora --push
#
# 关键点：
#   fetch 一定要带 --force。仓库里的私有 tag 是 annotated tag，
#   本地一旦存在旧版本，普通 `git fetch --tags` 会被 "would clobber existing tag"
#   拒绝更新，必须 --force 强制刷新，否则会拿旧 commit 打包。
#

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "${ROOT_DIR}"

# ── 默认参数 ──
GIT_TAG="v0.9.1-private"
IMAGE_REPO="wechatopenai"
BUILD_FRONTEND=true
BUILD_APP=false
BUILD_DOCREADER=false
REGISTRY=""
DO_PUSH=false
DO_FETCH=true
ALLOW_DIRTY=false
HOST_BUILD=false
PLATFORM=""
NPM_REGISTRY="${NPM_REGISTRY:-https://registry.npmmirror.com}"
IMAGE_VERSION=""
NODE_BIN_DIR="${NODE_BIN_DIR:-}"

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; BLUE='\033[0;34m'; NC='\033[0m'
log_info()  { echo -e "${BLUE}[INFO]${NC} $*"; }
log_ok()    { echo -e "${GREEN}[OK]${NC} $*"; }
log_warn()  { echo -e "${YELLOW}[WARN]${NC} $*"; }
log_error() { echo -e "${RED}[ERROR]${NC} $*"; }
die()       { log_error "$*"; exit 1; }

show_help() {
    cat <<'EOF'
私有封装镜像构建脚本

用法: scripts/build_private_images.sh [选项]

选项:
  -t, --tag <tag>        要构建的 git tag（默认 v0.9.1-private，发新版本时记得改）
  -f, --frontend         仅构建前端镜像（默认行为）
  -a, --app              构建 app 镜像
  -d, --docreader        构建 docreader 镜像
      --all              构建全部镜像（前端 + app + docreader）
  -r, --registry <ns>    私有仓库命名空间前缀，如 registry.example.com/weknora
                         不填则使用上游名 wechatopenai/*，docker-compose 无需改动
  -v, --image-version    镜像 tag（默认取 git tag 名，如 v0.9.1-private）
      --push             构建后推送到私有仓库
      --no-fetch         跳过 git fetch，直接用本地已有的 tag
      --host-build       宿主机构建 vite 产物后再打 runtime 镜像
                         （用于 builder 基础镜像拉不下来的场景）
      --allow-dirty      允许在工作区不干净时构建（默认拒绝）
      --platform <p>     构建平台，如 linux/amd64（默认按宿主机自动检测）
      --npm-registry <u> npm 源（默认 https://registry.npmmirror.com）
  -h, --help             显示帮助

示例:
  # 拉取 tag 并构建前端镜像
  ./scripts/build_private_images.sh

  # 构建全部镜像并推送到私有仓库
  ./scripts/build_private_images.sh --all --registry registry.example.com/weknora --push
EOF
}

while [ "$#" -gt 0 ]; do
    case "$1" in
        -t|--tag)          GIT_TAG="$2"; shift 2 ;;
        -f|--frontend)     BUILD_FRONTEND=true; BUILD_APP=false; BUILD_DOCREADER=false; shift ;;
        -a|--app)          BUILD_APP=true; shift ;;
        -d|--docreader)    BUILD_DOCREADER=true; shift ;;
        --all)             BUILD_FRONTEND=true; BUILD_APP=true; BUILD_DOCREADER=true; shift ;;
        -r|--registry)     REGISTRY="$2"; shift 2 ;;
        -v|--image-version) IMAGE_VERSION="$2"; shift 2 ;;
        --push)            DO_PUSH=true; shift ;;
        --no-fetch)        DO_FETCH=false; shift ;;
        --host-build)      HOST_BUILD=true; shift ;;
        --allow-dirty)     ALLOW_DIRTY=true; shift ;;
        --platform)        PLATFORM="$2"; shift 2 ;;
        --npm-registry)    NPM_REGISTRY="$2"; shift 2 ;;
        -h|--help)         show_help; exit 0 ;;
        *) log_error "未知选项: $1"; show_help; exit 1 ;;
    esac
done

# ── 平台检测 ──
if [ -z "${PLATFORM}" ]; then
    case "$(uname -m)" in
        x86_64)  PLATFORM="linux/amd64" ;;
        aarch64|arm64) PLATFORM="linux/arm64" ;;
        *) PLATFORM="linux/amd64" ;;
    esac
fi

# 镜像 tag 只能用小写字母数字和 .-_ ，git tag 可能带斜杠（如 release/1.0）
if [ -z "${IMAGE_VERSION}" ]; then
    IMAGE_VERSION="$(printf '%s' "${GIT_TAG}" | tr '/' '-' | tr 'A-Z' 'a-z')"
fi
if ! printf '%s' "${IMAGE_VERSION}" | grep -qE '^[a-z0-9][a-z0-9._-]{0,127}$'; then
    die "非法镜像 tag: ${IMAGE_VERSION}（只允许小写字母、数字与 . - _）"
fi

NAMESPACE="${REGISTRY:+${REGISTRY}/}${IMAGE_REPO}"

echo "=============================================="
echo " WeKnora 私有封装镜像构建"
echo "=============================================="
log_info "git tag        : ${GIT_TAG}"
log_info "镜像 tag       : ${IMAGE_VERSION}"
log_info "镜像命名空间   : ${NAMESPACE}"
log_info "构建平台       : ${PLATFORM}"
log_info "npm 源         : ${NPM_REGISTRY}"
echo ""

# ── 环境检查 ──
command -v docker >/dev/null 2>&1 || die "未找到 docker，请先安装 Docker"
docker info >/dev/null 2>&1 || die "Docker 服务未运行"
command -v git >/dev/null 2>&1 || die "未找到 git"
export DOCKER_BUILDKIT=1

# ── Step 1: 拉取 tag ──
if [ "${DO_FETCH}" = true ]; then
    log_info "拉取远端 tag（--force 强制刷新本地已存在的旧 tag）..."
    git fetch origin --force --tags --prune || die "git fetch 失败（检查网络与仓库访问权限）"
fi

git rev-parse --verify "refs/tags/${GIT_TAG}" >/dev/null 2>&1 \
    || die "本地不存在 tag: ${GIT_TAG}（先确认远端已推送该 tag）"

TAG_COMMIT="$(git rev-parse "${GIT_TAG}^{commit}")"
log_ok "tag ${GIT_TAG} -> ${TAG_COMMIT}"

# ── Step 2: 检出（工作区必须干净）──
if [ -n "$(git status --porcelain)" ]; then
    if [ "${ALLOW_DIRTY}" = true ]; then
        log_warn "工作区不干净，仍继续构建（--allow-dirty）。产物可能与 tag 不一致："
        git status --short | head -20 | sed 's/^/         /'
    else
        log_error "工作区不干净，请先 git stash / 提交，或加 --allow-dirty 强制构建："
        git status --short | head -20 | sed 's/^/         /'
        die "已中止"
    fi
fi

log_info "检出 ${GIT_TAG}（detached HEAD）..."
git checkout --detach "${GIT_TAG}" >/dev/null 2>&1 || die "检出 ${GIT_TAG} 失败"

HEAD_COMMIT="$(git rev-parse HEAD)"
if [ "${HEAD_COMMIT}" != "${TAG_COMMIT}" ]; then
    die "检出后 HEAD 与 tag 不一致：${HEAD_COMMIT} != ${TAG_COMMIT}"
fi
log_ok "已检出 ${GIT_TAG} @ ${HEAD_COMMIT}"

# ── Step 3: 构建镜像 ──
build_frontend() {
    log_info "构建前端镜像 ${NAMESPACE}/weknora-ui:${IMAGE_VERSION} ..."
    docker build \
        --platform "${PLATFORM}" \
        --build-arg VITE_FRONTEND_COMMIT="$(git rev-parse --short HEAD)" \
        --build-arg NPM_REGISTRY="${NPM_REGISTRY}" \
        -f frontend/Dockerfile \
        -t "${NAMESPACE}/weknora-ui:${IMAGE_VERSION}" \
        -t "${NAMESPACE}/weknora-ui:latest" \
        frontend/
    log_ok "前端镜像构建完成"
}

# 宿主机构建 vite 产物 + runtime-only 镜像。
# 用于 builder 基础镜像（node:24-bookworm-slim）拉不下来的场景。
build_frontend_host() {
    log_info "[host-build] 检查 Node 工具链..."
    local node_bin=""
    if [ -n "${NODE_BIN_DIR}" ]; then
        node_bin="${NODE_BIN_DIR}"
    elif command -v node >/dev/null 2>&1; then
        node_bin="$(dirname "$(command -v node)")"
    fi
    [ -n "${node_bin}" ] || die "[host-build] 未找到 node，可用 NODE_BIN_DIR 指定"

    local node_major
    node_major="$("${node_bin}/node" -v | sed 's/^v\([0-9]*\).*/\1/')"
    log_info "[host-build] 使用 node $("${node_bin}/node" -v)（${node_bin}）"
    # Vite 7 要求 Node 20.19+ / 22.12+ / 24
    if [ "${node_major}" -lt 20 ]; then
        die "[host-build] Node ${node_major} 版本过低，Vite 7 需要 20.19+ / 22.12+ / 24（可用 NODE_BIN_DIR 指定）"
    fi

    log_info "[host-build] npm ci ..."
    ( cd frontend && PATH="${node_bin}:${PATH}" npm ci --registry="${NPM_REGISTRY}" --no-audit --no-fund )

    log_info "[host-build] vite build ..."
    ( cd frontend && \
      PATH="${node_bin}:${PATH}" \
      VITE_IS_DOCKER=true \
      VITE_FRONTEND_COMMIT="$(git rev-parse --short HEAD)" \
      NODE_OPTIONS="--max-old-space-size=8192" \
      npm run build )

    # 宿主机 umask 常为 0077，产物会是 0600/0700，nginx worker（非 root）读不到 → 403
    chmod -R a+rX frontend/dist

    log_info "[host-build] 暂存构建上下文 ..."
    local stage
    stage="$(mktemp -d)"
    cp -r frontend/dist "${stage}/"
    cp frontend/nginx.conf frontend/nginx-api-proxy.conf frontend/nginx-http.conf \
       frontend/docker-entrypoint.sh "${stage}/"
    chmod -R a+rX "${stage}"

    log_info "[host-build] 构建 runtime 镜像 ${NAMESPACE}/weknora-ui:${IMAGE_VERSION} ..."
    docker build -f- -t "${NAMESPACE}/weknora-ui:${IMAGE_VERSION}" -t "${NAMESPACE}/weknora-ui:latest" "${stage}" <<'DOCKERFILE'
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
DOCKERFILE
    rm -rf "${stage}"
    log_ok "前端镜像构建完成（host-build）"
}

build_app() {
    log_info "构建应用镜像 ${NAMESPACE}/weknora-app:${IMAGE_VERSION} ..."
    local version commit build_time
    version="$(cat VERSION 2>/dev/null | tr -d '\n\r' || echo unknown)"
    commit="$(git rev-parse --short HEAD)"
    build_time="$(date -u '+%Y-%m-%d %H:%M:%S UTC')"
    docker build \
        --platform "${PLATFORM}" \
        --build-arg VERSION_ARG="${version}" \
        --build-arg COMMIT_ID_ARG="${commit}" \
        --build-arg BUILD_TIME_ARG="${build_time}" \
        --build-arg GOPROXY_ARG="${GOPROXY:-https://goproxy.cn,direct}" \
        -f docker/Dockerfile.app \
        -t "${NAMESPACE}/weknora-app:${IMAGE_VERSION}" \
        -t "${NAMESPACE}/weknora-app:latest" \
        .
    log_ok "应用镜像构建完成"
}

build_docreader() {
    log_info "构建文档读取器镜像 ${NAMESPACE}/weknora-docreader:${IMAGE_VERSION} ..."
    local version commit
    version="$(cat VERSION 2>/dev/null | tr -d '\n\r' || echo unknown)"
    commit="$(git rev-parse --short HEAD)"
    docker build \
        --platform "${PLATFORM}" \
        --build-arg VERSION_ARG="${version}" \
        --build-arg COMMIT_ID_ARG="${commit}" \
        -f docker/Dockerfile.docreader \
        -t "${NAMESPACE}/weknora-docreader:${IMAGE_VERSION}" \
        -t "${NAMESPACE}/weknora-docreader:latest" \
        .
    log_ok "文档读取器镜像构建完成"
}

IMAGES_TO_PUSH=()
if [ "${BUILD_FRONTEND}" = true ]; then
    if [ "${HOST_BUILD}" = true ]; then
        build_frontend_host
    else
        build_frontend
    fi
    IMAGES_TO_PUSH+=("weknora-ui")
fi
[ "${BUILD_APP}" = true ]      && { build_app;      IMAGES_TO_PUSH+=("weknora-app"); }
[ "${BUILD_DOCREADER}" = true ] && { build_docreader; IMAGES_TO_PUSH+=("weknora-docreader"); }

[ ${#IMAGES_TO_PUSH[@]} -eq 0 ] && die "没有指定要构建的镜像"

# ── Step 4: 推送 ──
if [ "${DO_PUSH}" = true ]; then
    if [ -z "${REGISTRY}" ]; then
        die "--push 需要配合 --registry <命名空间> 使用，避免误推到上游仓库"
    fi
    for img in "${IMAGES_TO_PUSH[@]}"; do
        log_info "推送 ${NAMESPACE}/${img}:${IMAGE_VERSION} ..."
        docker push "${NAMESPACE}/${img}:${IMAGE_VERSION}"
        docker push "${NAMESPACE}/${img}:latest"
    done
    log_ok "镜像推送完成"
fi

# ── Step 5: 汇总 ──
echo ""
log_ok "构建完成。本地镜像："
for img in "${IMAGES_TO_PUSH[@]}"; do
    docker images "${NAMESPACE}/${img}" --format "  {{.Repository}}:{{.Tag}}  {{.Size}}  {{.CreatedSince}}" | head -3
done
echo ""
log_info "部署时在 .env 中设置 WEKNORA_VERSION=${IMAGE_VERSION}"
if [ -n "${REGISTRY}" ]; then
    log_warn "使用了自定义命名空间 ${NAMESPACE}，docker-compose.yml 中的镜像名需同步改写"
fi
log_info "恢复主分支: git checkout main"
