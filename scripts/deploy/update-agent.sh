#!/usr/bin/env bash

set -Eeuo pipefail

APP_SERVICE="${APP_SERVICE:-qq-farm-bot}"
COMPOSE_APP_SERVICE="${COMPOSE_APP_SERVICE:-${APP_SERVICE}}"
APP_CONTAINER_NAME_INPUT="${APP_CONTAINER_NAME:-}"
APP_CONTAINER_NAME="${APP_CONTAINER_NAME_INPUT:-${STACK_NAME}-bot}"
DEPLOY_DIR="${DEPLOY_DIR:-$(pwd)}"
DEPLOY_BASE_DIR="${DEPLOY_BASE_DIR:-/opt}"
STACK_NAME="${STACK_NAME:-qq-farm}"
CURRENT_LINK_INPUT="${CURRENT_LINK:-}"
CURRENT_LINK="${CURRENT_LINK_INPUT:-${DEPLOY_BASE_DIR}/qq-farm-current}"
REPO_SLUG="${REPO_SLUG:-smdk000/qq-farm-ui-pro-max}"
REPO_REF="${REPO_REF:-main}"
RAW_BASE_URL="${RAW_BASE_URL:-https://raw.githubusercontent.com/${REPO_SLUG}/${REPO_REF}}"
OFFICIAL_DOCKERHUB_APP_IMAGE="${OFFICIAL_DOCKERHUB_APP_IMAGE:-smdk000/qq-farm-bot-ui}"
AGENT_INTERVAL="${AGENT_INTERVAL:-15}"
AGENT_ID_INPUT="${UPDATE_AGENT_ID:-}"
AGENT_ID="${AGENT_ID_INPUT:-$(hostname 2>/dev/null || echo host)-update-agent}"
RUN_ONCE=1
DOCKER=(docker)
SUDO=""
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
STACK_LAYOUT_PATH="${SCRIPT_DIR}/stack-layout.sh"
if [ ! -f "${STACK_LAYOUT_PATH}" ]; then
    BOOTSTRAP_DIR="${TMPDIR:-/tmp}/qq-farm-deploy-bootstrap/${REPO_SLUG//\//_}/${REPO_REF}"
    mkdir -p "${BOOTSTRAP_DIR}"
    STACK_LAYOUT_PATH="${BOOTSTRAP_DIR}/stack-layout.sh"
    if [ ! -f "${STACK_LAYOUT_PATH}" ]; then
        command -v curl >/dev/null 2>&1 || {
            echo "[ERROR] 缺少 stack-layout.sh 且系统未安装 curl，无法继续执行。" >&2
            exit 1
        }
        curl -fsSL "${RAW_BASE_URL}/scripts/deploy/stack-layout.sh" -o "${STACK_LAYOUT_PATH}"
    fi
fi
# shellcheck source=stack-layout.sh
. "${STACK_LAYOUT_PATH}"
AGENT_LOG_DIR=""
MYSQL_SERVICE_NAME="${MYSQL_SERVICE_NAME:-mysql}"
MYSQL_USER="${MYSQL_USER:-qq_farm_user}"
MYSQL_PASSWORD="${MYSQL_PASSWORD:-qq007qq008}"
MYSQL_DATABASE="${MYSQL_DATABASE:-qq_farm}"
APP_IMAGE="${APP_IMAGE:-${OFFICIAL_DOCKERHUB_APP_IMAGE}:4.5.42}"
UPDATE_DEFAULT_DRAIN_NODE_IDS="${UPDATE_DEFAULT_DRAIN_NODE_IDS:-}"
DRAIN_WAIT_TIMEOUT="${DRAIN_WAIT_TIMEOUT:-300}"
DRAIN_WAIT_INTERVAL="${DRAIN_WAIT_INTERVAL:-5}"
UPDATE_AGENT_MANAGED_NODE_IDS="${UPDATE_AGENT_MANAGED_NODE_IDS:-${WORKER_NODE_ID:-}}"
CURRENT_LINK_EXPLICIT=0
AGENT_ID_EXPLICIT=0
APP_CONTAINER_NAME_EXPLICIT=0

if [ -n "${CURRENT_LINK_INPUT}" ]; then
    CURRENT_LINK_EXPLICIT=1
fi
if [ -n "${AGENT_ID_INPUT}" ]; then
    AGENT_ID_EXPLICIT=1
fi
if [ -n "${APP_CONTAINER_NAME_INPUT}" ]; then
    APP_CONTAINER_NAME_EXPLICIT=1
fi

print_info() { echo "[INFO] $1"; }
print_success() { echo "[OK] $1"; }
print_warning() { echo "[WARN] $1"; }
print_error() { echo "[ERROR] $1"; }

