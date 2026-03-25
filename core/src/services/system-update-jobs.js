const crypto = require('node:crypto');
const { getPool, transaction } = require('./mysql-db');
const {
    parseJsonSafely,
    toTimestamp,
} = require('./system-update-utils');

const UPDATE_JOB_STATUS = Object.freeze({
    PENDING: 'pending',
    CLAIMED: 'claimed',
    RUNNING: 'running',
    SUCCEEDED: 'succeeded',
    FAILED: 'failed',
    CANCELLED: 'cancelled',
});

const UPDATE_SCOPE_OPTIONS = new Set(['app', 'worker', 'cluster']);
const UPDATE_STRATEGY_OPTIONS = new Set(['in_place', 'rolling', 'parallel_new_dir', 'drain_and_cutover']);
const UPDATE_KIND_OPTIONS = new Set(['app_update', 'worker_update', 'cluster_update', 'rollback_update']);
const UPDATE_EXECUTION_PHASE_OPTIONS = new Set([
    'queued',
    'preflight',
    'backup',
    'pull_image',
    'stop_stack',
    'apply_update',
    'start_stack',
    'verify',
    'sync_announcements',
    'rollback',
    'done',
]);
const UPDATE_FAILURE_CATEGORY_OPTIONS = new Set([
    'preflight_blocked',
    'drain_timeout',
    'pull_failed',
    'verification_failed',
    'rollback_failed',
    'manual_cancelled',
    'script_error',
    'health_check_failed',
]);
const UPDATE_JOB_LOG_LEVEL_OPTIONS = new Set(['debug', 'info', 'warn', 'error']);

function normalizeBatchKey(batchKey) {
    return String(batchKey || '').trim().slice(0, 64);
}

function normalizeAgentId(agentId) {
    return String(agentId || '').trim().slice(0, 128);
}

function normalizeJobStatus(status, fallback = UPDATE_JOB_STATUS.PENDING) {
    const value = String(status || '').trim().toLowerCase();
    return Object.values(UPDATE_JOB_STATUS).includes(value) ? value : fallback;
}

function normalizeScope(scope, fallback = 'app') {
    const value = String(scope || '').trim().toLowerCase();
    return UPDATE_SCOPE_OPTIONS.has(value) ? value : fallback;
}

function normalizeStrategy(strategy, fallback = 'rolling') {
    const value = String(strategy || '').trim().toLowerCase();
    return UPDATE_STRATEGY_OPTIONS.has(value) ? value : fallback;
}

function normalizeKind(kind, fallback = 'app_update') {
    const value = String(kind || '').trim().toLowerCase();
    return UPDATE_KIND_OPTIONS.has(value) ? value : fallback;
}

function normalizeExecutionPhase(value, fallback = 'queued') {
    const text = String(value || '').trim().toLowerCase();
    return UPDATE_EXECUTION_PHASE_OPTIONS.has(text) ? text : fallback;
}

function normalizeFailureCategory(value, fallback = '') {
    const text = String(value || '').trim().toLowerCase();
    return UPDATE_FAILURE_CATEGORY_OPTIONS.has(text) ? text : fallback;
}

function normalizeJobLogLevel(value, fallback = 'info') {
    const text = String(value || '').trim().toLowerCase();
    return UPDATE_JOB_LOG_LEVEL_OPTIONS.has(text) ? text : fallback;
}

function normalizeNodeIdList(input) {
    if (!Array.isArray(input)) return [];
    return Array.from(new Set(input.map(item => String(item || '').trim()).filter(Boolean)));
}

function normalizeObject(value) {
    return value && typeof value === 'object' ? value : null;
}

