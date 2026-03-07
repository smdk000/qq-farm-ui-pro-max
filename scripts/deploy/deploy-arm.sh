#!/usr/bin/env bash

set -Eeuo pipefail

ARCH="$(uname -m)"
if [ "${ARCH}" != "aarch64" ] && [ "${ARCH}" != "arm64" ]; then
    echo "当前架构为 ${ARCH}，请改用 scripts/deploy/deploy-x86.sh"
    exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec "${SCRIPT_DIR}/fresh-install.sh" "$@"