refresh_managed_node_ids() {
    if [ -z "${UPDATE_AGENT_MANAGED_NODE_IDS:-}" ] && [ -n "${WORKER_NODE_ID:-}" ]; then
        UPDATE_AGENT_MANAGED_NODE_IDS="${WORKER_NODE_ID}"
    fi
    UPDATE_AGENT_MANAGED_NODE_IDS="$(normalize_csv_list "${UPDATE_AGENT_MANAGED_NODE_IDS:-}")"
}

refresh_stack_layout() {
    STACK_NAME="$(normalize_stack_name "${STACK_NAME:-qq-farm}")"
    if [ "${CURRENT_LINK_EXPLICIT}" != "1" ]; then
        CURRENT_LINK="$(stack_current_link_path "${DEPLOY_BASE_DIR}" "${STACK_NAME}")"
    fi
    if [ "${APP_CONTAINER_NAME_EXPLICIT}" != "1" ]; then
        APP_CONTAINER_NAME="$(stack_container_name "${STACK_NAME}" "bot")"
    fi
    if [ "${AGENT_ID_EXPLICIT}" != "1" ]; then
        AGENT_ID="${STACK_NAME}-$(hostname 2>/dev/null || echo host)-update-agent"
    fi
}

parse_args() {
    while [ "$#" -gt 0 ]; do
        case "$1" in
            --deploy-dir)
                DEPLOY_DIR="${2:-}"
                shift 2
                ;;
            --stack-name)
                STACK_NAME="${2:-}"
                shift 2
                ;;
            --interval)
                AGENT_INTERVAL="${2:-15}"
                shift 2
                ;;
            --agent-id)
                AGENT_ID="${2:-}"
                AGENT_ID_EXPLICIT=1
                shift 2
                ;;
            --once)
                RUN_ONCE=1
                shift
                ;;
            --loop)
                RUN_ONCE=0
                shift
                ;;
            *)
                print_error "Unknown argument: $1"
                exit 1
                ;;
        esac
    done

    refresh_stack_layout
}

if [ "${EUID:-$(id -u)}" -ne 0 ] && command -v sudo >/dev/null 2>&1 && sudo -n true >/dev/null 2>&1; then
    SUDO="sudo"
fi

ensure_docker() {
    if ! command -v docker >/dev/null 2>&1; then
        print_error "Docker is required"
        exit 1
    fi

    if docker info >/dev/null 2>&1; then
        DOCKER=(docker)
    elif [ -n "${SUDO}" ] && "${SUDO}" docker info >/dev/null 2>&1; then
        DOCKER=("${SUDO}" docker)
    else
        print_error "Docker daemon is not reachable"
        exit 1
    fi

    "${DOCKER[@]}" compose version >/dev/null 2>&1 || {
        print_error "Docker compose v2 is required"
        exit 1
    }
}

canonicalize_dir() {
    local dir="$1"
    if [ -d "${dir}" ]; then
        (cd "${dir}" && pwd -P)
    fi
}

load_deploy_env() {
    local file="$1"
    if [ -f "${file}" ]; then
        set -a
        # shellcheck disable=SC1090
        . "${file}"
        set +a
        refresh_stack_layout
        refresh_managed_node_ids
    fi
}

resolve_deploy_dir() {
    if [ -f "${DEPLOY_DIR}/docker-compose.yml" ]; then
        DEPLOY_DIR="$(canonicalize_dir "${DEPLOY_DIR}")"
        load_deploy_env "${DEPLOY_DIR}/.env"
        return 0
    fi

    if [ -L "${CURRENT_LINK}" ] || [ -d "${CURRENT_LINK}" ]; then
        if [ -f "${CURRENT_LINK}/docker-compose.yml" ]; then
            DEPLOY_DIR="$(canonicalize_dir "${CURRENT_LINK}")"
            load_deploy_env "${DEPLOY_DIR}/.env"
            return 0
        fi
    fi

    print_error "Could not find deploy directory. Use --deploy-dir or run from an active deployment."
    exit 1
}

ensure_agent_log_dir() {
    AGENT_LOG_DIR="${DEPLOY_DIR}/logs"
    mkdir -p "${AGENT_LOG_DIR}"
}

app_container_exec() {
    local env_args=()
    while [ "$#" -gt 0 ]; do
        case "$1" in
            -e)
                env_args+=(-e "${2:-}")
                shift 2
                ;;
            --)
                shift
                break
                ;;
            *)
                break
                ;;
        esac
    done

    if [ "${#env_args[@]}" -gt 0 ]; then
        "${DOCKER[@]}" exec -i "${env_args[@]}" "${APP_CONTAINER_NAME}" "$@"
    else
        "${DOCKER[@]}" exec -i "${APP_CONTAINER_NAME}" "$@"
    fi
}