function buildJobKey() {
    return `upd_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
}

function buildResultSignature(input = {}) {
    const payload = JSON.stringify({
        status: normalizeJobStatus(input.status, ''),
        executionPhase: normalizeExecutionPhase(input.executionPhase, ''),
        summaryMessage: String(input.summaryMessage || '').trim(),
        errorMessage: String(input.errorMessage || '').trim(),
        result: normalizeObject(input.result),
        verification: normalizeObject(input.verification),
        rollbackPayload: normalizeObject(input.rollbackPayload),
    });
    return crypto.createHash('sha1').update(payload).digest('hex');
}

function mapJobRow(row) {
    if (!row) return null;
    return {
        id: Number(row.id) || 0,
        jobKey: String(row.job_key || '').trim(),
        kind: normalizeKind(row.kind),
        scope: normalizeScope(row.scope),
        strategy: normalizeStrategy(row.strategy),
        status: normalizeJobStatus(row.status),
        sourceVersion: String(row.source_version || '').trim(),
        targetVersion: String(row.target_version || '').trim(),
        batchKey: normalizeBatchKey(row.batch_key),
        preserveCurrent: !!row.preserve_current,
        requireDrain: !!row.require_drain,
        drainNodeIds: normalizeNodeIdList(parseJsonSafely(row.drain_node_ids, [])),
        note: String(row.note || '').trim(),
        createdBy: String(row.created_by || '').trim(),
        targetAgentId: normalizeAgentId(row.target_agent_id),
        claimAgentId: normalizeAgentId(row.claim_agent_id),
        progressPercent: Math.max(0, Math.min(100, Number.parseInt(row.progress_percent, 10) || 0)),
        summaryMessage: String(row.summary_message || '').trim(),
        payload: parseJsonSafely(row.payload_json, null),
        result: parseJsonSafely(row.result_json, null),
        preflight: parseJsonSafely(row.preflight_json, null),
        rollbackPayload: parseJsonSafely(row.rollback_payload_json, null),
        verification: parseJsonSafely(row.verification_json, null),
        resultSignature: String(row.result_signature || '').trim(),
        executionPhase: normalizeExecutionPhase(row.execution_phase),
        errorMessage: String(row.error_message || '').trim(),
        claimedAt: toTimestamp(row.claimed_at),
        startedAt: toTimestamp(row.started_at),
        finishedAt: toTimestamp(row.finished_at),
        createdAt: toTimestamp(row.created_at),
        updatedAt: toTimestamp(row.updated_at),
    };
}

function mapJobLogRow(row) {
    if (!row) return null;
    return {
        id: Number(row.id) || 0,
        jobId: Number(row.job_id) || 0,
        phase: normalizeExecutionPhase(row.phase),
        level: normalizeJobLogLevel(row.level),
        message: String(row.message || '').trim(),
        payload: parseJsonSafely(row.payload_json, null),
        createdAt: toTimestamp(row.created_at),
    };
}

function buildBatchNodeMap(items = []) {
    const perNodePhase = {};
    const perNodeErrorSummary = {};
    const perNodeFailureCategory = {};
    const failedCategories = {};
    let runningNodeCount = 0;
    let blockedNodeCount = 0;
    let failedNodeCount = 0;

    for (const item of items) {
        const managedNodeIds = normalizeNodeIdList(
            parseJsonSafely(item && item.payload && item.payload.options && item.payload.options.managedNodeIds, []),
        );
        const targetNodes = managedNodeIds.length > 0
            ? managedNodeIds
            : normalizeNodeIdList(item && item.drainNodeIds);
        const failureCategory = normalizeFailureCategory(
            item && item.result && item.result.failureCategory,
            '',
        );
        if (failureCategory) {
            failedCategories[failureCategory] = (failedCategories[failureCategory] || 0) + 1;
        }
        for (const nodeId of targetNodes) {
            perNodePhase[nodeId] = item.executionPhase || item.status || 'queued';
            if (item.errorMessage) {
                perNodeErrorSummary[nodeId] = item.errorMessage;
            }
            if (failureCategory) {
                perNodeFailureCategory[nodeId] = failureCategory;
            }
        }
    }

    Object.entries(perNodePhase).forEach(([nodeId, phase]) => {
        const normalizedPhase = String(phase || '').trim();
        const failureCategory = String(perNodeFailureCategory[nodeId] || '').trim();
        if (['preflight'].includes(normalizedPhase) || failureCategory === 'preflight_blocked') {
            blockedNodeCount += 1;
        } else if (['backup', 'pull_image', 'stop_stack', 'apply_update', 'start_stack', 'verify', 'sync_announcements', 'rollback'].includes(normalizedPhase)) {
            runningNodeCount += 1;
        }
        if (perNodeErrorSummary[nodeId]) {
            failedNodeCount += 1;
        }
    });

    return {
        runningNodeCount,
        blockedNodeCount,
        failedNodeCount,
        perNodePhase,
        perNodeErrorSummary,
        failedCategories,
    };
}

async function listUpdateJobs(options = {}) {
    const pool = getPool();
    const limit = Math.max(1, Math.min(200, Number.parseInt(options.limit, 10) || 20));
    const statuses = Array.isArray(options.statuses)
        ? options.statuses.map(item => normalizeJobStatus(item, '')).filter(Boolean)
        : [];
    const batchKey = normalizeBatchKey(options.batchKey);
    const agentId = normalizeAgentId(options.agentId);

    let sql = 'SELECT * FROM update_jobs';
    const params = [];
    const clauses = [];
    if (statuses.length > 0) {
        clauses.push(`status IN (${statuses.map(() => '?').join(',')})`);
        params.push(...statuses);
    }
    if (batchKey) {
        clauses.push('batch_key = ?');
        params.push(batchKey);
    }
    if (agentId) {
        clauses.push('(target_agent_id = ? OR claim_agent_id = ?)');
        params.push(agentId, agentId);
    }
    if (clauses.length > 0) {
        sql += ` WHERE ${clauses.join(' AND ')}`;
    }
    sql += ' ORDER BY id DESC LIMIT ?';
    params.push(limit);

    const [rows] = await pool.query(sql, params);
    return (rows || []).map(mapJobRow).filter(Boolean);
}

async function getUpdateJobById(idOrKey) {
    const pool = getPool();
    const text = String(idOrKey || '').trim();
    if (!text) return null;
    const isNumericId = /^\d+$/.test(text);
    const [rows] = await pool.query(
        isNumericId
            ? 'SELECT * FROM update_jobs WHERE id = ? LIMIT 1'
            : 'SELECT * FROM update_jobs WHERE job_key = ? LIMIT 1',
        [isNumericId ? Number(text) : text],
    );
    return mapJobRow(rows && rows[0]);
}

async function findActiveUpdateJob() {
    const jobs = await listUpdateJobs({
        limit: 1,
        statuses: [UPDATE_JOB_STATUS.PENDING, UPDATE_JOB_STATUS.CLAIMED, UPDATE_JOB_STATUS.RUNNING],
    });
    return jobs[0] || null;
}

async function createUpdateJob(input = {}) {
    const jobKey = buildJobKey();
    const record = {
        jobKey,
        kind: normalizeKind(input.kind),
        scope: normalizeScope(input.scope),
        strategy: normalizeStrategy(input.strategy),
        status: normalizeJobStatus(input.status),
        sourceVersion: String(input.sourceVersion || '').trim(),
        targetVersion: String(input.targetVersion || '').trim(),
        batchKey: normalizeBatchKey(input.batchKey),
        preserveCurrent: !!input.preserveCurrent,
        requireDrain: !!input.requireDrain,
        drainNodeIds: normalizeNodeIdList(input.drainNodeIds),
        note: String(input.note || '').trim(),
        createdBy: String(input.createdBy || '').trim(),
        targetAgentId: normalizeAgentId(input.targetAgentId),
        claimAgentId: normalizeAgentId(input.claimAgentId),
        progressPercent: Math.max(0, Math.min(100, Number.parseInt(input.progressPercent, 10) || 0)),
        summaryMessage: String(input.summaryMessage || '').trim(),
        payload: normalizeObject(input.payload),
        result: normalizeObject(input.result),
        preflight: normalizeObject(input.preflight),
        rollbackPayload: normalizeObject(input.rollbackPayload),
        verification: normalizeObject(input.verification),
        executionPhase: normalizeExecutionPhase(input.executionPhase, input.status === 'running' ? 'preflight' : 'queued'),
        errorMessage: String(input.errorMessage || '').trim(),
    };
    const resultSignature = String(input.resultSignature || '').trim() || buildResultSignature({
        status: record.status,
        executionPhase: record.executionPhase,
        summaryMessage: record.summaryMessage,
        errorMessage: record.errorMessage,
        result: record.result,
        verification: record.verification,
        rollbackPayload: record.rollbackPayload,
    });

    const insertId = await transaction(async (conn) => {
        const [result] = await conn.query(
            `INSERT INTO update_jobs (
                job_key, kind, scope, strategy, status, source_version, target_version,
                batch_key, preserve_current, require_drain, drain_node_ids, note, created_by, target_agent_id, claim_agent_id,
                progress_percent, summary_message, payload_json, result_json, preflight_json, rollback_payload_json,
                verification_json, result_signature, execution_phase, error_message,
                claimed_at, started_at, finished_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                record.jobKey,
                record.kind,
                record.scope,
                record.strategy,
                record.status,
                record.sourceVersion,
                record.targetVersion,
                record.batchKey,
                record.preserveCurrent ? 1 : 0,
                record.requireDrain ? 1 : 0,
                record.drainNodeIds.length > 0 ? JSON.stringify(record.drainNodeIds) : null,
                record.note,
                record.createdBy,
                record.targetAgentId,
                record.claimAgentId,
                record.progressPercent,
                record.summaryMessage,
                record.payload ? JSON.stringify(record.payload) : null,
                record.result ? JSON.stringify(record.result) : null,
                record.preflight ? JSON.stringify(record.preflight) : null,
                record.rollbackPayload ? JSON.stringify(record.rollbackPayload) : null,
                record.verification ? JSON.stringify(record.verification) : null,
                resultSignature,
                record.executionPhase,
                record.errorMessage,
                input.claimedAt ? new Date(input.claimedAt) : null,
                input.startedAt ? new Date(input.startedAt) : null,
                input.finishedAt ? new Date(input.finishedAt) : null,
            ],
        );
        return Number(result.insertId) || 0;
    });

    return getUpdateJobById(insertId);
}

