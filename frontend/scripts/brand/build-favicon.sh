#!/usr/bin/env bash
#
# 由 brand/favicon.svg 生成 public/favicon.ico —— 站点图标（摊开的书）。
#
# 用法:
#   ./scripts/brand/build-favicon.sh
#
# 为什么只产出 favicon.ico：
#   index.html / embed.html 里引用的是 <link rel="shortcut icon" href="./public/favicon.ico">，
#   保持文件名不变、只替换文件内容，前端源码就不用动 —— 后续合并上游升级时，
#   前端目录只有 public/favicon.ico 这一个文件是分歧点。
#
# 依赖:
#   google-chrome   —— 把 SVG 渲染成 PNG（保留 alpha）
#   python3 + PIL   —— 组装多尺寸 ICO
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FRONTEND_DIR="$(cd "${SCRIPT_DIR}/../.." && pwd)"
PUBLIC_DIR="${FRONTEND_DIR}/public"
SRC="${SCRIPT_DIR}/favicon.svg"

CHROME="$(command -v google-chrome || command -v google-chrome-stable || command -v chromium || command -v chromium-browser || true)"
[ -n "${CHROME}" ] || { echo "ERROR: 未找到 Chrome/Chromium，无法渲染 SVG" >&2; exit 1; }
[ -f "${SRC}" ] || { echo "ERROR: 缺少 ${SRC}" >&2; exit 1; }
python3 -c 'import PIL' 2>/dev/null || { echo "ERROR: 需要 python3 的 Pillow" >&2; exit 1; }

WORK="$(mktemp -d)"
trap 'rm -rf "${WORK}"' EXIT

# 渲染单个尺寸：$1=尺寸 $2=输出名 $3=是否剔除细节
render() {
    local size="$1" out="$2" strip_detail="$3"
    local svg html
    svg="$(cat "${SRC}")"
    if [ "${strip_detail}" = "yes" ]; then
        # 去掉 @favicon:detail ... @favicon:detail 之间的内容
        svg="$(printf '%s' "${svg}" | sed '/@favicon:detail start/,/@favicon:detail end/d')"
    fi
    html="${WORK}/p${size}.html"
    printf '<html><head><style>html,body{margin:0;padding:0;background:transparent}svg{display:block;width:%spx;height:%spx}</style></head><body>%s</body></html>' \
        "${size}" "${size}" "${svg}" > "${html}"
    "${CHROME}" --headless --disable-gpu --no-sandbox --hide-scrollbars \
        --default-background-color=00000000 \
        --screenshot="${WORK}/${out}" --window-size="${size},${size}" \
        "file://${html}" >/dev/null 2>&1
    [ -f "${WORK}/${out}" ] || { echo "ERROR: ${size}px 渲染失败" >&2; exit 1; }
}

echo ">> 渲染各尺寸..."
render 16 fav_16.png yes   # 16px 剔除细节，页面线条会糊成噪点
render 32 fav_32.png no

echo ">> 写出 ${PUBLIC_DIR}/favicon.ico ..."
python3 - "${WORK}" "${PUBLIC_DIR}" <<'PY'
import sys
from PIL import Image

work, public = sys.argv[1], sys.argv[2]

ico16 = Image.open(f"{work}/fav_16.png").convert("RGBA")
ico32 = Image.open(f"{work}/fav_32.png").convert("RGBA")
ico32.save(f"{public}/favicon.ico", format="ICO", sizes=[(16, 16), (32, 32)],
           append_images=[ico16])
print("   public/favicon.ico  16 + 32")
PY

echo ">> 完成。"