run_bridge() {
    app_container_exec \
        -e LOG_LEVEL=error \
        -e FARM_FALLBACK_CONSOLE_LEVEL=silent \
        -e UPDATE_AGENT_ID="${AGENT_ID}" \
        -- \
        node scripts/update-agent-bridge.js "$@"
}

bridge_heartbeat() {
    local status="$1"
    local job_id="${2:-0}"
    local job_status="${3:-}"
    local target_version="${4:-}"
    run_bridge heartbeat \
        --agent-id "${AGENT_ID}" \
        --status "${status}" \
        --managed-node-ids "${UPDATE_AGENT_MANAGED_NODE_IDS}" \
        --job-id "${job_id}" \
        --job-status "${job_status}" \
        --target-version "${target_version}" >/dev/null 2>&1 || true
}

sql_escape() {
    printf '%s' "$1" | sed "s/'/''/g"
}

mysql_mark_failed_fallback() {
    local job_id="$1"
    local summary="$2"
    local error_message="$3"
    local progress="${4:-0}"
    local sql=""

    sql="UPDATE update_jobs SET status='failed', progress_percent=${progress}, summary_message='$(sql_escape "${summary}")', error_message='$(sql_escape "${error_message}")', finished_at=NOW() WHERE id=${job_id};"
    "${DOCKER[@]}" compose exec -T \
        -e MYSQL_PWD="${MYSQL_PASSWORD}" \
        "${MYSQL_SERVICE_NAME}" \
        mysql -u"${MYSQL_USER}" "${MYSQL_DATABASE}" -N -e "${sql}" >/dev/null 2>&1 || true
}

strip_image_tag() {
    local image="$1"
    local last_segment="${image##*/}"
    if [[ "${image}" == *@* ]]; then
        printf '%s\n' "${image%@*}"
        return 0
    fi
    if [[ "${last_segment}" == *:* ]]; then
        printf '%s\n' "${image%:*}"
        return 0
    fi
    printf '%s\n' "${image}"
}

derive_target_image() {
    local target_version="$1"
    local normalized="${target_version#v}"
    local base_image=""

    if [ -n "${APP_IMAGE:-}" ]; then
        base_image="$(strip_image_tag "${APP_IMAGE}")"
    else
        base_image="${OFFICIAL_DOCKERHUB_APP_IMAGE}"
    fi

    if [ -z "${normalized}" ]; then
        normalized="latest"
    fi

    printf '%s:%s\n' "${base_image}" "${normalized}"
}

json_escape() {
    printf '%s' "$1" \
        | sed \
            -e 's/\\/\\\\/g' \
            -e 's/"/\\"/g' \
            -e ':a;N;$!ba;s/\n/\\n/g'
}

json_quote() {
    printf '"%s"' "$(json_escape "$1")"
}

mark_job_status() {
    local job_id="$1"
    local status="$2"
    local summary="$3"
    local progress="$4"
    local error_message="${5:-}"
    local result_json="${6:-}"
    local phase="${7:-}"
    local log_level="${8:-info}"
    local log_message="${9:-${summary}}"
    local verification_json="${10:-}"
    local rollback_payload_json="${11:-}"
    local preflight_json="${12:-}"
    local failure_category="${13:-}"
    local command=(
        set-job-status
        --agent-id "${AGENT_ID}"
        --managed-node-ids "${UPDATE_AGENT_MANAGED_NODE_IDS}"
        --job-id "${job_id}"
        --status "${status}"
        --summary "${summary}"
        --progress "${progress}"
        --error "${error_message}"
        --log-level "${log_level}"
        --log-message "${log_message}"
    )

    if [ -n "${result_json}" ]; then
        command+=(--result-json "${result_json}")
    fi
    if [ -n "${phase}" ]; then
        command+=(--phase "${phase}")
    fi
    if [ -n "${verification_json}" ]; then
        command+=(--verification-json "${verification_json}")
    fi
    if [ -n "${rollback_payload_json}" ]; then
        command+=(--rollback-payload-json "${rollback_payload_json}")
    fi
    if [ -n "${preflight_json}" ]; then
        command+=(--preflight-json "${preflight_json}")
    fi
    if [ -n "${failure_category}" ]; then
        command+=(--failure-category "${failure_category}")
    fi

    if run_bridge "${command[@]}" >/dev/null 2>&1; then
        return 0
    fi

    if [ "${status}" = "failed" ]; then
        mysql_mark_failed_fallback "${job_id}" "${summary}" "${error_message}" "${progress}"
    fi
    return 0
}