async function updateUpdateJob(idOrKey, patch = {}) {
    const target = await getUpdateJobById(idOrKey);
    if (!target) return null;

    const assignments = [];
    const params = [];
    const applyValue = (field, value) => {
        assignments.push(`${field} = ?`);
        params.push(value);
    };

    const nextPreview = {
        status: patch.status !== undefined ? normalizeJobStatus(patch.status, target.status) : target.status,
        executionPhase: patch.executionPhase !== undefined ? normalizeExecutionPhase(patch.executionPhase, target.executionPhase) : target.executionPhase,
        summaryMessage: patch.summaryMessage !== undefined ? String(patch.summaryMessage || '').trim() : target.summaryMessage,
        errorMessage: patch.errorMessage !== undefined ? String(patch.errorMessage || '').trim() : target.errorMessage,
        result: patch.result !== undefined ? normalizeObject(patch.result) : target.result,
        verification: patch.verification !== undefined ? normalizeObject(patch.verification) : target.verification,
        rollbackPayload: patch.rollbackPayload !== undefined ? normalizeObject(patch.rollbackPayload) : target.rollbackPayload,
    };

    if (patch.status !== undefined) applyValue('status', nextPreview.status);
    if (patch.strategy !== undefined) applyValue('strategy', normalizeStrategy(patch.strategy, target.strategy));
    if (patch.scope !== undefined) applyValue('scope', normalizeScope(patch.scope, target.scope));
    if (patch.targetVersion !== undefined) applyValue('target_version', String(patch.targetVersion || '').trim());
    if (patch.sourceVersion !== undefined) applyValue('source_version', String(patch.sourceVersion || '').trim());
    if (patch.batchKey !== undefined) applyValue('batch_key', normalizeBatchKey(patch.batchKey));
    if (patch.note !== undefined) applyValue('note', String(patch.note || '').trim());
    if (patch.targetAgentId !== undefined) applyValue('target_agent_id', normalizeAgentId(patch.targetAgentId));
    if (patch.claimAgentId !== undefined) applyValue('claim_agent_id', normalizeAgentId(patch.claimAgentId));
    if (patch.summaryMessage !== undefined) applyValue('summary_message', nextPreview.summaryMessage);
    if (patch.errorMessage !== undefined) applyValue('error_message', nextPreview.errorMessage);
    if (patch.progressPercent !== undefined) applyValue('progress_percent', Math.max(0, Math.min(100, Number.parseInt(patch.progressPercent, 10) || 0)));
    if (patch.preserveCurrent !== undefined) applyValue('preserve_current', patch.preserveCurrent ? 1 : 0);
    if (patch.requireDrain !== undefined) applyValue('require_drain', patch.requireDrain ? 1 : 0);
    if (patch.drainNodeIds !== undefined) {
        const drainNodeIds = normalizeNodeIdList(patch.drainNodeIds);
        applyValue('drain_node_ids', drainNodeIds.length > 0 ? JSON.stringify(drainNodeIds) : null);
    }
    if (patch.payload !== undefined) applyValue('payload_json', patch.payload ? JSON.stringify(patch.payload) : null);
    if (patch.result !== undefined) applyValue('result_json', nextPreview.result ? JSON.stringify(nextPreview.result) : null);
    if (patch.preflight !== undefined) applyValue('preflight_json', patch.preflight ? JSON.stringify(patch.preflight) : null);
    if (patch.rollbackPayload !== undefined) applyValue('rollback_payload_json', nextPreview.rollbackPayload ? JSON.stringify(nextPreview.rollbackPayload) : null);
    if (patch.verification !== undefined) applyValue('verification_json', nextPreview.verification ? JSON.stringify(nextPreview.verification) : null);
    if (patch.executionPhase !== undefined) applyValue('execution_phase', nextPreview.executionPhase);
    if (patch.resultSignature !== undefined) {
        applyValue('result_signature', String(patch.resultSignature || '').trim());
    } else if (
        patch.status !== undefined
        || patch.executionPhase !== undefined
        || patch.summaryMessage !== undefined
        || patch.errorMessage !== undefined
        || patch.result !== undefined
        || patch.verification !== undefined
        || patch.rollbackPayload !== undefined
    ) {
        applyValue('result_signature', buildResultSignature(nextPreview));
    }
    if (patch.claimedAt !== undefined) applyValue('claimed_at', patch.claimedAt ? new Date(patch.claimedAt) : null);
    if (patch.startedAt !== undefined) applyValue('started_at', patch.startedAt ? new Date(patch.startedAt) : null);
    if (patch.finishedAt !== undefined) applyValue('finished_at', patch.finishedAt ? new Date(patch.finishedAt) : null);

    if (assignments.length === 0) {
        return target;
    }

    const pool = getPool();
    await pool.query(
        `UPDATE update_jobs SET ${assignments.join(', ')} WHERE id = ?`,
        [...params, target.id],
    );

    return getUpdateJobById(target.id);
}

