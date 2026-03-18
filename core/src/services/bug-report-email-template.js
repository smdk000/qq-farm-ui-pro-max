function escapeHtml(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function renderList(items = [], formatter) {
    return items
        .map((item, index) => formatter(item, index))
        .filter(Boolean)
        .join('');
}

function renderLogLine(item = {}, index = 0) {
    const time = String(item.time || item.created_at || item.timestamp || '').trim();
    const level = String(item.level || item.tag || item.action || '').trim();
    const message = String(item.message || item.text || item.msg || '').trim();
    const meta = item.meta && typeof item.meta === 'object' && Object.keys(item.meta).length > 0
        ? ` <span style="color:#6b7280">${escapeHtml(JSON.stringify(item.meta))}</span>`
        : '';
    return `<li style="margin:0 0 8px 0"><strong>#${index + 1}</strong> ${escapeHtml(time)} ${escapeHtml(level)} ${escapeHtml(message)}${meta}</li>`;
}

function renderSection(title, bodyHtml) {
    if (!bodyHtml) {
        return '';
    }
    return `
      <section style="margin:0 0 20px 0">
        <h3 style="margin:0 0 10px 0;font-size:15px;color:#111827;">${escapeHtml(title)}</h3>
        ${bodyHtml}
      </section>
    `;
}

function renderKeyValueRows(rows = []) {
    return rows
        .filter(([, value]) => String(value || '').trim())
        .map(([label, value]) => `<tr><td style="padding:6px 12px 6px 0;color:#6b7280;vertical-align:top;">${escapeHtml(label)}</td><td style="padding:6px 0;color:#111827;word-break:break-word;">${escapeHtml(value)}</td></tr>`)
        .join('');
}

function renderBugReportEmailHtml(data = {}) {
    const frontendErrors = Array.isArray(data.frontendErrors) ? data.frontendErrors : [];
    const systemLogs = Array.isArray(data.systemLogsExcerpt) ? data.systemLogsExcerpt : [];
    const runtimeLogs = Array.isArray(data.runtimeLogsExcerpt) ? data.runtimeLogsExcerpt : [];
    const accountLogs = Array.isArray(data.accountLogsExcerpt) ? data.accountLogsExcerpt : [];
    const serverRows = Object.entries(data.serverContext && typeof data.serverContext === 'object' ? data.serverContext : {})
        .map(([key, value]) => [key, typeof value === 'object' ? JSON.stringify(value) : String(value || '')]);

    return `
      <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f5f7fb;padding:24px;color:#111827;">
        <div style="max-width:900px;margin:0 auto;background:#ffffff;border-radius:18px;padding:28px;box-shadow:0 10px 30px rgba(15,23,42,.08);">
          <div style="margin:0 0 24px 0;padding-bottom:16px;border-bottom:1px solid #e5e7eb;">
            <div style="font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#6b7280;">问题反馈</div>
            <h1 style="margin:8px 0 0 0;font-size:22px;line-height:1.4;">${escapeHtml(data.title || '未命名问题')}</h1>
          </div>

          ${renderSection('基本信息', `<table style="width:100%;border-collapse:collapse;">${renderKeyValueRows([
              ['反馈编号', data.reportNo],
              ['提交用户', data.username],
              ['当前账号', data.accountName ? `${data.accountName} (${data.accountId || '-'})` : data.accountId],
              ['问题类型', data.category],
              ['严重程度', data.severity],
              ['当前页面', data.route],
              ['页面标题', data.pageTitle],
              ['联系方式', data.contact],
          ])}</table>`)}

          ${renderSection('问题描述', `
            <div style="white-space:pre-wrap;line-height:1.7;color:#111827;">${escapeHtml(data.description || '')}</div>
            ${data.stepsToReproduce ? `<p style="margin:14px 0 0 0;white-space:pre-wrap;line-height:1.7;"><strong>复现步骤：</strong><br>${escapeHtml(data.stepsToReproduce)}</p>` : ''}
            ${data.expectedResult ? `<p style="margin:14px 0 0 0;white-space:pre-wrap;line-height:1.7;"><strong>期望结果：</strong><br>${escapeHtml(data.expectedResult)}</p>` : ''}
            ${data.actualResult ? `<p style="margin:14px 0 0 0;white-space:pre-wrap;line-height:1.7;"><strong>实际结果：</strong><br>${escapeHtml(data.actualResult)}</p>` : ''}
          `)}

          ${renderSection('客户端上下文', `<table style="width:100%;border-collapse:collapse;">${renderKeyValueRows(Object.entries(data.clientContext && typeof data.clientContext === 'object' ? data.clientContext : {}))}</table>`)}
          ${renderSection('前端错误摘录', frontendErrors.length > 0 ? `<ol style="padding-left:20px;margin:0;">${renderList(frontendErrors, renderLogLine)}</ol>` : '<p style="margin:0;color:#6b7280;">无</p>')}
          ${renderSection('系统日志摘录', systemLogs.length > 0 ? `<ol style="padding-left:20px;margin:0;">${renderList(systemLogs, renderLogLine)}</ol>` : '<p style="margin:0;color:#6b7280;">无</p>')}
          ${renderSection('运行态日志摘录', runtimeLogs.length > 0 ? `<ol style="padding-left:20px;margin:0;">${renderList(runtimeLogs, renderLogLine)}</ol>` : '<p style="margin:0;color:#6b7280;">无</p>')}
          ${renderSection('账号日志摘录', accountLogs.length > 0 ? `<ol style="padding-left:20px;margin:0;">${renderList(accountLogs, renderLogLine)}</ol>` : '<p style="margin:0;color:#6b7280;">无</p>')}
          ${renderSection('服务端上下文', `<table style="width:100%;border-collapse:collapse;">${renderKeyValueRows(serverRows)}</table>`)}
        </div>
      </div>
    `;
}

function renderBlock(title, rows = []) {
    const lines = rows.filter(Boolean);
    if (lines.length === 0) {
        return '';
    }
    return [`## ${title}`, ...lines, ''].join('\n');
}

function renderBugReportEmailText(data = {}) {
    const clientContext = data.clientContext && typeof data.clientContext === 'object' ? data.clientContext : {};
    const serverContext = data.serverContext && typeof data.serverContext === 'object' ? data.serverContext : {};
    const frontendErrors = Array.isArray(data.frontendErrors) ? data.frontendErrors : [];
    const systemLogs = Array.isArray(data.systemLogsExcerpt) ? data.systemLogsExcerpt : [];
    const runtimeLogs = Array.isArray(data.runtimeLogsExcerpt) ? data.runtimeLogsExcerpt : [];
    const accountLogs = Array.isArray(data.accountLogsExcerpt) ? data.accountLogsExcerpt : [];
    const formatLines = (items) => items.map((item, index) => {
        const time = String(item.time || item.created_at || item.timestamp || '').trim();
        const level = String(item.level || item.tag || item.action || '').trim();
        const message = String(item.message || item.text || item.msg || '').trim();
        return `${index + 1}. ${time} ${level} ${message}`.trim();
    });

    return [
        `问题标题: ${String(data.title || '').trim()}`,
        '',
        renderBlock('基本信息', [
            `反馈编号: ${data.reportNo || ''}`,
            `提交用户: ${data.username || ''}`,
            `当前账号: ${data.accountName ? `${data.accountName} (${data.accountId || '-'})` : (data.accountId || '')}`,
            `问题类型: ${data.category || ''}`,
            `严重程度: ${data.severity || ''}`,
            `当前页面: ${data.route || ''}`,
            `页面标题: ${data.pageTitle || ''}`,
            `联系方式: ${data.contact || ''}`,
        ]),
        renderBlock('问题描述', [
            String(data.description || '').trim(),
            data.stepsToReproduce ? `复现步骤: ${String(data.stepsToReproduce || '').trim()}` : '',
            data.expectedResult ? `期望结果: ${String(data.expectedResult || '').trim()}` : '',
            data.actualResult ? `实际结果: ${String(data.actualResult || '').trim()}` : '',
        ]),
        renderBlock('客户端上下文', Object.entries(clientContext).map(([key, value]) => `${key}: ${String(value || '')}`)),
        renderBlock('前端错误摘录', formatLines(frontendErrors)),
        renderBlock('系统日志摘录', formatLines(systemLogs)),
        renderBlock('运行态日志摘录', formatLines(runtimeLogs)),
        renderBlock('账号日志摘录', formatLines(accountLogs)),
        renderBlock('服务端上下文', Object.entries(serverContext).map(([key, value]) => `${key}: ${typeof value === 'object' ? JSON.stringify(value) : String(value || '')}`)),
    ].filter(Boolean).join('\n');
}

module.exports = {
    renderBugReportEmailHtml,
    renderBugReportEmailText,
};