claim_job() {
    run_bridge claim --agent-id "${AGENT_ID}" --managed-node-ids "${UPDATE_AGENT_MANAGED_NODE_IDS}" --format tsv 2>/dev/null || true
}

get_job_record() {
    local job_id="$1"
    run_bridge get-job --job-id "${job_id}" --format tsv 2>/dev/null || true
}

get_job_status() {
    local job_id="$1"
    local output=""

    output="$(get_job_record "${job_id}")"
    if [ -z "${output}" ] || [ "${output}" = "NONE" ]; then
        return 0
    fi

    printf '%s\n' "${output}" | awk -F '\t' '$1 == "JOB" { print $4; exit }'
}

job_is_cancelled() {
    local status=""
    status="$(get_job_status "$1")"
    [ "${status}" = "cancelled" ]
}

normalize_csv_list() {
    printf '%s' "$1" \
        | awk '
            BEGIN { RS = "[,\n\r\t ]+" }
            NF {
                if (!seen[$0]++) {
                    if (out != "") {
                        out = out "," $0
                    } else {
                        out = $0
                    }
                }
            }
            END { print out }
        '
}

list_connected_cluster_nodes() {
    local output=""
    output="$(run_bridge get-runtime --format tsv 2>/dev/null || true)"
    if [ -z "${output}" ] || [ "${output}" = "NONE" ]; then
        return 0
    fi

    printf '%s\n' "${output}" \
        | awk -F '\t' '$1 == "NODE" && $3 == "1" { print $2 }' \
        | paste -sd, -
}

resolve_drain_node_ids() {
    local requested_csv=""
    local resolved_csv=""

    requested_csv="$(normalize_csv_list "${1:-}")"
    if [ -n "${requested_csv}" ]; then
        printf '%s\n' "${requested_csv}"
        return 0
    fi

    resolved_csv="$(normalize_csv_list "${UPDATE_DEFAULT_DRAIN_NODE_IDS:-}")"
    if [ -n "${resolved_csv}" ]; then
        printf '%s\n' "${resolved_csv}"
        return 0
    fi

    resolved_csv="$(normalize_csv_list "${WORKER_NODE_ID:-}")"
    if [ -n "${resolved_csv}" ]; then
        printf '%s\n' "${resolved_csv}"
        return 0
    fi
}

set_node_drain_state() {
    local node_csv="$1"
    local draining="$2"
    local node_id=""

    if [ -z "${node_csv}" ]; then
        return 0
    fi

    for node_id in $(printf '%s' "${node_csv}" | tr ',' '\n'); do
        [ -n "${node_id}" ] || continue
        run_bridge set-node-drain \
            --agent-id "${AGENT_ID}" \
            --node-id "${node_id}" \
            --draining "${draining}" >/dev/null
    done
}

wait_for_nodes_drained() {
    local job_id="$1"
    local node_csv="$2"
    local output=""
    local pending=""
    local elapsed=0

    if [ -z "${node_csv}" ]; then
        return 0
    fi

    while [ "${elapsed}" -le "${DRAIN_WAIT_TIMEOUT}" ]; do
        if [ -n "${job_id}" ] && job_is_cancelled "${job_id}"; then
            print_warning "Job ${job_id} was cancelled while waiting for nodes to drain"
            return 2
        fi
        output="$(run_bridge get-runtime --format tsv --node-ids "${node_csv}" 2>/dev/null || true)"
        if [ -z "${output}" ] || [ "${output}" = "NONE" ]; then
            print_warning "Drain wait skipped: cluster runtime currently has no matching nodes (${node_csv})"
            return 0
        fi

        pending="$(printf '%s\n' "${output}" | awk -F '\t' '$1 == "NODE" && $3 == "1" && ($5 + 0) > 0 { print $2 ":" $5 }')"
        if [ -z "${pending}" ]; then
            print_success "Drain target nodes are idle: ${node_csv}"
            return 0
        fi

        print_info "Waiting for nodes to drain: $(printf '%s' "${pending}" | tr '\n' ' ' | sed 's/[[:space:]]\+/ /g')"
        sleep "${DRAIN_WAIT_INTERVAL}"
        elapsed=$((elapsed + DRAIN_WAIT_INTERVAL))
    done

    print_error "Timed out waiting for nodes to drain: ${node_csv}"
    return 1
}