async function appendUpdateJobLog(input = {}) {
    const pool = getPool();
    const jobId = Math.max(0, Number.parseInt(input.jobId, 10) || 0);
    if (!jobId) {
        return null;
    }
    const phase = normalizeExecutionPhase(input.phase, 'queued');
    const level = normalizeJobLogLevel(input.level, 'info');
    const message = String(input.message || '').trim();
    const payload = normalizeObject(input.payload);

    const [result] = await pool.query(
        `INSERT INTO update_job_logs (job_id, phase, level, message, payload_json)
         VALUES (?, ?, ?, ?, ?)`,
        [
            jobId,
            phase,
            level,
            message,
            payload ? JSON.stringify(payload) : null,
        ],
    );

    const insertId = Number(result.insertId) || 0;
    const [rows] = await pool.query(
        'SELECT * FROM update_job_logs WHERE id = ? LIMIT 1',
        [insertId],
    );
    return mapJobLogRow(rows && rows[0]);
}

async function listUpdateJobLogs(options = {}) {
    const pool = getPool();
    const jobId = Math.max(0, Number.parseInt(options.jobId, 10) || 0);
    if (!jobId) {
        return [];
    }
    const limit = Math.max(1, Math.min(200, Number.parseInt(options.limit, 10) || 50));
    const beforeId = Math.max(0, Number.parseInt(options.beforeId, 10) || 0);
    const phase = normalizeExecutionPhase(options.phase, '');
    const levels = Array.isArray(options.levels)
        ? options.levels.map(item => normalizeJobLogLevel(item, '')).filter(Boolean)
        : [];
    const clauses = ['job_id = ?'];
    const params = [jobId];
    if (beforeId > 0) {
        clauses.push('id < ?');
        params.push(beforeId);
    }
    if (phase) {
        clauses.push('phase = ?');
        params.push(phase);
    }
    if (levels.length > 0) {
        clauses.push(`level IN (${levels.map(() => '?').join(',')})`);
        params.push(...levels);
    }
    params.push(limit);

    const [rows] = await pool.query(
        `SELECT *
         FROM update_job_logs
         WHERE ${clauses.join(' AND ')}
         ORDER BY id DESC
         LIMIT ?`,
        params,
    );
    return (rows || []).map(mapJobLogRow).filter(Boolean);
}

