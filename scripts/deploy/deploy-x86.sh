#!/usr/bin/env bash

set -Eeuo pipefail

ARCH="$(uname -m)"
if [ "${ARCH}" != "x86_64" ] && [ "${ARCH}" != "amd64" ]; then
    echo "当前架构为 ${ARCH}，请改用 scripts/deploy/deploy-arm.sh"
    exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec "${SCRIPT_DIR}/fresh-install.sh" "$@"