run_verification_after_update() {
    local job_id="$1"
    local log_file="$2"
    local target_version="$3"
    local output_file=""

    output_file="${AGENT_LOG_DIR}/update-job-${job_id}-verify-$(date +%Y%m%d_%H%M%S).log"
    mark_job_status "${job_id}" "running" "Running verify-stack.sh" 92 "" "" "verify"

    if bash "${DEPLOY_DIR}/verify-stack.sh" --deploy-dir "${DEPLOY_DIR}" > >(tee -a "${log_file}" "${output_file}") 2> >(tee -a "${log_file}" "${output_file}" >&2); then
        LAST_VERIFICATION_JSON="{\"ok\":true,\"verifiedAt\":$(date +%s),\"targetVersion\":$(json_quote "${target_version}"),\"verifyLogFile\":$(json_quote "${output_file}")}"
        return 0
    fi

    LAST_VERIFICATION_JSON="{\"ok\":false,\"verifiedAt\":$(date +%s),\"targetVersion\":$(json_quote "${target_version}"),\"verifyLogFile\":$(json_quote "${output_file}")}"
    return 1
}

sync_announcements_after_update() {
    local job_id="$1"
    local target_version="$2"

    mark_job_status "${job_id}" "running" "Syncing announcements after update" 96 "" "" "sync_announcements"
    if run_bridge sync-announcements --created-by update_agent --mark-installed "${target_version}" >/dev/null 2>&1; then
        LAST_SYNC_RESULT_JSON="{\"ok\":true,\"syncedAt\":$(date +%s),\"targetVersion\":$(json_quote "${target_version}")}"
        return 0
    fi

    LAST_SYNC_RESULT_JSON="{\"ok\":false,\"syncedAt\":$(date +%s),\"targetVersion\":$(json_quote "${target_version}")}"
    return 1
}