async function claimNextUpdateJob(agentId) {
    const normalizedAgentId = String(agentId || '').trim();
    if (!normalizedAgentId) {
        throw new Error('agentId is required');
    }

    return transaction(async (conn) => {
        const [rows] = await conn.query(
            `SELECT id
             FROM update_jobs
             WHERE status = ?
               AND (target_agent_id = '' OR target_agent_id = ?)
             ORDER BY id ASC
             LIMIT 1
             FOR UPDATE`,
            [UPDATE_JOB_STATUS.PENDING, normalizedAgentId],
        );
        const row = rows && rows[0];
        if (!row || !row.id) {
            return null;
        }
        await conn.query(
            `UPDATE update_jobs
             SET status = ?, claim_agent_id = ?, claimed_at = CURRENT_TIMESTAMP
             WHERE id = ?`,
            [UPDATE_JOB_STATUS.CLAIMED, normalizedAgentId, Number(row.id)],
        );
        return Number(row.id);
    }).then((jobId) => {
        if (!jobId) return null;
        return getUpdateJobById(jobId);
    });
}

async function findLatestSuccessfulRollbackCandidate(options = {}) {
    const pool = getPool();
    const targetAgentId = normalizeAgentId(options.targetAgentId);
    const params = [UPDATE_JOB_STATUS.SUCCEEDED];
    let sql = 'SELECT * FROM update_jobs WHERE status = ? AND rollback_payload_json IS NOT NULL';
    if (targetAgentId) {
        sql += ' AND (target_agent_id = ? OR claim_agent_id = ?)';
        params.push(targetAgentId, targetAgentId);
    }
    sql += ' ORDER BY finished_at DESC, id DESC LIMIT 1';
    const [rows] = await pool.query(sql, params);
    return mapJobRow(rows && rows[0]);
}