run_update_job() {
    local job_id="$1"
    local job_key="$2"
    local scope="$3"
    local strategy="$4"
    local target_version="$5"
    local preserve_current="$6"
    local require_drain="$7"
    local requested_drain_node_ids="${8:-}"
    local kind="${9:-app_update}"
    local execution_phase="${10:-queued}"
    local sync_announcements="${11:-0}"
    local run_verification="${12:-1}"
    local allow_auto_rollback="${13:-0}"
    local include_deploy_templates="${14:-1}"
    local source_version="${15:-}"
    local target_image=""
    local log_file=""
    local result_json=""
    local drain_node_csv=""
    local drain_applied=0
    local drain_skipped=0
    local drain_restore_ok=1
    local wait_status=0
    local metadata_file=""
    local rollback_payload_json=""
    local old_image=""
    local new_image=""
    local auto_rollback_json="null"
    local action_label="Update"
    local action_label_lower="update"

    LAST_VERIFICATION_JSON=""
    LAST_SYNC_RESULT_JSON=""

    if [ "${kind}" = "rollback_update" ]; then
        action_label="Rollback"
        action_label_lower="rollback"
    fi

    print_info "Claimed job ${job_key} (${kind}/${scope}/${strategy}) -> ${target_version}"

    if job_is_cancelled "${job_id}"; then
        print_warning "Job ${job_key} was cancelled before execution started"
        bridge_heartbeat "idle"
        return 0
    fi

    case "${scope}" in
        app|worker|cluster)
            ;;
        *)
            mark_job_status "${job_id}" "failed" "Unsupported scope for current host agent" 0 "scope ${scope} is not supported yet by update-agent.sh" "" "preflight" "error" "Unsupported scope for current host agent" "" "" "" "script_error"
            bridge_heartbeat "error"
            return 1
            ;;
    esac

    case "${strategy}" in
        in_place|rolling|drain_and_cutover)
            ;;
        *)
            mark_job_status "${job_id}" "failed" "Unsupported strategy for current host agent" 0 "strategy ${strategy} is not supported yet by update-agent.sh" "" "preflight" "error" "Unsupported strategy for current host agent" "" "" "" "script_error"
            bridge_heartbeat "error"
            return 1
            ;;
    esac

    if [ "${strategy}" = "drain_and_cutover" ]; then
        require_drain="1"
    fi

    target_image="$(derive_target_image "${target_version}")"
    log_file="${AGENT_LOG_DIR}/update-job-${job_id}-$(date +%Y%m%d_%H%M%S).log"
    metadata_file="${AGENT_LOG_DIR}/update-job-${job_id}-metadata.env"
    rollback_payload_json="{\"previousVersion\":$(json_quote "${source_version}"),\"rollbackCommandSummary\":$(json_quote "update-app.sh --deploy-dir ${DEPLOY_DIR} --image $(derive_target_image "${source_version}")")}"

    mark_job_status "${job_id}" "running" "Preflight accepted by update agent" 5 "" "" "preflight"

    if [ "${require_drain}" = "1" ]; then
        drain_node_csv="$(resolve_drain_node_ids "${requested_drain_node_ids}")"
        if [ -n "${drain_node_csv}" ]; then
            print_info "Applying drain to nodes: ${drain_node_csv}"
            mark_job_status "${job_id}" "running" "Applying drain state to worker nodes" 8 "" "{\"targetImage\":$(json_quote "${target_image}"),\"preserveCurrent\":${preserve_current},\"requireDrain\":true,\"drainNodeIds\":$(json_quote "${drain_node_csv}")}" "preflight"
            if ! set_node_drain_state "${drain_node_csv}" "1"; then
                mark_job_status "${job_id}" "failed" "Failed to enable drain state before update" 0 "Could not mark target worker nodes as draining" "" "preflight" "error" "Failed to enable drain state before update" "" "" "" "health_check_failed"
                bridge_heartbeat "error"
                return 1
            fi
            drain_applied=1
            mark_job_status "${job_id}" "running" "Waiting for worker nodes to drain" 15 "" "{\"targetImage\":$(json_quote "${target_image}"),\"preserveCurrent\":${preserve_current},\"requireDrain\":true,\"drainNodeIds\":$(json_quote "${drain_node_csv}")}" "preflight"
            wait_status=0
            wait_for_nodes_drained "${job_id}" "${drain_node_csv}" || wait_status=$?
            if [ "${wait_status}" = "2" ]; then
                set_node_drain_state "${drain_node_csv}" "0" >/dev/null 2>&1 || true
                result_json="{\"targetImage\":$(json_quote "${target_image}"),\"drainNodeIds\":$(json_quote "${drain_node_csv}"),\"drainApplied\":${drain_applied},\"drainSkipped\":${drain_skipped},\"drainRestoreOk\":true,\"cancelledBeforeDeploy\":true}"
                mark_job_status "${job_id}" "cancelled" "Update cancelled before invoking update-app.sh" 0 "" "${result_json}" "preflight"
                bridge_heartbeat "idle"
                return 0
            fi
            if [ "${wait_status}" != "0" ]; then
                set_node_drain_state "${drain_node_csv}" "0" >/dev/null 2>&1 || true
                mark_job_status "${job_id}" "failed" "Timed out while waiting for worker drain" 0 "Timed out waiting for drain target nodes to stop carrying assignments" "" "preflight" "error" "Timed out while waiting for worker drain" "" "" "" "drain_timeout"
                bridge_heartbeat "error"
                return 1
            fi
        else
            local available_nodes=""
            drain_skipped=1
            available_nodes="$(list_connected_cluster_nodes)"
            if [ -n "${available_nodes}" ]; then
                print_warning "requireDrain enabled, but no explicit drain nodes were resolved. Online nodes: ${available_nodes}. Continuing without drain protection."
            else
                print_warning "requireDrain enabled, but no cluster nodes were resolved. Continuing without drain protection."
            fi
            mark_job_status "${job_id}" "running" "No cluster nodes resolved for drain, continuing update" 12 "" "{\"targetImage\":$(json_quote "${target_image}"),\"preserveCurrent\":${preserve_current},\"requireDrain\":true,\"drainSkipped\":true}" "preflight" "warn" "No cluster nodes resolved for drain, continuing update"
        fi
    fi

    if job_is_cancelled "${job_id}"; then
        if [ "${drain_applied}" = "1" ]; then
            set_node_drain_state "${drain_node_csv}" "0" >/dev/null 2>&1 || true
        fi
        result_json="{\"targetImage\":$(json_quote "${target_image}"),\"drainNodeIds\":$(json_quote "${drain_node_csv}"),\"drainApplied\":${drain_applied},\"drainSkipped\":${drain_skipped},\"drainRestoreOk\":true,\"cancelledBeforeDeploy\":true}"
        mark_job_status "${job_id}" "cancelled" "Update cancelled before invoking update-app.sh" 0 "" "${result_json}" "preflight"
        bridge_heartbeat "idle"
        print_warning "Job ${job_key} was cancelled before update-app.sh started"
        return 0
    fi

    mark_job_status "${job_id}" "running" "Recording rollback snapshot before update" 18 "" "${rollback_payload_json}" "backup"
    mark_job_status "${job_id}" "running" "Invoking update-app.sh" 20 "" "{\"targetImage\":$(json_quote "${target_image}"),\"preserveCurrent\":${preserve_current},\"requireDrain\":${require_drain},\"drainNodeIds\":$(json_quote "${drain_node_csv}"),\"drainApplied\":${drain_applied},\"drainSkipped\":${drain_skipped},\"allowAutoRollback\":${allow_auto_rollback},\"includeDeployTemplates\":${include_deploy_templates}}" "apply_update"
    bridge_heartbeat "running" "${job_id}" "running" "${target_version}"

    if UPDATE_ENABLE_PHASE_REPORTING=1 \
        UPDATE_AGENT_JOB_ID="${job_id}" \
        UPDATE_AGENT_ID="${AGENT_ID}" \
        UPDATE_AGENT_MANAGED_NODE_IDS="${UPDATE_AGENT_MANAGED_NODE_IDS}" \
        UPDATE_METADATA_FILE="${metadata_file}" \
        bash "${DEPLOY_DIR}/update-app.sh" --deploy-dir "${DEPLOY_DIR}" --image "${target_image}" > >(tee -a "${log_file}") 2> >(tee -a "${log_file}" >&2); then
        if [ "${drain_applied}" = "1" ]; then
            print_info "Restoring traffic to drained nodes: ${drain_node_csv}"
            if ! set_node_drain_state "${drain_node_csv}" "0"; then
                drain_restore_ok=0
                print_warning "Failed to clear drain state after successful update: ${drain_node_csv}"
            fi
        fi
        if [ -f "${metadata_file}" ]; then
            # shellcheck disable=SC1090
            . "${metadata_file}"
            old_image="${OLD_IMAGE:-}"
            new_image="${NEW_IMAGE:-}"
        fi
        rollback_payload_json="{\"previousVersion\":$(json_quote "${source_version}"),\"previousImage\":$(json_quote "${old_image}"),\"currentImageDigest\":$(json_quote "${new_image}"),\"rollbackCommandSummary\":$(json_quote "update-app.sh --deploy-dir ${DEPLOY_DIR} --image ${old_image}")}"

        if [ "${run_verification}" = "1" ] || [ "${run_verification}" = "true" ]; then
            if ! run_verification_after_update "${job_id}" "${log_file}" "${target_version}"; then
                result_json="{\"targetImage\":$(json_quote "${target_image}"),\"logFile\":$(json_quote "${log_file}"),\"finishedAt\":$(date +%s),\"drainNodeIds\":$(json_quote "${drain_node_csv}"),\"drainApplied\":${drain_applied},\"drainSkipped\":${drain_skipped},\"drainRestoreOk\":${drain_restore_ok},\"verification\":${LAST_VERIFICATION_JSON:-null},\"executionPhase\":\"verify\"}"
                mark_job_status "${job_id}" "failed" "Verification failed after ${action_label_lower}" 0 "verify-stack.sh exited with non-zero status" "${result_json}" "verify" "error" "Verification failed after ${action_label_lower}" "${LAST_VERIFICATION_JSON}" "${rollback_payload_json}" "" "verification_failed"
                bridge_heartbeat "error"
                print_error "Job ${job_key} failed during verification"
                return 1
            fi
        fi

        if [ "${sync_announcements}" = "1" ] || [ "${sync_announcements}" = "true" ]; then
            if ! sync_announcements_after_update "${job_id}" "${target_version}"; then
                print_warning "Announcement sync failed after update job ${job_key}"
            fi
        fi

        result_json="{\"targetImage\":$(json_quote "${target_image}"),\"logFile\":$(json_quote "${log_file}"),\"finishedAt\":$(date +%s),\"drainNodeIds\":$(json_quote "${drain_node_csv}"),\"drainApplied\":${drain_applied},\"drainSkipped\":${drain_skipped},\"drainRestoreOk\":${drain_restore_ok},\"verification\":${LAST_VERIFICATION_JSON:-null},\"announcementSync\":${LAST_SYNC_RESULT_JSON:-null},\"executionPhase\":\"done\"}"
        mark_job_status "${job_id}" "succeeded" "${action_label} completed" 100 "" "${result_json}" "done" "info" "${action_label} completed" "${LAST_VERIFICATION_JSON}" "${rollback_payload_json}"
        bridge_heartbeat "idle"
        print_success "${action_label} job ${job_key} completed"
        return 0
    fi

    local exit_code=$?
    local tail_text=""
    local failure_category="script_error"
    if [ "${drain_applied}" = "1" ]; then
        print_warning "Update failed, restoring traffic to drained nodes: ${drain_node_csv}"
        if ! set_node_drain_state "${drain_node_csv}" "0"; then
            drain_restore_ok=0
            print_warning "Failed to clear drain state after update failure: ${drain_node_csv}"
        fi
    fi
    if { [ "${allow_auto_rollback}" = "1" ] || [ "${allow_auto_rollback}" = "true" ]; } && [ -n "${source_version}" ]; then
        local rollback_image=""
        rollback_image="$(derive_target_image "${source_version}")"
        print_warning "Update failed, attempting auto rollback to ${source_version}"
        mark_job_status "${job_id}" "running" "Attempting auto rollback after update failure" 94 "" "" "rollback"
        if UPDATE_ENABLE_PHASE_REPORTING=0 \
            bash "${DEPLOY_DIR}/update-app.sh" --deploy-dir "${DEPLOY_DIR}" --image "${rollback_image}" > >(tee -a "${log_file}") 2> >(tee -a "${log_file}" >&2); then
            auto_rollback_json="{\"ok\":true,\"rolledBackAt\":$(date +%s),\"targetVersion\":$(json_quote "${source_version}"),\"targetImage\":$(json_quote "${rollback_image}")}"
            print_success "Auto rollback succeeded for job ${job_key}"
        else
            auto_rollback_json="{\"ok\":false,\"rolledBackAt\":$(date +%s),\"targetVersion\":$(json_quote "${source_version}"),\"targetImage\":$(json_quote "${rollback_image}")}"
            failure_category="rollback_failed"
            print_error "Auto rollback failed for job ${job_key}"
        fi
    fi
    tail_text="$(tail -n 40 "${log_file}" 2>/dev/null | tr '\n' ' ' | sed 's/[[:space:]]\+/ /g' | cut -c1-450)"
    result_json="{\"targetImage\":$(json_quote "${target_image}"),\"logFile\":$(json_quote "${log_file}"),\"drainNodeIds\":$(json_quote "${drain_node_csv}"),\"drainApplied\":${drain_applied},\"drainSkipped\":${drain_skipped},\"drainRestoreOk\":${drain_restore_ok},\"autoRollback\":${auto_rollback_json}}"
    mark_job_status "${job_id}" "failed" "${action_label} execution failed" 0 "${tail_text:-update-app.sh exited with non-zero status}" "${result_json}" "" "error" "${action_label} execution failed" "" "${rollback_payload_json}" "" "${failure_category}"
    if [ "${failure_category}" = "rollback_failed" ]; then
        bridge_heartbeat "error"
    else
        bridge_heartbeat "idle"
    fi
    print_error "${action_label} job ${job_key} failed"
    return "${exit_code}"
}

run_once_cycle() {
    local claim_output=""
    local marker=""
    local job_id=""
    local job_key=""
    local scope=""
    local strategy=""
    local target_version=""
    local source_version=""
    local preserve_current=""
    local require_drain=""
    local drain_node_ids=""
    local kind=""
    local execution_phase=""
    local sync_announcements="0"
    local run_verification="1"
    local allow_auto_rollback="0"
    local include_deploy_templates="1"

    bridge_heartbeat "idle"
    claim_output="$(claim_job)"
    if [ -z "${claim_output}" ] || [ "${claim_output}" = "NONE" ]; then
        print_info "No pending update jobs"
        return 0
    fi

    IFS=$'\t' read -r marker job_id job_key scope strategy target_version source_version preserve_current require_drain drain_node_ids kind execution_phase sync_announcements run_verification allow_auto_rollback include_deploy_templates <<EOF
${claim_output}
EOF

    if [ "${marker}" != "JOB" ] || [ -z "${job_id}" ]; then
        print_warning "Unexpected claim output: ${claim_output}"
        return 1
    fi

    run_update_job "${job_id}" "${job_key}" "${scope}" "${strategy}" "${target_version}" "${preserve_current}" "${require_drain}" "${drain_node_ids}" "${kind}" "${execution_phase}" "${sync_announcements}" "${run_verification}" "${allow_auto_rollback}" "${include_deploy_templates}" "${source_version}"
}

main() {
    parse_args "$@"
    ensure_docker
    resolve_deploy_dir
    load_deploy_env "${DEPLOY_DIR}/.env"
    APP_SERVICE="${APP_SERVICE:-qq-farm-bot}"
    COMPOSE_APP_SERVICE="${COMPOSE_APP_SERVICE:-${APP_SERVICE}}"
    MYSQL_SERVICE_NAME="${MYSQL_SERVICE_NAME:-mysql}"
    APP_IMAGE="${APP_IMAGE:-${OFFICIAL_DOCKERHUB_APP_IMAGE}:4.5.42}"
    refresh_managed_node_ids
    ensure_agent_log_dir

    print_info "Update agent id: ${AGENT_ID}"
    print_info "Deploy dir: ${DEPLOY_DIR}"

    if [ "${RUN_ONCE}" = "1" ]; then
        run_once_cycle
        return 0
    fi

    while true; do
        run_once_cycle || true
        sleep "${AGENT_INTERVAL}"
    done
}

main "$@"