function summarizeUpdateJobBatch(jobs = []) {
    const items = (Array.isArray(jobs) ? jobs : []).filter(Boolean);
    if (items.length === 0) return null;

    const latestJob = items
        .slice()
        .sort((left, right) => (right.updatedAt || right.createdAt || 0) - (left.updatedAt || left.createdAt || 0))[0];
    const progressTotal = items.reduce((sum, item) => sum + (Number(item.progressPercent) || 0), 0);
    const statusCounts = {
        pending: 0,
        claimed: 0,
        running: 0,
        succeeded: 0,
        failed: 0,
        cancelled: 0,
    };
    const childJobsByAgent = {};
    for (const item of items) {
        if (Object.prototype.hasOwnProperty.call(statusCounts, item.status)) {
            statusCounts[item.status] += 1;
        }
        const agentKey = normalizeAgentId(item.targetAgentId || item.claimAgentId || 'unassigned') || 'unassigned';
        if (!childJobsByAgent[agentKey]) {
            childJobsByAgent[agentKey] = [];
        }
        childJobsByAgent[agentKey].push(item);
    }
    const activeCount = statusCounts.pending + statusCounts.claimed + statusCounts.running;
    const failedCount = statusCounts.failed;
    const summaryStatus = activeCount > 0
        ? (statusCounts.running > 0 ? 'running' : (statusCounts.claimed > 0 ? 'claimed' : 'pending'))
        : (failedCount > 0 ? 'failed' : (statusCounts.cancelled === items.length ? 'cancelled' : 'succeeded'));
    const nodeAggregation = buildBatchNodeMap(items);

    return {
        batchKey: normalizeBatchKey(latestJob.batchKey),
        scope: latestJob.scope,
        strategy: latestJob.strategy,
        targetVersion: latestJob.targetVersion,
        sourceVersion: latestJob.sourceVersion,
        total: items.length,
        pendingCount: statusCounts.pending,
        claimedCount: statusCounts.claimed,
        runningCount: statusCounts.running,
        succeededCount: statusCounts.succeeded,
        failedCount: statusCounts.failed,
        cancelledCount: statusCounts.cancelled,
        activeCount,
        progressPercent: Math.max(0, Math.min(100, Math.round(progressTotal / items.length))),
        status: summaryStatus,
        targetAgentIds: Array.from(new Set(items.map(item => normalizeAgentId(item.targetAgentId)).filter(Boolean))),
        claimAgentIds: Array.from(new Set(items.map(item => normalizeAgentId(item.claimAgentId)).filter(Boolean))),
        drainNodeIds: Array.from(new Set(items.flatMap(item => normalizeNodeIdList(item.drainNodeIds)))),
        jobs: items,
        latestJobId: latestJob.id || 0,
        latestJobKey: latestJob.jobKey || '',
        latestSummaryMessage: latestJob.summaryMessage || '',
        latestErrorMessage: latestJob.errorMessage || '',
        executionPhase: latestJob.executionPhase || 'queued',
        childJobsByAgent,
        ...nodeAggregation,
        createdAt: Math.min(...items.map(item => item.createdAt || Date.now())),
        updatedAt: Math.max(...items.map(item => item.updatedAt || item.createdAt || 0)),
    };
}

module.exports = {
    UPDATE_JOB_STATUS,
    UPDATE_EXECUTION_PHASE_OPTIONS,
    UPDATE_FAILURE_CATEGORY_OPTIONS,
    UPDATE_JOB_LOG_LEVEL_OPTIONS,
    buildResultSignature,
    mapJobRow,
    mapJobLogRow,
    listUpdateJobs,
    getUpdateJobById,
    findActiveUpdateJob,
    createUpdateJob,
    updateUpdateJob,
    appendUpdateJobLog,
    listUpdateJobLogs,
    claimNextUpdateJob,
    normalizeJobStatus,
    normalizeScope,
    normalizeStrategy,
    normalizeKind,
    normalizeExecutionPhase,
    normalizeFailureCategory,
    normalizeJobLogLevel,
    normalizeNodeIdList,
    normalizeBatchKey,
    normalizeAgentId,
    summarizeUpdateJobBatch,
    findLatestSuccessfulRollbackCandidate,
};
