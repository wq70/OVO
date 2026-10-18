(function () {
  'use strict';

  const DEFAULT_SETTINGS = {
    id: 'main',
    autoReconnect: true,
    showChatCards: true,
    includeResultDetails: false,
    activityRetentionDays: 30,
    timeoutMs: 20000,
    maxCallsPerTurn: 8,
    maxCatalogTools: 40,
    maxResultLength: 30000
  };

  const CONNECTION_TYPES = {
    remote: {
      label: '远程 MCP 协议服务',
      short: '远程',
      description: '连接支持 Streamable HTTP 的 HTTPS 服务',
      endpoint: true
    },
    computer: {
      label: '电脑节点 (Bridge)',
      short: '电脑',
      description: '连接 Win/Mac 桌面 MCP 桥接端点',
      endpoint: true,
      pairing: true
    },
    termux: {
      label: 'Termux / 安卓终端',
      short: '安卓',
      description: '通过安卓 Termux 中运行的桥接端点连接',
      endpoint: true
    },
    ios_ish: {
      label: 'iOS 执行器 (iSH)',
      short: '苹果',
      description: '连接 iSH 或兼容的 iOS 本地桥接器',
      endpoint: true
    },
    ios_shortcuts: {
      label: '苹果快捷指令',
      short: '快捷指令',
      description: '触发 iOS 原生自动化指令通道',
      shortcut: true
    },
    bluetooth: {
      label: '蓝牙设备 (BLE)',
      short: '蓝牙',
      description: '浏览器直连 BLE，或连接蓝牙桥接端点',
      bluetooth: true
    },
    custom: {
      label: '自定义桥接器',
      short: '自定义',
      description: '连接兼容 MCP 协议的自托管通信通道',
      endpoint: true
    }
  };

  const STATUS_LABELS = {
    online: '已连接',
    offline: '未连接',
    testing: '连接中',
    error: '异常',
    disabled: '已停用',
    paired: '已配对',
    ready: '可启动',
    pending: '待确认',
    running: '执行中',
    success: '已完成',
    failed: '失败',
    cancelled: '已取消'
  };

  const state = {
    connections: [],
    activities: [],
    settings: { ...DEFAULT_SETTINGS },
    activeTab: 'connections',
    initialized: false,
    initializing: false,
    busy: new Set(),
    sessions: new Map(),
    clients: new Map(),
    eventStreams: new Map(),
    subscriptions: new Map()
  };

  let els = {};

  async function showCustomConfirm(title, message, options) {
    if (typeof window.showAppConfirmDialog === 'function') {
      const decision = await window.showAppConfirmDialog({
        title,
        message: String(message || '').replace(/<[^>]+>/g, ''),
        confirmText: options && options.confirmText || '确认',
        cancelText: '取消',
        dismissText: ''
      });
      return decision === 'confirm';
    }
    return window.confirm(`${title}\n\n${String(message || '').replace(/<[^>]+>/g, '')}`);
  }

  async function showCustomAlert(title, message) {
    if (typeof window.showAppConfirmDialog === 'function') {
      await window.showAppConfirmDialog({ title, message: String(message || ''), confirmText: '知道了', cancelText: '取消', dismissText: '' });
      return;
    }
    window.alert(`${title}\n\n${message}`);
  }

  function uid(prefix) {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') {
      return `${prefix}_${window.crypto.randomUUID()}`;
    }
    return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function formatTime(value, includeDate) {
    if (!value) return '暂无';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '暂无';
    const options = includeDate
      ? { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }
      : { hour: '2-digit', minute: '2-digit' };
    return new Intl.DateTimeFormat('zh-CN', options).format(date);
  }

  function truncate(value, maxLength) {
    const text = String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
    if (text.length <= maxLength) return text;
    return `${text.slice(0, Math.max(0, maxLength - 1))}…`;
  }

  function iconSvg(kind) {
    const attrs = 'viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"';
    const icons = {
      remote: `<svg ${attrs}><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18"/></svg>`,
      termux: `<svg ${attrs}><rect x="3" y="4" width="18" height="16" rx="2"/><path d="m7 9 3 3-3 3M12 15h5"/></svg>`,
      ios_ish: `<svg ${attrs}><rect x="6" y="2" width="12" height="20" rx="3"/><path d="M10 18h4"/></svg>`,
      ios_shortcuts: `<svg ${attrs}><path d="m8 7 4-4 4 4-4 4-4-4Z"/><path d="m8 17 4-4 4 4-4 4-4-4Z"/><path d="m4 12 4-4 4 4-4 4-4-4ZM12 12l4-4 4 4-4 4-4-4Z"/></svg>`,
      bluetooth: `<svg ${attrs}><path d="m7 7 10 10-5 4V3l5 4L7 17"/></svg>`,
      computer: `<svg ${attrs}><rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8M12 17v4"/></svg>`,
      custom: `<svg ${attrs}><path d="M9 3H5a2 2 0 0 0-2 2v4M15 3h4a2 2 0 0 1 2 2v4M9 21H5a2 2 0 0 1-2-2v-4M15 21h4a2 2 0 0 0 2-2v-4"/><circle cx="12" cy="12" r="3"/></svg>`,
      activity: `<svg ${attrs}><path d="M4 12h3l2-6 4 12 2-6h5"/></svg>`,
      empty: `<svg ${attrs}><circle cx="6" cy="7" r="2"/><circle cx="18" cy="7" r="2"/><circle cx="12" cy="17" r="2"/><path d="m7.7 8.1 3 7M16.3 8.1l-3 7M8 7h8"/></svg>`
    };
    return icons[kind] || icons.custom;
  }

  function typeInfo(type) {
    return CONNECTION_TYPES[type] || CONNECTION_TYPES.custom;
  }

  function statusClass(connection) {
    if (!connection.enabled) return 'disabled';
    return connection.status || 'offline';
  }

  function statusLabel(connection) {
    return STATUS_LABELS[statusClass(connection)] || '未连接';
  }

  async function loadData() {
    if (!window.dexieDB || !dexieDB.mcpConnections) return;
    const [connections, activities, savedSettings, secrets, subscriptions] = await Promise.all([
      dexieDB.mcpConnections.toArray(),
      dexieDB.mcpActivities.orderBy('createdAt').reverse().limit(300).toArray(),
      dexieDB.mcpSettings.get('main'),
      dexieDB.mcpSecrets.toArray(),
      dexieDB.mcpSubscriptions.toArray()
    ]);
    const secretMap = new Map(secrets.map(item => [item.id, item]));
    state.connections = connections.map(connection => {
      const secret = secretMap.get(connection.id);
      const session = state.sessions.get(connection.id);
      return { ...connection, ...(secret || {}), ...(session || {}), id: connection.id };
    }).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    state.activities = activities;
    state.subscriptions = new Map(subscriptions.map(item => [`${item.connectionId}:${item.uri}`, item]));
    state.settings = {
      ...DEFAULT_SETTINGS,
      ...(savedSettings || {}),
      showChatCards: savedSettings && savedSettings.showChatCards !== undefined ? savedSettings.showChatCards : savedSettings && savedSettings.showCards !== undefined ? savedSettings.showCards : DEFAULT_SETTINGS.showChatCards,
      activityRetentionDays: savedSettings && savedSettings.activityRetentionDays || savedSettings && savedSettings.retentionDays || DEFAULT_SETTINGS.activityRetentionDays,
      maxCallsPerTurn: savedSettings && savedSettings.maxCallsPerTurn || savedSettings && savedSettings.maxCalls || DEFAULT_SETTINGS.maxCallsPerTurn
    };
    const cutoff = Date.now() - (state.settings.activityRetentionDays || 30) * 86400000;
    if (cutoff > 0) {
      dexieDB.mcpActivities.where('createdAt').below(cutoff).delete().catch(error => {
        console.warn('[MCP] 清理过期活动失败:', error);
      });
    }
  }

  async function openMcpScreen() {
    if (typeof window.switchScreen === 'function') window.switchScreen('mcp-screen');
    else if (typeof switchScreen === 'function') switchScreen('mcp-screen');
    await loadData();
    render();
  }

  function updateSummary() {
    if (!els.summaryTitle) return;
    const enabled = state.connections.filter(item => item.enabled);
    const online = enabled.filter(item => ['online', 'paired', 'ready'].includes(item.status));
    const errors = enabled.filter(item => item.status === 'error');
    const capabilities = collectCapabilities();
    const toolCount = capabilities.filter(c => c.kind === 'tools').length;

    const metricActive = document.getElementById('mcp-metric-active');
    const metricTools = document.getElementById('mcp-metric-tools');
    const metricCalls = document.getElementById('mcp-metric-calls');
    if (metricActive) metricActive.textContent = String(online.length);
    if (metricTools) metricTools.textContent = String(toolCount);
    if (metricCalls) metricCalls.textContent = String(state.activities.length);

    if (!state.connections.length) {
      els.summaryTitle.textContent = '协议引擎未就绪';
      els.summaryDetail.textContent = '尚未挂载端点服务，点击右上角或下方卡片接入';
      els.summaryDot.className = 'mcp-summary-dot';
    } else if (online.length) {
      els.summaryTitle.textContent = `${online.length} 个端点服务实时在线`;
      els.summaryDetail.textContent = `共挂载 ${state.connections.length} 个节点 · 发现 ${toolCount} 个可用工具`;
      els.summaryDot.className = 'mcp-summary-dot online';
    } else if (errors.length) {
      els.summaryTitle.textContent = `${errors.length} 个端点通信出现异常`;
      els.summaryDetail.textContent = '建议进入节点卡片执行诊断或查看流水日志';
      els.summaryDot.className = 'mcp-summary-dot warning';
    } else {
      els.summaryTitle.textContent = '节点均处于离线状态';
      els.summaryDetail.textContent = `已配置 ${state.connections.length} 个节点，请点击“测试”唤醒连接`;
      els.summaryDot.className = 'mcp-summary-dot';
    }
  }

  function render() {
    if (!els.content) return;
    updateSummary();
    document.querySelectorAll('[data-mcp-tab]').forEach(tab => {
      const tabName = tab.dataset.mcpTab === 'tools' ? 'capabilities' : tab.dataset.mcpTab;
      const active = tabName === state.activeTab;
      tab.classList.toggle('active', active);
      tab.setAttribute('aria-selected', String(active));
    });
    if (state.activeTab === 'connections') renderConnections();
    if (state.activeTab === 'capabilities') renderCapabilities();
    if (state.activeTab === 'activity') renderActivities();
    if (state.activeTab === 'settings') renderSettings();
  }

  function renderQuickStarters() {
    const cards = Object.entries(CONNECTION_TYPES).map(([key, info]) => `
      <div class="mcp-quick-type-card" data-mcp-type="${escapeHtml(key)}">
        <div class="mcp-quick-card-icon">${iconSvg(key)}</div>
        <div class="mcp-quick-card-info">
          <h4>${escapeHtml(info.label)}</h4>
          <p>${escapeHtml(info.description)}</p>
        </div>
      </div>`).join('');

    return `
      <div class="mcp-onboarding-box">
        <div class="mcp-onboarding-banner">
          <h3 class="mcp-onboarding-title">快速接入服务节点</h3>
          <p class="mcp-onboarding-desc">支持 Streamable HTTP 标准、本地 Termux/iSH 终端桥接、快捷指令与电脑桌面代理</p>
        </div>
        <div class="mcp-quick-starter-grid">
          ${cards}
        </div>
      </div>`;
  }

  function renderConnections() {
    if (!state.connections.length) {
      els.content.innerHTML = renderQuickStarters();
      return;
    }

    const rows = state.connections.map(connection => {
      const info = typeInfo(connection.type);
      const busy = state.busy.has(connection.id);
      const meta = connection.type === 'ios_shortcuts'
        ? connection.shortcutName || '快捷指令自动化'
        : connection.type === 'bluetooth' && connection.deviceName
          ? connection.deviceName
          : connection.endpoint || '未配置通信地址';
      const capCount = ['tools', 'resources', 'resourceTemplates', 'prompts'].reduce((total, kind) => {
        return total + ((connection.capabilities && connection.capabilities[kind] || []).length);
      }, 0);

      return `
        <div class="mcp-node-card" data-connection-id="${escapeHtml(connection.id)}">
          <div class="mcp-node-card-top">
            <div class="mcp-node-avatar">${iconSvg(connection.type)}</div>
            <div class="mcp-node-meta">
              <div class="mcp-node-name-line">
                <span class="mcp-node-title">${escapeHtml(connection.name)}</span>
                <span class="mcp-badge ${statusClass(connection)}">${busy ? '握手中' : statusLabel(connection)}</span>
              </div>
              <div class="mcp-node-endpoint">${escapeHtml(truncate(meta, 52))}</div>
            </div>
          </div>
          <div class="mcp-node-footer">
            <div class="mcp-node-chips">
              <span class="mcp-chip">${escapeHtml(info.short)}</span>
              <span class="mcp-chip">${capCount ? `${capCount} 项能力` : '未同步'}</span>
              ${connection.latencyMs ? `<span class="mcp-chip">${connection.latencyMs}ms</span>` : ''}
            </div>
            <div class="mcp-node-action-btns">
              <button type="button" class="mcp-pill-btn" data-mcp-action="test" data-id="${escapeHtml(connection.id)}" ${busy || !connection.enabled ? 'disabled' : ''}>
                ${connection.type === 'bluetooth' ? '配对' : '测试'}
              </button>
              <button type="button" class="mcp-pill-btn primary" data-mcp-action="details" data-id="${escapeHtml(connection.id)}">
                管理
              </button>
            </div>
          </div>
        </div>`;
    }).join('');

    els.content.innerHTML = `
      <div class="mcp-list-header">
        <span class="mcp-list-title">已挂载服务节点</span>
        <span class="mcp-list-count">${state.connections.length} 个配置</span>
      </div>
      <div class="mcp-connections-list">${rows}</div>`;
  }

  function collectCapabilities() {
    const groups = [];
    state.connections.filter(item => item.enabled).forEach(connection => {
      const capabilities = connection.capabilities || {};
      ['tools', 'resources', 'resourceTemplates', 'prompts'].forEach(kind => {
        const items = Array.isArray(capabilities[kind]) ? capabilities[kind] : [];
        items.forEach(item => groups.push({ connection, kind, item }));
      });
    });
    return groups;
  }

  function capabilityLabel(kind) {
    return kind === 'tools' ? '工具' : kind === 'resources' ? '资源' : kind === 'resourceTemplates' ? '资源模板' : '提示词';
  }

  function renderCapabilities() {
    const capabilities = collectCapabilities();
    if (!capabilities.length) {
      els.content.innerHTML = `
        <div class="mcp-onboarding-box">
          <div class="mcp-onboarding-banner">
            <h3 class="mcp-onboarding-title">暂未捕获到任何 MCP 能力</h3>
            <p class="mcp-onboarding-desc">添加服务节点并在节点卡片点击“测试”后，服务暴露的 Tools、Prompts 与 Resources 会同步至此</p>
          </div>
        </div>`;
      return;
    }

    const rows = capabilities.map(({ connection, kind, item }) => {
      const name = item.title || item.name || item.uri || item.uriTemplate || '未命名能力';
      const description = item.description || item.mimeType || item.uri || item.uriTemplate || `${connection.name} 提供`;
      const actionLabel = kind === 'tools' ? '调试调用' : kind === 'prompts' ? '获取模板' : '读取数据';
      const canSubscribe = kind === 'resources' && !!(connection.serverCapabilities && connection.serverCapabilities.resources && connection.serverCapabilities.resources.subscribe);
      const subscribed = canSubscribe && state.subscriptions.has(`${connection.id}:${item.uri}`);
      return `
        <div class="mcp-capability-card">
          <div class="mcp-cap-info">
            <div class="mcp-cap-title-row">
              <span class="mcp-cap-name">${escapeHtml(name)}</span>
              <span class="mcp-cap-tag">${capabilityLabel(kind)}</span>
            </div>
            <div class="mcp-cap-desc">${escapeHtml(truncate(description, 100))}</div>
            <div class="mcp-chip" style="display:inline-block; margin-top:6px;">由 ${escapeHtml(connection.name)} 提供</div>
          </div>
          <div class="mcp-cap-actions">
            ${canSubscribe ? `<button type="button" class="mcp-pill-btn" data-mcp-action="toggle-subscription" data-id="${escapeHtml(connection.id)}" data-uri="${escapeHtml(item.uri || '')}">${subscribed ? '取消' : '订阅'}</button>` : ''}
            <button type="button" class="mcp-pill-btn primary" data-mcp-action="${kind === 'tools' ? 'invoke' : 'consume-capability'}" data-id="${escapeHtml(connection.id)}" data-kind="${escapeHtml(kind)}" data-name="${escapeHtml(item.name || item.uri || item.uriTemplate || '')}">${actionLabel}</button>
          </div>
        </div>`;
    }).join('');

    els.content.innerHTML = `
      <div class="mcp-list-header">
        <span class="mcp-list-title">已同步外部能力库</span>
        <span class="mcp-list-count">共 ${capabilities.length} 项</span>
      </div>
      <div class="mcp-capabilities-grid">${rows}</div>`;
  }

  function renderActivities() {
    if (!state.activities.length) {
      els.content.innerHTML = `
        <div class="mcp-onboarding-box">
          <div class="mcp-onboarding-banner">
            <h3 class="mcp-onboarding-title">无活动审计流水</h3>
            <p class="mcp-onboarding-desc">端点握手、健康检测与角色会话中的多轮工具调用记录将在此保留</p>
          </div>
        </div>`;
      return;
    }
    const rows = state.activities.map(activity => `
      <div class="mcp-timeline-row" data-mcp-action="activity-details" data-id="${escapeHtml(activity.id)}">
        <div class="mcp-timeline-main">
          <div class="mcp-timeline-header">
            <span class="mcp-timeline-title">${escapeHtml(activity.title || 'MCP 活动')}</span>
            <span class="mcp-badge ${escapeHtml(activity.status || 'offline')}">${escapeHtml(STATUS_LABELS[activity.status] || activity.status || '记录')}</span>
          </div>
          <div class="mcp-timeline-meta">
            <span>${escapeHtml(activity.connectionName || '未知节点')}</span>
            <span>·</span>
            <span>${formatTime(activity.createdAt, true)}</span>
          </div>
          ${activity.summary ? `<div class="mcp-timeline-summary">${escapeHtml(truncate(activity.summary, 70))}</div>` : ''}
        </div>
        <button type="button" class="mcp-pill-btn" data-mcp-action="activity-details" data-id="${escapeHtml(activity.id)}">详情</button>
      </div>`).join('');

    els.content.innerHTML = `
      <div class="mcp-list-header">
        <span class="mcp-list-title">调用与通信流水</span>
        <button type="button" class="mcp-pill-btn" data-mcp-action="clear-activity" style="font-size:10px;">清空流水</button>
      </div>
      <div class="mcp-activity-timeline">${rows}</div>`;
  }

  function settingToggle(name, label, description, checked) {
    return `
      <div class="mcp-setting-item">
        <div class="mcp-setting-copy">
          <div class="mcp-setting-label">${escapeHtml(label)}</div>
          <div class="mcp-setting-hint">${escapeHtml(description)}</div>
        </div>
        <label class="mcp-switch">
          <input type="checkbox" data-mcp-setting="${escapeHtml(name)}" ${checked ? 'checked' : ''}>
          <span class="mcp-switch-slider"></span>
        </label>
      </div>`;
  }

  function renderSettings() {
    els.content.innerHTML = `
      <div class="mcp-list-header">
        <span class="mcp-list-title">调度与通信策略</span>
      </div>
      <div class="mcp-settings-group">
        ${settingToggle('autoReconnect', '自动激活网络连接', '切回前台或网络重新连通时自动发起健康心跳', state.settings.autoReconnect)}
        ${settingToggle('showChatCards', '聊天中呈现执行状态卡', '会话中 AI 调用工具时实时展示气泡状态卡', state.settings.showChatCards)}
        ${settingToggle('includeResultDetails', '卡片保留完整原始报文', '在消息卡片内部保留完整的 JSON 返回载荷', state.settings.includeResultDetails)}
        
        <div class="mcp-setting-item">
          <div class="mcp-setting-copy">
            <div class="mcp-setting-label">请求与执行超时时间</div>
            <div class="mcp-setting-hint">端点握手、能力发现及单次工具调用阈值</div>
          </div>
          <select class="mcp-select" style="width:auto; min-width:96px; padding:6px 10px;" data-mcp-setting="timeoutMs">
            <option value="10000" ${state.settings.timeoutMs === 10000 ? 'selected' : ''}>10 秒</option>
            <option value="20000" ${state.settings.timeoutMs === 20000 ? 'selected' : ''}>20 秒</option>
            <option value="30000" ${state.settings.timeoutMs === 30000 ? 'selected' : ''}>30 秒</option>
          </select>
        </div>

        <div class="mcp-setting-item">
          <div class="mcp-setting-copy">
            <div class="mcp-setting-label">单轮多工具调用上限</div>
            <div class="mcp-setting-hint">单次对话 AI 循环执行工具的最大步数</div>
          </div>
          <input class="mcp-input" style="width:68px; text-align:center; padding:6px 8px;" type="number" min="1" max="30" value="${state.settings.maxCallsPerTurn}" data-mcp-setting="maxCallsPerTurn">
        </div>

        <div class="mcp-setting-item">
          <div class="mcp-setting-copy">
            <div class="mcp-setting-label">模型工具载荷上限</div>
            <div class="mcp-setting-hint">向 AI 上下文单次下发工具描述的最大数量</div>
          </div>
          <input class="mcp-input" style="width:68px; text-align:center; padding:6px 8px;" type="number" min="1" max="100" value="${state.settings.maxCatalogTools}" data-mcp-setting="maxCatalogTools">
        </div>

        <div class="mcp-setting-item">
          <div class="mcp-setting-copy">
            <div class="mcp-setting-label">单次返回长度截断</div>
            <div class="mcp-setting-hint">防止外部工具返回海量文本撑爆上下文</div>
          </div>
          <input class="mcp-input" style="width:84px; text-align:center; padding:6px 8px;" type="number" min="2000" max="100000" value="${state.settings.maxResultLength}" data-mcp-setting="maxResultLength">
        </div>

        <div class="mcp-setting-item">
          <div class="mcp-setting-copy">
            <div class="mcp-setting-label">流水日志归档周期</div>
            <div class="mcp-setting-hint">仅自动清理本地审计流水，不影响聊天记录</div>
          </div>
          <select class="mcp-select" style="width:auto; min-width:96px; padding:6px 10px;" data-mcp-setting="activityRetentionDays">
            <option value="7" ${state.settings.activityRetentionDays === 7 ? 'selected' : ''}>7 天</option>
            <option value="30" ${state.settings.activityRetentionDays === 30 ? 'selected' : ''}>30 天</option>
            <option value="90" ${state.settings.activityRetentionDays === 90 ? 'selected' : ''}>90 天</option>
          </select>
        </div>
      </div>

      <div class="mcp-list-header" style="margin-top:10px;">
        <span class="mcp-list-title">配置数据管理</span>
      </div>
      <div class="mcp-settings-group">
        <div class="mcp-setting-item" style="cursor:pointer;" data-mcp-action="export">
          <div class="mcp-setting-copy">
            <div class="mcp-setting-label">导出节点配置文件</div>
            <div class="mcp-setting-hint">导出已配置节点（已脱敏，不含 Token/密钥）</div>
          </div>
          <button type="button" class="mcp-pill-btn" data-mcp-action="export">导出</button>
        </div>
        <div class="mcp-setting-item" style="cursor:pointer;" data-mcp-action="import">
          <div class="mcp-setting-copy">
            <div class="mcp-setting-label">导入节点配置</div>
            <div class="mcp-setting-hint">从外部 JSON 文件恢复节点参数</div>
          </div>
          <button type="button" class="mcp-pill-btn" data-mcp-action="import">导入</button>
        </div>
      </div>`;
  }

  function showSheet(title, bodyHtml, actionsHtml) {
    els.sheetTitle.textContent = title;
    els.sheetBody.innerHTML = bodyHtml;
    els.sheetActions.innerHTML = actionsHtml || '';
    els.sheetBackdrop.classList.add('visible');
    els.sheetBackdrop.setAttribute('aria-hidden', 'false');
    const firstControl = els.sheetBody.querySelector('input, select, textarea, button');
    if (firstControl) setTimeout(() => firstControl.focus({ preventScroll: true }), 50);
  }

  function closeSheet() {
    els.sheetBackdrop.classList.remove('visible');
    els.sheetBackdrop.setAttribute('aria-hidden', 'true');
    els.sheetBody.innerHTML = '';
    els.sheetActions.innerHTML = '';
  }

  function showTypeChooser() {
    const options = Object.entries(CONNECTION_TYPES).map(([key, info]) => `
      <div class="mcp-quick-type-card" data-mcp-type="${escapeHtml(key)}">
        <div class="mcp-quick-card-icon">${iconSvg(key)}</div>
        <div class="mcp-quick-card-info">
          <h4>${escapeHtml(info.label)}</h4>
          <p>${escapeHtml(info.description)}</p>
        </div>
      </div>`).join('');
    showSheet(
      '选择接入节点类型',
      `<div class="mcp-quick-starter-grid" style="grid-template-columns:1fr; gap:8px;">${options}</div>`,
      `<button type="button" class="mcp-pill-btn" style="height:38px; width:100%; border-radius:12px;" data-mcp-action="close-sheet">取消</button>`
    );
  }

  function endpointFields(connection, info) {
    if (!info.endpoint && !(info.bluetooth && connection.bluetoothMode === 'bridge')) return '';
    return `
      <div class="mcp-form-group">
        <label class="mcp-form-label" for="mcp-form-endpoint">通信端点地址 (Endpoint URL)</label>
        <input class="mcp-input" id="mcp-form-endpoint" name="endpoint" type="url" inputmode="url" value="${escapeHtml(connection.endpoint || '')}" placeholder="https://api.example.com/mcp" autocomplete="off" required>
        <span class="mcp-form-note">需支持 CORS 跨域通信。本地环境建议通过代理端点暴露。</span>
      </div>
      <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px;">
        <div class="mcp-form-group">
          <label class="mcp-form-label" for="mcp-form-transport">通信协议模式</label>
          <select class="mcp-select" id="mcp-form-transport" name="transport">
            <option value="auto" ${(connection.transport || 'auto') === 'auto' ? 'selected' : ''}>自动检测</option>
            <option value="streamable_http" ${connection.transport === 'streamable_http' ? 'selected' : ''}>Streamable HTTP</option>
            <option value="bridge" ${connection.transport === 'bridge' ? 'selected' : ''}>兼容桥接器</option>
          </select>
        </div>
        <div class="mcp-form-group">
          <label class="mcp-form-label" for="mcp-form-auth">鉴权认证</label>
          <select class="mcp-select" id="mcp-form-auth" name="authType">
            <option value="none" ${(connection.authType || 'none') === 'none' ? 'selected' : ''}>免认证</option>
            <option value="bearer" ${connection.authType === 'bearer' ? 'selected' : ''}>Bearer Token</option>
            <option value="oauth" ${connection.authType === 'oauth' ? 'selected' : ''}>OAuth 令牌</option>
            <option value="api_key" ${connection.authType === 'api_key' ? 'selected' : ''}>API Key Header</option>
            <option value="custom" ${connection.authType === 'custom' ? 'selected' : ''}>自定义 Header</option>
          </select>
        </div>
      </div>
      <div id="mcp-auth-fields"></div>
      <div class="mcp-form-group">
        <label class="mcp-form-label" for="mcp-form-headers">附加请求头 (JSON, 可选)</label>
        <textarea class="mcp-textarea" id="mcp-form-headers" name="customHeaders" spellcheck="false" placeholder='{"X-Tenant-Id": "default"}'>${escapeHtml(connection.customHeaders ? JSON.stringify(connection.customHeaders, null, 2) : '')}</textarea>
      </div>`;
  }

  function connectionForm(type, existing) {
    const info = typeInfo(type);
    const connection = existing || {
      type,
      name: info.label,
      enabled: true,
      transport: type === 'custom' || type === 'computer' || type === 'termux' || type === 'ios_ish' ? 'bridge' : 'auto',
      authType: 'none',
      availability: 'manual',
      bluetoothMode: 'direct'
    };
    const shortcutFields = info.shortcut ? `
      <div class="mcp-form-group">
        <label class="mcp-form-label" for="mcp-form-shortcut">快捷指令名称</label>
        <input class="mcp-input" id="mcp-form-shortcut" name="shortcutName" value="${escapeHtml(connection.shortcutName || '')}" placeholder="例如：添加备忘录" required>
        <span class="mcp-form-note">触发系统原生 shortcuts:// 协议单向执行。</span>
      </div>` : '';
    const bluetoothFields = info.bluetooth ? `
      <div class="mcp-form-group">
        <label class="mcp-form-label" for="mcp-form-bluetooth-mode">蓝牙接入方式</label>
        <select class="mcp-select" id="mcp-form-bluetooth-mode" name="bluetoothMode">
          <option value="direct" ${(connection.bluetoothMode || 'direct') === 'direct' ? 'selected' : ''}>浏览器直连 BLE</option>
          <option value="bridge" ${connection.bluetoothMode === 'bridge' ? 'selected' : ''}>通过电脑/手机桥接端点</option>
        </select>
      </div>
      <div class="mcp-form-group" id="mcp-bluetooth-service-field">
        <label class="mcp-form-label" for="mcp-form-service-uuid">BLE Service UUID (可选)</label>
        <input class="mcp-input" id="mcp-form-service-uuid" name="serviceUuid" value="${escapeHtml(connection.serviceUuid || '')}" placeholder="0000180d-0000-1000-8000-00805f9b34fb">
      </div>
      <div id="mcp-bluetooth-endpoint-fields"></div>` : '';
    const pairingField = info.pairing ? `
      <div class="mcp-form-group">
        <label class="mcp-form-label" for="mcp-form-pairing">桌面端配对码 (可选)</label>
        <input class="mcp-input" id="mcp-form-pairing" name="pairingCode" inputmode="numeric" value="${escapeHtml(connection.pairingCode || '')}" placeholder="电脑端显示的动态配对码" autocomplete="one-time-code">
      </div>` : '';

    showSheet(
      existing ? '编辑服务节点' : `配置 ${info.label}`,
      `<form class="mcp-form" id="mcp-connection-form" data-type="${escapeHtml(type)}" data-id="${escapeHtml(existing ? existing.id : '')}" style="display:flex; flex-direction:column; gap:14px;">
        <div class="mcp-form-group">
          <label class="mcp-form-label" for="mcp-form-name">节点别名</label>
          <input class="mcp-input" id="mcp-form-name" name="name" value="${escapeHtml(connection.name || info.label)}" maxlength="60" required>
        </div>
        ${shortcutFields}
        ${bluetoothFields}
        ${pairingField}
        <div id="mcp-standard-endpoint-fields">${info.endpoint ? endpointFields(connection, info) : ''}</div>
        <div class="mcp-form-group">
          <label class="mcp-form-label" for="mcp-form-availability">对话卡片可见范围</label>
          <select class="mcp-select" id="mcp-form-availability" name="availability">
            <option value="manual" ${(connection.availability || 'manual') === 'manual' ? 'selected' : ''}>仅在 MCP 控制台手动调试</option>
            <option value="all_chats" ${connection.availability === 'all_chats' ? 'selected' : ''}>允许同步到所有对话</option>
            <option value="current_chat" ${connection.availability === 'current_chat' ? 'selected' : ''} ${typeof currentChatId !== 'undefined' && currentChatId ? '' : 'disabled'}>仅同步至当前激活对话</option>
          </select>
        </div>
        <div class="mcp-setting-item" style="padding:10px 0; border-top:1px solid var(--mcp-border); border-bottom:none;">
          <div class="mcp-setting-copy">
            <div class="mcp-setting-label">启用此节点</div>
            <div class="mcp-setting-hint">停用后保留所有凭证和能力缓存</div>
          </div>
          <label class="mcp-switch">
            <input type="checkbox" name="enabled" ${connection.enabled !== false ? 'checked' : ''}>
            <span class="mcp-switch-slider"></span>
          </label>
        </div>
      </form>`,
      `<button type="button" class="mcp-secondary-btn" data-mcp-action="close-sheet">放弃</button>
       <button type="button" class="mcp-primary-btn" data-mcp-action="save-connection">保存并生效</button>`
    );
    updateConditionalFormFields(connection);
  }

  function authFieldsHtml(authType, connection) {
    if (authType === 'none') return '';
    const label = authType === 'bearer' ? 'Bearer Token' : authType === 'oauth' ? 'OAuth 访问令牌' : authType === 'api_key' ? 'API Key' : 'Header 值';
    const headerName = authType === 'api_key'
      ? (connection.headerName || 'X-API-Key')
      : authType === 'custom'
        ? (connection.headerName || '')
        : '';
    return `
      ${!['bearer', 'oauth'].includes(authType) ? `<div class="mcp-field"><label for="mcp-form-header-name">Header 名称</label><input id="mcp-form-header-name" name="headerName" value="${escapeHtml(headerName)}" placeholder="X-API-Key"></div>` : ''}
      <div class="mcp-field">
        <label for="mcp-form-secret">${label}</label>
        <input id="mcp-form-secret" name="secret" type="password" value="" placeholder="${connection.secret || connection.accessToken ? '已保存；留空保持不变' : '仅保存在本机数据库'}" autocomplete="off">
      </div>`;
  }

  function bindAuthFields(form, connection) {
    const authSelect = form && form.elements.authType;
    const authTarget = document.getElementById('mcp-auth-fields');
    if (!authSelect || !authTarget) return;
    const refreshAuth = () => {
      authTarget.innerHTML = authFieldsHtml(authSelect.value, connection || {});
    };
    refreshAuth();
    authSelect.onchange = refreshAuth;
  }

  function updateConditionalFormFields(connection) {
    const form = document.getElementById('mcp-connection-form');
    if (!form) return;
    bindAuthFields(form, connection);
    const bluetoothMode = form.elements.bluetoothMode;
    const bluetoothEndpoint = document.getElementById('mcp-bluetooth-endpoint-fields');
    const serviceField = document.getElementById('mcp-bluetooth-service-field');
    if (bluetoothMode && bluetoothEndpoint) {
      const refresh = () => {
        const isBridge = bluetoothMode.value === 'bridge';
        serviceField.style.display = isBridge ? 'none' : 'flex';
        bluetoothEndpoint.innerHTML = isBridge ? endpointFields({ ...(connection || {}), bluetoothMode: 'bridge' }, { endpoint: true }) : '';
        if (isBridge) bindAuthFields(form, connection);
      };
      bluetoothMode.onchange = refresh;
      if (bluetoothMode.value === 'bridge') refresh();
    }
  }

  function parseHeaders(value) {
    if (!String(value || '').trim()) return {};
    const parsed = JSON.parse(value);
    if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') {
      throw new Error('附加 Headers 必须是 JSON 对象。');
    }
    const blocked = ['host', 'origin', 'cookie', 'content-length', 'accept', 'content-type', 'authorization', 'mcp-session-id', 'mcp-protocol-version'];
    Object.keys(parsed).forEach(key => {
      if (blocked.includes(key.toLowerCase())) throw new Error(`浏览器不允许设置 ${key} Header。`);
      if (typeof parsed[key] !== 'string') throw new Error(`Header ${key} 的值必须是字符串。`);
    });
    return parsed;
  }

  function connectionForStorage(connection) {
    const stored = { ...connection };
    delete stored.secret;
    delete stored.accessToken;
    delete stored.refreshToken;
    delete stored.sessionId;
    delete stored.pairingCode;
    delete stored.deviceId;
    return stored;
  }

  async function persistConnection(connection) {
    const secureRecord = {
      id: connection.id,
      secret: connection.secret || '',
      accessToken: connection.accessToken || '',
      refreshToken: connection.refreshToken || '',
      tokenExpiresAt: connection.tokenExpiresAt || 0,
      pairingCode: connection.pairingCode || '',
      deviceId: connection.deviceId || '',
      updatedAt: Date.now()
    };
    await dexieDB.transaction('rw', dexieDB.mcpConnections, dexieDB.mcpSecrets, async () => {
      await dexieDB.mcpConnections.put(connectionForStorage(connection));
      if (secureRecord.secret || secureRecord.accessToken || secureRecord.refreshToken || secureRecord.pairingCode || secureRecord.deviceId) await dexieDB.mcpSecrets.put(secureRecord);
      else await dexieDB.mcpSecrets.delete(connection.id);
    });
  }

  async function saveConnectionFromForm() {
    const form = document.getElementById('mcp-connection-form');
    if (!form || !form.reportValidity()) return;
    const formData = new FormData(form);
    const type = form.dataset.type;
    const existing = state.connections.find(item => item.id === form.dataset.id);
    let customHeaders;
    try {
      customHeaders = parseHeaders(formData.get('customHeaders'));
    } catch (error) {
      await showCustomAlert('配置有误', error.message);
      return;
    }
    const endpoint = String(formData.get('endpoint') || '').trim();
    if (endpoint) {
      try {
        const url = new URL(endpoint);
        if (!['http:', 'https:'].includes(url.protocol)) throw new Error();
      } catch (error) {
        await showCustomAlert('地址无效', 'MCP 端点必须是完整的 HTTP 或 HTTPS 地址。');
        return;
      }
    }
    const now = Date.now();
    const connection = {
      ...(existing || {}),
      id: existing ? existing.id : uid('mcp'),
      type,
      name: String(formData.get('name') || typeInfo(type).label).trim(),
      endpoint,
      transport: String(formData.get('transport') || (type === 'ios_shortcuts' ? 'shortcut' : type === 'bluetooth' ? 'bluetooth' : 'auto')),
      authType: String(formData.get('authType') || 'none'),
      headerName: String(formData.get('headerName') || '').trim(),
      customHeaders,
      shortcutName: String(formData.get('shortcutName') || '').trim(),
      bluetoothMode: String(formData.get('bluetoothMode') || ''),
      serviceUuid: String(formData.get('serviceUuid') || '').trim(),
      pairingCode: String(formData.get('pairingCode') || '').trim(),
      availability: String(formData.get('availability') || 'manual'),
      chatId: formData.get('availability') === 'current_chat' && typeof currentChatId !== 'undefined' ? currentChatId : null,
      enabled: form.elements.enabled.checked,
      status: form.elements.enabled.checked ? (existing && existing.status !== 'disabled' ? existing.status : 'offline') : 'disabled',
      createdAt: existing ? existing.createdAt : now,
      updatedAt: now
    };
    if (['api_key', 'custom'].includes(connection.authType)) {
      const headerName = connection.headerName.toLowerCase();
      if (!headerName || ['host', 'origin', 'cookie', 'content-length', 'mcp-session-id', 'mcp-protocol-version'].includes(headerName)) {
        await showCustomAlert('认证配置有误', '请填写一个允许由浏览器发送的认证 Header 名称。');
        return;
      }
    }
    const newSecret = String(formData.get('secret') || '');
    if (newSecret && connection.authType === 'oauth') {
      connection.accessToken = newSecret;
      delete connection.secret;
    } else if (newSecret) {
      connection.secret = newSecret;
      delete connection.accessToken;
    }
    if (connection.authType === 'none') {
      delete connection.secret;
      delete connection.accessToken;
      delete connection.headerName;
    }
    state.clients.delete(connection.id);
    await persistConnection(connection);
    await logActivity({
      connection,
      status: 'success',
      title: existing ? '连接配置已更新' : '连接已添加',
      summary: typeInfo(type).label
    });
    closeSheet();
    await loadData();
    render();
    showToast(existing ? '连接配置已保存' : '连接已添加', 'success');
  }

  function getConnection(id) {
    return state.connections.find(item => item.id === id);
  }

  function connectionDetails(connection) {
    const info = typeInfo(connection.type);
    const capabilityCount = ['tools', 'resources', 'resourceTemplates', 'prompts'].reduce((total, kind) => {
      return total + ((connection.capabilities && connection.capabilities[kind] || []).length);
    }, 0);
    const endpoint = connection.type === 'ios_shortcuts'
      ? `shortcuts://run-shortcut?name=${encodeURIComponent(connection.shortcutName || '')}`
      : connection.type === 'bluetooth' && connection.bluetoothMode === 'direct'
        ? (connection.deviceName || '等待蓝牙配对')
        : (connection.endpoint || '未设置');
    const error = connection.lastError ? `<div class="mcp-inline-notice" style="margin-top:12px;">${escapeHtml(connection.lastError)}</div>` : '';
    showSheet(
      connection.name,
      `<dl class="mcp-detail-grid">
        <dt>类型</dt><dd>${escapeHtml(info.label)}</dd>
        <dt>状态</dt><dd><span class="mcp-status-tag ${statusClass(connection)}">${statusLabel(connection)}</span></dd>
        <dt>地址/设备</dt><dd>${escapeHtml(endpoint)}</dd>
        <dt>传输</dt><dd>${escapeHtml(connection.transport || connection.bluetoothMode || '自动')}</dd>
        <dt>能力</dt><dd>${capabilityCount ? `${capabilityCount} 项` : '尚未发现'}</dd>
        <dt>协议</dt><dd>${escapeHtml(connection.protocolVersion || '尚未协商')}</dd>
        <dt>最近检查</dt><dd>${formatTime(connection.lastTestedAt, true)}</dd>
        <dt>卡片范围</dt><dd>${connection.availability === 'all_chats' ? '所有聊天' : connection.availability === 'current_chat' ? '指定聊天' : '仅 MCP 中心'}</dd>
      </dl>${error}`,
      `<button type="button" class="mcp-secondary-btn" data-mcp-action="edit" data-id="${escapeHtml(connection.id)}">编辑</button>
       ${connection.type === 'ios_shortcuts' ? `<button type="button" class="mcp-primary-btn" data-mcp-action="launch-shortcut" data-id="${escapeHtml(connection.id)}">运行</button>` : `<button type="button" class="mcp-primary-btn" data-mcp-action="test" data-id="${escapeHtml(connection.id)}">${connection.type === 'bluetooth' ? '配对/测试' : '测试连接'}</button>`}
       <button type="button" class="mcp-danger-btn" data-mcp-action="delete" data-id="${escapeHtml(connection.id)}">删除</button>`
    );
  }

  function buildRequestHeaders(connection, initialized) {
    const headers = {
      Accept: 'application/json, text/event-stream',
      'Content-Type': 'application/json',
      ...(connection.customHeaders || {})
    };
    if (['bearer', 'oauth'].includes(connection.authType) && (connection.accessToken || connection.secret)) {
      headers.Authorization = `Bearer ${connection.accessToken || connection.secret}`;
    } else if (['api_key', 'custom'].includes(connection.authType) && connection.headerName && connection.secret) {
      headers[connection.headerName] = connection.secret;
    }
    if (initialized && connection.protocolVersion) headers['MCP-Protocol-Version'] = connection.protocolVersion;
    if (initialized && connection.sessionId) headers['Mcp-Session-Id'] = connection.sessionId;
    if (connection.pairingCode) headers['X-MCP-Pairing-Code'] = connection.pairingCode;
    return headers;
  }

  function parseSsePayload(text, requestId) {
    const messages = [];
    text.split(/\r?\n\r?\n/).forEach(block => {
      const data = block.split(/\r?\n/)
        .filter(line => line.startsWith('data:'))
        .map(line => line.slice(5).trim())
        .join('\n');
      if (!data) return;
      try { messages.push(JSON.parse(data)); } catch (error) { /* Ignore non-JSON SSE events. */ }
    });
    return messages.find(item => item.id === requestId) || messages.find(item => item.result || item.error) || null;
  }

  function protocolClient(connection) {
    let client = state.clients.get(connection.id);
    if (!client || client.connection !== connection) {
      client = window.McpProtocol.createClient({
        connection,
        getSecret: async () => connection.secret || connection.accessToken || '',
        getTimeout: () => state.settings.timeoutMs || 20000,
        onMessage: message => handleServerMessage(connection, message)
      });
      state.clients.set(connection.id, client);
    }
    return client;
  }

  async function rpc(connection, method, params, options) {
    return protocolClient(connection).request(method, params, options || {});
  }

  async function initializeConnection(connection, options) {
    const result = await protocolClient(connection).initialize(options && options.signal);
    state.sessions.set(connection.id, {
      sessionId: connection.sessionId || '',
      protocolVersion: connection.protocolVersion
    });
    return result;
  }

  async function discoverCapabilities(connection, options) {
    return protocolClient(connection).discover(options && options.signal);
  }

  async function handleServerMessage(connection, message) {
    if (!message || typeof message !== 'object') return;
    if (message.id !== undefined && message.method === 'roots/list') {
      await protocolClient(connection).sendResponse(message.id, { roots: [] }).catch(error => console.warn('[MCP] roots/list 响应失败:', error));
      return;
    }
    if (message.id !== undefined && message.method) {
      await protocolClient(connection).sendResponse(message.id, undefined, { code: -32601, message: `客户端不支持服务器请求 ${message.method}` })
        .catch(error => console.warn('[MCP] 服务器请求错误响应失败:', error));
      return;
    }
    if (/^notifications\/(tools|resources|prompts)\/list_changed$/.test(message.method || '')) {
      await discoverCapabilities(connection).catch(() => {});
      await persistConnection(connection);
      render();
    }
    if (message.method === 'notifications/resources/updated') {
      await logActivity({ connection, status: 'success', title: '资源更新通知', summary: message.params && message.params.uri || '服务器资源已更新' });
      render();
    }
    if (message.method === 'notifications/message') {
      const params = message.params || {};
      await logActivity({ connection, status: 'success', title: `服务器日志 · ${params.level || 'info'}`, summary: typeof params.data === 'string' ? params.data : JSON.stringify(params.data || {}) });
    }
    if (message.method === 'notifications/progress') {
      const params = message.params || {};
      await logActivity({ connection, status: 'running', title: '服务器任务进度', summary: `${params.progress == null ? '' : params.progress}${params.total ? ` / ${params.total}` : ''} ${params.message || ''}`.trim() });
    }
  }

  function startEventStream(connection) {
    if (!connection.sessionId || state.eventStreams.has(connection.id)) return;
    const controller = new AbortController();
    state.eventStreams.set(connection.id, controller);
    protocolClient(connection).openServerStream(null, controller.signal).catch(error => {
      if (error && error.name !== 'AbortError') console.warn('[MCP] 服务端事件流已中断:', error);
    }).finally(() => state.eventStreams.delete(connection.id));
  }

  async function pairBluetooth(connection) {
    if (connection.bluetoothMode === 'bridge') {
      await initializeConnection(connection);
      await discoverCapabilities(connection);
      connection.status = 'online';
      return '蓝牙桥接器连接成功';
    }
    if (!navigator.bluetooth || typeof navigator.bluetooth.requestDevice !== 'function') {
      throw new Error('当前浏览器不支持直接蓝牙连接。苹果 Safari/PWA 请使用 iOS 桥接器，或改用电脑节点。');
    }
    const serviceUuid = String(connection.serviceUuid || '').trim();
    const requestOptions = serviceUuid
      ? { filters: [{ services: [serviceUuid] }], optionalServices: [serviceUuid] }
      : { acceptAllDevices: true };
    const device = await navigator.bluetooth.requestDevice(requestOptions);
    connection.deviceName = device.name || '未命名 BLE 设备';
    connection.deviceId = device.id;
    connection.status = 'paired';
    return `已配对 ${connection.deviceName}`;
  }

  async function testConnection(id) {
    const connection = getConnection(id);
    if (!connection || state.busy.has(id)) return;
    if (!connection.enabled) {
      await showCustomAlert('连接已停用', '请先在编辑页面启用此连接。');
      return;
    }
    state.busy.add(id);
    connection.status = 'testing';
    connection.lastError = '';
    render();
    if (els.sheetBackdrop.classList.contains('visible')) connectionDetails(connection);
    const start = performance.now();
    let summary;
    try {
      if (connection.type === 'ios_shortcuts') {
        if (!connection.shortcutName) throw new Error('请先填写快捷指令名称。');
        connection.status = 'ready';
        summary = '快捷指令通道已就绪';
      } else if (connection.type === 'bluetooth') {
        summary = await pairBluetooth(connection);
      } else {
        await initializeConnection(connection);
        const capabilities = await discoverCapabilities(connection);
        const count = ['tools', 'resources', 'resourceTemplates', 'prompts']
          .reduce((total, kind) => total + (Array.isArray(capabilities[kind]) ? capabilities[kind].length : 0), 0);
        connection.status = 'online';
        connection.latencyMs = Math.round(performance.now() - start);
        summary = `握手成功，发现 ${count} 项能力，${connection.latencyMs}ms`;
      }
      connection.lastTestedAt = Date.now();
      connection.updatedAt = Date.now();
      await persistConnection(connection);
      await logActivity({ connection, status: 'success', title: '连接测试成功', summary });
      showToast(summary, 'success');
    } catch (error) {
      connection.status = 'error';
      connection.lastError = error.message || String(error);
      connection.lastTestedAt = Date.now();
      connection.updatedAt = Date.now();
      await persistConnection(connection);
      await logActivity({ connection, status: 'failed', title: '连接测试失败', summary: connection.lastError });
      await showCustomAlert('连接失败', connection.lastError);
    } finally {
      state.busy.delete(id);
      await loadData();
      render();
      const refreshed = getConnection(id);
      if (refreshed && refreshed.status === 'online') startEventStream(refreshed);
      if (els.sheetBackdrop.classList.contains('visible')) {
        if (refreshed) connectionDetails(refreshed);
      }
    }
  }

  async function logActivity(input) {
    const activity = {
      id: input.id || uid('activity'),
      connectionId: input.connection ? input.connection.id : input.connectionId,
      connectionName: input.connection ? input.connection.name : input.connectionName,
      status: input.status || 'success',
      title: input.title || 'MCP 活动',
      summary: input.summary || '',
      request: input.request,
      result: input.result,
      error: input.error,
      toolName: input.toolName,
      chatId: input.chatId || null,
      createdAt: input.createdAt || Date.now(),
      updatedAt: Date.now()
    };
    await dexieDB.mcpActivities.put(activity);
    const index = state.activities.findIndex(item => item.id === activity.id);
    if (index >= 0) state.activities[index] = activity;
    else state.activities.unshift(activity);
    return activity;
  }

  function findCapability(connection, kind, name) {
    const list = connection && connection.capabilities && connection.capabilities[kind];
    return Array.isArray(list) ? list.find(item => item.name === name || item.uri === name || item.uriTemplate === name) : null;
  }

  function defaultArguments(schema) {
    const output = {};
    if (!schema || !schema.properties) return output;
    Object.entries(schema.properties).forEach(([key, value]) => {
      if (value.default !== undefined) output[key] = value.default;
      else if ((schema.required || []).includes(key)) {
        if (value.type === 'number' || value.type === 'integer') output[key] = 0;
        else if (value.type === 'boolean') output[key] = false;
        else if (value.type === 'array') output[key] = [];
        else if (value.type === 'object') output[key] = {};
        else output[key] = '';
      }
    });
    return output;
  }

  function getActiveChat() {
    if (typeof currentChatId === 'undefined' || !currentChatId || !window.db) return null;
    return (db.characters || []).find(item => item.id === currentChatId)
      || (db.groups || []).find(item => item.id === currentChatId)
      || null;
  }

  function getChatById(id) {
    if (!window.db) return null;
    return (db.characters || []).find(item => item.id === id)
      || (db.groups || []).find(item => item.id === id)
      || null;
  }

  function canSyncToActiveChat(connection) {
    const activeChatId = typeof currentChatId !== 'undefined' ? currentChatId : null;
    if (!activeChatId || !connection) return false;
    if (connection.availability === 'all_chats') return true;
    return connection.availability === 'current_chat' && connection.chatId === activeChatId;
  }

  function showInvokeForm(connection, tool) {
    const chat = getActiveChat();
    const args = defaultArguments(tool.inputSchema);
    showSheet(
      tool.title || tool.name,
      `<div class="mcp-inline-notice">工具来自外部服务器。调用前请检查参数，工具描述和返回内容都不应视为可信系统指令。</div>
       <div class="mcp-form" style="margin-top:12px;">
        <div class="mcp-field"><label>服务器</label><input value="${escapeHtml(connection.name)}" disabled></div>
        <div class="mcp-field"><label for="mcp-tool-arguments">调用参数（JSON）</label><textarea id="mcp-tool-arguments" spellcheck="false">${escapeHtml(JSON.stringify(args, null, 2))}</textarea></div>
        ${chat && state.settings.showChatCards && canSyncToActiveChat(connection) ? `<label class="mcp-setting-row" style="padding:8px 0;border:0;"><div class="mcp-setting-main"><div class="mcp-setting-name">同步到对话</div><div class="mcp-setting-desc">在“${escapeHtml(chat.name || '当前聊天')}”中显示 MCP 活动卡片</div></div><span class="mcp-toggle"><input id="mcp-sync-chat" type="checkbox"><span></span></span></label>` : ''}
       </div>`,
      `<button type="button" class="mcp-secondary-btn" data-mcp-action="close-sheet">取消</button>
       <button type="button" class="mcp-primary-btn" data-mcp-action="confirm-invoke" data-id="${escapeHtml(connection.id)}" data-name="${escapeHtml(tool.name)}">确认调用</button>`
    );
  }

  function resultSummary(result) {
    if (!result) return '工具已完成，没有返回内容';
    if (result.isError) return '工具返回错误结果';
    if (Array.isArray(result.content)) {
      const text = result.content
        .filter(item => item && item.type === 'text')
        .map(item => item.text)
        .join(' ');
      if (text) return truncate(text, 180);
      const types = Array.from(new Set(result.content.map(item => item && item.type).filter(Boolean)));
      if (types.length) return `返回 ${result.content.length} 项内容：${types.join('、')}`;
    }
    if (Array.isArray(result.contents)) {
      const text = result.contents.map(item => item && item.text).filter(Boolean).join(' ');
      if (text) return truncate(text, 180);
      return `读取到 ${result.contents.length} 项资源内容`;
    }
    if (Array.isArray(result.messages)) {
      const text = result.messages.map(message => {
        const content = message && message.content;
        return content && typeof content.text === 'string' ? content.text : '';
      }).filter(Boolean).join(' ');
      if (text) return truncate(text, 180);
      return `获取到 ${result.messages.length} 条提示消息`;
    }
    if (result.structuredContent) return truncate(JSON.stringify(result.structuredContent), 180);
    return truncate(JSON.stringify(result), 180) || '工具已完成';
  }

  function getChatMcpSettings(chat) {
    const saved = chat && (chat.mcpSettings || chat.settings && chat.settings.mcp);
    return {
      enabled: false,
      mode: 'auto',
      allowedConnections: [],
      allowedTools: {},
      confirmWrites: true,
      showActivityCards: true,
      maxCallsPerTurn: state.settings.maxCallsPerTurn || 8,
      triggerRules: '',
      ...(saved && typeof saved === 'object' ? saved : {})
    };
  }

  const INVOCATION_MODES = {
    auto: '自动判断',
    explicit: '明确操作意图',
    selected: '本次指定',
    required: '强制调用',
    rules: '规则触发',
    read_only_auto: '只读自动',
    manual_only: '仅 MCP 中心手动调用',
    disabled: '完全关闭'
  };

  function permissionEditorHtml(settings, subjectId, subjectName) {
    const connectionsHtml = state.connections.map(connection => {
      const tools = connection.capabilities && Array.isArray(connection.capabilities.tools) ? connection.capabilities.tools : [];
      const connectionChecked = settings.allowedConnections.includes(connection.id);
      const selectedTools = settings.allowedTools && settings.allowedTools[connection.id];
      return `
        <div class="mcp-perm-node-group" data-mcp-permission-connection="${escapeHtml(connection.id)}">
          <div class="mcp-perm-node-header">
            <label style="display:flex; align-items:center; gap:8px; font-weight:600; cursor:pointer;">
              <input type="checkbox" data-mcp-permission-connection-toggle ${connectionChecked ? 'checked' : ''} style="width:16px; height:16px;">
              <span>${escapeHtml(connection.name)}</span>
            </label>
            <span class="mcp-badge ${statusClass(connection)}">${statusLabel(connection)}</span>
          </div>
          <div class="mcp-perm-node-tools" ${connectionChecked ? '' : 'hidden'}>
            ${tools.length ? tools.map(tool => `
              <div class="mcp-perm-tool-row">
                <label style="display:flex; align-items:center; gap:6px; cursor:pointer;">
                  <input type="checkbox" data-mcp-permission-tool="${escapeHtml(tool.name)}" ${!Array.isArray(selectedTools) || selectedTools.includes(tool.name) ? 'checked' : ''}>
                  <span>${escapeHtml(tool.title || tool.name)}</span>
                </label>
              </div>`).join('') : '<div style="font-size:11px; color:var(--mcp-text-sub);">该节点暂未同步工具。</div>'}
          </div>
        </div>`;
    }).join('');

    return `
      <section class="mcp-perm-container" data-mcp-permission-subject="${escapeHtml(subjectId)}">
        <div class="mcp-perm-main-switch">
          <div>
            <div style="font-size:14px; font-weight:600; color:var(--mcp-text-main);">${escapeHtml(subjectName)} · 授权使用 MCP</div>
            <div style="font-size:11px; color:var(--mcp-text-sub); margin-top:2px;">允许该角色在对话中根据意图调用已勾选工具</div>
          </div>
          <label class="mcp-switch">
            <input type="checkbox" data-mcp-permission-enabled ${settings.enabled ? 'checked' : ''}>
            <span class="mcp-switch-slider"></span>
          </label>
        </div>

        <div data-mcp-permission-options ${settings.enabled ? '' : 'hidden'}>
          <details class="mcp-perm-disclosure">
            <summary>
              <span class="mcp-perm-disclosure-title">调用设置</span>
              <span class="mcp-perm-disclosure-summary" data-mcp-permission-mode-summary>策略：${escapeHtml(INVOCATION_MODES[settings.mode] || INVOCATION_MODES.auto)}</span>
            </summary>
            <div class="mcp-perm-disclosure-content">
              <div class="mcp-settings-group">
            <div class="mcp-setting-item">
              <div class="mcp-setting-copy">
                <div class="mcp-setting-label">调用策略模式</div>
                <div class="mcp-setting-hint">控制模型在何种情境下触发工具调用</div>
              </div>
              <select class="mcp-select" style="width:auto; min-width:110px; padding:6px 10px;" data-mcp-permission-mode>
                ${Object.entries(INVOCATION_MODES).map(([value, label]) => `<option value="${value}" ${settings.mode === value ? 'selected' : ''}>${label}</option>`).join('')}
              </select>
            </div>

            <div class="mcp-setting-item" data-mcp-permission-rules-row ${settings.mode === 'rules' ? '' : 'hidden'} style="flex-direction:column; align-items:stretch; gap:6px;">
              <div class="mcp-setting-label">规则关键词触发词 (可选)</div>
              <textarea class="mcp-textarea" style="min-height:50px; font-size:12px;" data-mcp-permission-rules placeholder="每行或逗号分隔关键词，仅“规则触发”模式生效">${escapeHtml(settings.triggerRules || '')}</textarea>
            </div>

              </div>

              <details class="mcp-perm-subdisclosure">
                <summary>高级调用设置</summary>
                <div class="mcp-settings-group">
            <div class="mcp-setting-item">
              <div class="mcp-setting-copy">
                <div class="mcp-setting-label">破坏性操作二次确认</div>
                <div class="mcp-setting-hint">执行删除、写入或外部发布前弹窗征得同意</div>
              </div>
              <label class="mcp-switch">
                <input type="checkbox" data-mcp-permission-confirm ${settings.confirmWrites !== false ? 'checked' : ''}>
                <span class="mcp-switch-slider"></span>
              </label>
            </div>

            <div class="mcp-setting-item">
              <div class="mcp-setting-copy">
                <div class="mcp-setting-label">在会话中渲染调用状态卡</div>
                <div class="mcp-setting-hint">呈现工具执行中与完成状态气泡</div>
              </div>
              <label class="mcp-switch">
                <input type="checkbox" data-mcp-permission-cards ${settings.showActivityCards !== false ? 'checked' : ''}>
                <span class="mcp-switch-slider"></span>
              </label>
            </div>

            <div class="mcp-setting-item">
              <div class="mcp-setting-copy">
                <div class="mcp-setting-label">单轮最多调用步数</div>
                <div class="mcp-setting-hint">模型单次回复允许连续调用的最大次数</div>
              </div>
              <input class="mcp-input" style="width:68px; text-align:center; padding:6px 8px;" type="number" min="1" max="30" value="${Math.min(30, Math.max(1, Number(settings.maxCallsPerTurn) || 8))}" data-mcp-permission-max>
            </div>
                </div>
              </details>

              <details class="mcp-perm-subdisclosure">
                <summary>已授予工具</summary>
                <div class="mcp-perm-tools-list">
                  ${connectionsHtml || '<div style="font-size:12px; color:var(--mcp-text-sub);">尚未添加 MCP 连接。</div>'}
                </div>
              </details>
            </div>
          </details>
        </div>
      </section>`;
  }

  function renderPermissionEditor(container, target) {
    if (!container) return;
    const settings = getChatMcpSettings(target);
    const isGroup = target && Array.isArray(target.members);
    container.innerHTML = isGroup
      ? `<div class="settings-desc">群聊默认权限与每位成员权限独立保存。</div>${permissionEditorHtml(settings, '__group__', '群聊默认权限')}${target.members.map(member => permissionEditorHtml(settings.memberSettings && settings.memberSettings[member.id] || settings, member.id, member.groupNickname || member.realName || '群成员')).join('')}`
      : permissionEditorHtml(settings, '__single__', '当前角色权限');
    container.onchange = event => {
      if (event.target.matches('[data-mcp-permission-enabled]')) {
        event.target.closest('[data-mcp-permission-subject]').querySelector('[data-mcp-permission-options]').hidden = !event.target.checked;
      }
      if (event.target.matches('[data-mcp-permission-connection-toggle]')) {
        const row = event.target.closest('[data-mcp-permission-connection]');
        const tools = row && row.querySelector('.mcp-perm-node-tools');
        if (tools) tools.hidden = !event.target.checked;
      }
      if (event.target.matches('[data-mcp-permission-mode]')) {
        const block = event.target.closest('[data-mcp-permission-subject]');
        const rules = block && block.querySelector('[data-mcp-permission-rules-row]');
        if (rules) rules.hidden = event.target.value !== 'rules';
        const summary = block && block.querySelector('[data-mcp-permission-mode-summary]');
        if (summary) summary.textContent = `策略：${event.target.selectedOptions[0]?.textContent || '自动判断'}`;
      }
    };
  }

  function readPermissionEditor(container) {
    if (!container) return getChatMcpSettings(null);
    const blocks = Array.from(container.querySelectorAll('[data-mcp-permission-subject]'));
    const readBlock = block => {
    const allowedConnections = [];
    const allowedTools = {};
    block.querySelectorAll('[data-mcp-permission-connection]').forEach(row => {
      const connectionId = row.dataset.mcpPermissionConnection;
      const toggle = row.querySelector('[data-mcp-permission-connection-toggle]');
      if (!toggle || !toggle.checked) return;
      allowedConnections.push(connectionId);
      allowedTools[connectionId] = Array.from(row.querySelectorAll('[data-mcp-permission-tool]:checked'))
        .map(input => input.dataset.mcpPermissionTool);
    });
    return {
      enabled: !!block.querySelector('[data-mcp-permission-enabled]')?.checked,
      mode: block.querySelector('[data-mcp-permission-mode]')?.value || 'auto',
      triggerRules: block.querySelector('[data-mcp-permission-rules]')?.value || '',
      allowedConnections,
      allowedTools,
      confirmWrites: !!block.querySelector('[data-mcp-permission-confirm]')?.checked,
      showActivityCards: !!block.querySelector('[data-mcp-permission-cards]')?.checked,
      maxCallsPerTurn: Math.min(30, Math.max(1, Number(block.querySelector('[data-mcp-permission-max]')?.value) || 8))
    };
    };
    const primary = blocks.length ? readBlock(blocks[0]) : getChatMcpSettings(null);
    if (blocks[0] && blocks[0].dataset.mcpPermissionSubject === '__group__') {
      primary.memberSettings = {};
      blocks.slice(1).forEach(block => { primary.memberSettings[block.dataset.mcpPermissionSubject] = readBlock(block); });
    }
    return primary;
  }

  function isToolAllowed(settings, connectionId, toolName) {
    if (!settings.enabled || !Array.isArray(settings.allowedConnections)) return false;
    if (!settings.allowedConnections.includes(connectionId)) return false;
    const configured = settings.allowedTools && settings.allowedTools[connectionId];
    return !Array.isArray(configured) || configured.includes(toolName);
  }

  function explicitToolMatches(text, connection, tool) {
    const normalized = String(text || '').toLocaleLowerCase();
    if (!normalized) return false;
    const names = [
      connection && connection.name,
      tool && tool.name,
      tool && tool.title
    ].filter(Boolean).map(value => String(value).toLocaleLowerCase());
    return names.some(name => normalized.includes(name)) || /查|搜|找|读取|获取|创建|添加|修改|更新|删除|发送|发布|执行|运行|计算|提醒|日程|文件|天气|search|find|read|get|create|add|update|delete|send|run|execute/i.test(normalized);
  }

  function triggerRulesMatch(text, rules) {
    const keywords = String(rules || '').split(/[\n,，]/).map(value => value.trim()).filter(Boolean);
    const normalized = String(text || '').toLocaleLowerCase();
    return keywords.length > 0 && keywords.some(keyword => normalized.includes(keyword.toLocaleLowerCase()));
  }

  function getToolsForChat(chat, options) {
    const directive = options && options.directive;
    const userText = options && options.userText;
    const requestedConnectionId = directive && directive.connectionId;
    const requestedToolName = directive && directive.toolName;
    const groupSettings = getChatMcpSettings(chat);
    const isGroup = chat && Array.isArray(chat.members);
    const subjects = isGroup
      ? (chat.members || []).map(member => ({
          actorId: member.id,
          actorName: member.groupNickname || member.realName || '群成员',
          settings: { ...groupSettings, ...(groupSettings.memberSettings && groupSettings.memberSettings[member.id] || member.mcpSettings || member.mcp || {}) }
        }))
      : [{
          actorId: chat && chat.id,
          actorName: chat && chat.name || '当前角色',
          settings: getChatMcpSettings(chat)
        }];

    const entries = [];
    subjects.forEach(subject => {
      const settings = subject.settings;
      if (!settings.enabled) return;
      collectCapabilities()
        .filter(entry => entry.kind === 'tools')
        .filter(({ connection, item }) => {
          if (!connection.enabled || ['disabled', 'manual_only'].includes(settings.mode) || !isToolAllowed(settings, connection.id, item.name)) return false;
          if (connection.availability === 'current_chat' && connection.chatId !== (chat && chat.id)) return false;
          if (requestedConnectionId && connection.id !== requestedConnectionId) return false;
          if (requestedToolName && item.name !== requestedToolName) return false;
          if (settings.mode === 'selected' && !directive && ![connection.name, item.name, item.title].filter(Boolean).some(name => String(userText || '').toLocaleLowerCase().includes(String(name).toLocaleLowerCase()))) return false;
          if (settings.mode === 'explicit' && !directive && !explicitToolMatches(userText, connection, item)) return false;
          if (settings.mode === 'rules' && !triggerRulesMatch(userText, settings.triggerRules)) return false;
          if (settings.mode === 'read_only_auto' && toolNeedsConfirmation({ toolName: item.name, title: item.title, annotations: item.annotations }, { confirmWrites: true })) return false;
          return true;
        })
        .forEach(({ connection, item }) => entries.push({
          actorId: subject.actorId,
          actorName: subject.actorName,
          connectionId: connection.id,
          connectionName: connection.name,
          toolName: item.name,
          title: item.title || item.name,
          description: `${isGroup ? `仅供群成员“${subject.actorName}”使用。` : ''}${item.description || `${connection.name} 提供的 MCP 工具`}`,
          inputSchema: item.inputSchema || { type: 'object', properties: {} },
          annotations: item.annotations || {},
          permissionSettings: settings,
          required: settings.mode === 'required'
        }));
    });
    return entries.slice(0, Math.max(1, Number(state.settings.maxCatalogTools) || 40));
  }

  function toolNeedsConfirmation(tool, settings) {
    if (!settings.confirmWrites) return false;
    const annotations = tool && tool.annotations || {};
    if (annotations.readOnlyHint === true) return false;
    if (annotations.destructiveHint === true || annotations.readOnlyHint === false) return true;
    return /(?:delete|remove|destroy|write|update|create|send|post|publish|execute|run|pay|purchase|删除|移除|修改|创建|发送|发布|执行|付款|购买)/i
      .test(`${tool && tool.toolName || ''} ${tool && tool.title || ''}`);
  }

  function normalizeToolResult(result, tool, maxLength) {
    const normalized = {
      ok: !(result && result.isError),
      connectionName: tool.connectionName,
      toolName: tool.toolName,
      text: '',
      structuredData: result && result.structuredContent !== undefined ? result.structuredContent : null,
      truncated: false
    };
    if (result && Array.isArray(result.content)) {
      normalized.text = result.content
        .filter(item => item && item.type === 'text' && typeof item.text === 'string')
        .map(item => item.text)
        .join('\n');
    }
    if (!normalized.text) normalized.text = resultSummary(result);
    const serialized = JSON.stringify({
      ...normalized,
      rawContent: normalized.structuredData == null ? result && result.content : undefined
    });
    const limit = Math.max(2000, Number(maxLength) || 20000);
    if (serialized.length <= limit) return JSON.parse(serialized);
    normalized.truncated = true;
    normalized.text = truncate(normalized.text, Math.max(500, limit - 500));
    if (normalized.structuredData != null) {
      normalized.structuredData = truncate(JSON.stringify(normalized.structuredData), Math.max(500, limit - normalized.text.length - 500));
    }
    return normalized;
  }

  async function executeToolForChat(options) {
    const chat = options && options.chat;
    const connectionId = options && options.connectionId;
    const toolName = options && options.toolName;
    const args = options && options.arguments || {};
    const connection = getConnection(connectionId);
    const tool = getToolsForChat(chat, {
      directive: { connectionId, toolName },
      userText: options && options.userText
    }).find(item =>
      item.connectionId === connectionId &&
      item.toolName === toolName &&
      (!options.actorId || item.actorId === options.actorId)
    );
    const settings = tool && tool.permissionSettings || getChatMcpSettings(chat);
    if (!chat || !connection || !tool || !isToolAllowed(settings, connectionId, toolName)) {
      throw new Error('该角色没有使用此 MCP 工具的权限。');
    }
    if (!connection.enabled) throw new Error('MCP 连接已停用。');

    if (toolNeedsConfirmation(tool, settings)) {
      const confirmed = await showCustomConfirm(
        '确认 MCP 操作',
        `“${escapeHtml(tool.actorName || chat.name || '当前角色')}”想要调用“${escapeHtml(connection.name)} · ${escapeHtml(tool.title)}”。此工具可能会修改外部数据。`,
        { confirmText: '允许调用' }
      );
      if (!confirmed) throw new Error('用户拒绝了此次 MCP 工具调用。');
    }

    const activity = await logActivity({
      connection,
      status: 'running',
      title: Array.isArray(chat.members) ? `${tool.actorName} · ${tool.title}` : tool.title,
      summary: `正在调用 ${connection.name} · ${tool.toolName}`,
      request: args,
      toolName: tool.toolName,
      chatId: settings.showActivityCards === false ? null : chat.id
    });
    await appendActivityToChat(activity, connection, 'running');

    try {
      if (connection.status !== 'online' || !connection.protocolVersion || !connection.sessionId) {
        await initializeConnection(connection, { signal: options && options.signal });
        await discoverCapabilities(connection, { signal: options && options.signal });
      }
      const result = await rpc(connection, 'tools/call', {
        name: tool.toolName,
        arguments: args
      }, { signal: options && options.signal });
      activity.status = result && result.isError ? 'failed' : 'success';
      activity.summary = resultSummary(result);
      activity.result = result;
      activity.error = result && result.isError ? activity.summary : undefined;
      await logActivity(activity);
      await appendActivityToChat(activity, connection, activity.status, result);
      await persistConnection({ ...connection, status: 'online', lastError: '', updatedAt: Date.now() });
      if (result && result.isError) throw new Error(activity.summary);
      return normalizeToolResult(result, tool, options && options.maxResultLength);
    } catch (error) {
      activity.status = error && error.name === 'AbortError' ? 'cancelled' : 'failed';
      activity.summary = error && error.name === 'AbortError' ? '工具调用已取消' : (error.message || String(error));
      activity.error = activity.summary;
      await logActivity(activity);
      await appendActivityToChat(activity, connection, activity.status);
      await persistConnection({ ...connection, status: 'error', lastError: activity.summary, updatedAt: Date.now() });
      throw error;
    }
  }

  async function appendActivityToChat(activity, connection, status, result) {
    if (!state.settings.showChatCards || !activity.chatId) return;
    const chat = getChatById(activity.chatId);
    if (!chat) return;
    const existingMessage = chat.history.find(message => message.type === 'mcp_activity' && message.mcpActivity && message.mcpActivity.id === activity.id);
    // 完成时只更新已存在的卡片；用户在执行中删除后不能再次写入聊天。
    if (!existingMessage && status !== 'running') return;
    const detail = state.settings.includeResultDetails && result ? JSON.stringify(result, null, 2) : '';
    const cardData = {
      id: activity.id,
      connectionId: connection.id,
      connectionName: connection.name,
      toolName: activity.toolName,
      title: activity.title,
      summary: activity.summary,
      status,
      detail,
      updatedAt: Date.now()
    };
    if (existingMessage) {
      existingMessage.id ||= `mcp_${activity.id}`;
      existingMessage.content = activity.summary;
      existingMessage.mcpActivity = cardData;
      if (typeof saveData === 'function') await saveData();
      updateMessageCardDom(cardData);
      return;
    }
    const message = {
      id: `mcp_${activity.id}`,
      role: 'assistant',
      type: 'mcp_activity',
      content: activity.summary || activity.title,
      mcpActivity: cardData,
      excludeFromContext: true,
      timestamp: Date.now()
    };
    chat.history.push(message);
    if (typeof saveData === 'function') await saveData();
    if (typeof currentChatId !== 'undefined' && currentChatId === chat.id && typeof renderMessages === 'function') renderMessages(false, true);
  }

  async function invokeTool(connectionId, toolName, args, syncChat) {
    const connection = getConnection(connectionId);
    if (!connection) return;
    const chatId = syncChat && canSyncToActiveChat(connection) && typeof currentChatId !== 'undefined' ? currentChatId : null;
    const activity = await logActivity({
      connection,
      status: 'running',
      title: toolName,
      summary: '正在调用外部工具',
      request: args,
      toolName,
      chatId
    });
    closeSheet();
    await appendActivityToChat(activity, connection, 'running');
    state.activeTab = 'activity';
    render();
    try {
      if (connection.status !== 'online' || !connection.protocolVersion || !connection.sessionId) {
        await initializeConnection(connection);
        await discoverCapabilities(connection);
      }
      const result = await rpc(connection, 'tools/call', { name: toolName, arguments: args });
      activity.status = result && result.isError ? 'failed' : 'success';
      activity.summary = resultSummary(result);
      activity.result = result;
      activity.error = result && result.isError ? activity.summary : undefined;
      await logActivity(activity);
      await appendActivityToChat(activity, connection, activity.status, result);
      await persistConnection({ ...connection, status: 'online', lastError: '', updatedAt: Date.now() });
      showToast(activity.status === 'success' ? 'MCP 工具调用完成' : 'MCP 工具返回错误', activity.status === 'success' ? 'success' : 'error');
    } catch (error) {
      activity.status = 'failed';
      activity.summary = error.message || String(error);
      activity.error = activity.summary;
      await logActivity(activity);
      await appendActivityToChat(activity, connection, 'failed');
      await persistConnection({ ...connection, status: 'error', lastError: activity.summary, updatedAt: Date.now() });
      await showCustomAlert('调用失败', activity.summary);
    } finally {
      await loadData();
      render();
    }
  }

  function showCapabilityUseForm(connection, kind, item) {
    const chat = getActiveChat();
    const isResource = kind === 'resources';
    const isTemplate = kind === 'resourceTemplates';
    showSheet(
      item.title || item.name || item.uri || item.uriTemplate || capabilityLabel(kind),
      `<div class="mcp-inline-notice info">${isResource || isTemplate ? '将从外部 MCP 读取此资源。内容不会自动发送给其他服务器。' : '将从外部 MCP 获取提示模板。返回内容会作为外部内容展示。'}</div>
       <div class="mcp-form" style="margin-top:12px;">
        <div class="mcp-field"><label>服务器</label><input value="${escapeHtml(connection.name)}" disabled></div>
        <div class="mcp-field"><label>${isResource || isTemplate ? '资源地址' : '提示名称'}</label><input id="mcp-resource-template-uri" value="${escapeHtml(isTemplate ? item.uriTemplate : isResource ? item.uri : item.name)}" ${isTemplate ? '' : 'disabled'}></div>
        ${isResource || isTemplate ? '' : '<div class="mcp-field"><label for="mcp-capability-arguments">提示参数（JSON）</label><textarea id="mcp-capability-arguments" spellcheck="false">{}</textarea></div>'}
        ${chat && state.settings.showChatCards && canSyncToActiveChat(connection) ? `<label class="mcp-setting-row" style="padding:8px 0;border:0;"><div class="mcp-setting-main"><div class="mcp-setting-name">同步到对话</div><div class="mcp-setting-desc">在“${escapeHtml(chat.name || '当前聊天')}”中显示 MCP 活动卡片</div></div><span class="mcp-toggle"><input id="mcp-sync-chat" type="checkbox"><span></span></span></label>` : ''}
       </div>`,
      `<button type="button" class="mcp-secondary-btn" data-mcp-action="capability-details" data-id="${escapeHtml(connection.id)}" data-kind="${escapeHtml(kind)}" data-name="${escapeHtml(item.name || item.uri || '')}">详情</button>
       <button type="button" class="mcp-primary-btn" data-mcp-action="confirm-consume" data-id="${escapeHtml(connection.id)}" data-kind="${escapeHtml(kind)}" data-name="${escapeHtml(item.name || item.uri || item.uriTemplate || '')}">${isResource || isTemplate ? '确认读取' : '确认使用'}</button>`
    );
  }

  async function consumeCapability(connectionId, kind, name, args, syncChat) {
    const connection = getConnection(connectionId);
    const item = findCapability(connection, kind, name);
    if (!connection || !item) return;
    const isResource = kind === 'resources' || kind === 'resourceTemplates';
    const resourceUri = kind === 'resourceTemplates' ? String(args && args.uri || '') : item.uri;
    const title = item.title || item.name || item.uri || item.uriTemplate;
    const chatId = syncChat && canSyncToActiveChat(connection) && typeof currentChatId !== 'undefined' ? currentChatId : null;
    const activity = await logActivity({
      connection,
      status: 'running',
      title,
      summary: isResource ? '正在读取外部资源' : '正在获取外部提示模板',
      request: isResource ? { uri: resourceUri } : args,
      toolName: isResource ? 'resources/read' : 'prompts/get',
      chatId
    });
    closeSheet();
    await appendActivityToChat(activity, connection, 'running');
    state.activeTab = 'activity';
    render();
    try {
      if (connection.status !== 'online' || !connection.protocolVersion || !connection.sessionId) {
        await initializeConnection(connection);
        await discoverCapabilities(connection);
      }
      const result = isResource
        ? await rpc(connection, 'resources/read', { uri: resourceUri })
        : await rpc(connection, 'prompts/get', { name: item.name, arguments: args });
      activity.status = 'success';
      activity.summary = resultSummary(result);
      activity.result = result;
      await logActivity(activity);
      await appendActivityToChat(activity, connection, 'success', result);
      await persistConnection({ ...connection, status: 'online', lastError: '', updatedAt: Date.now() });
      showToast(isResource ? 'MCP 资源读取完成' : 'MCP 提示词已获取', 'success');
    } catch (error) {
      activity.status = 'failed';
      activity.summary = error.message || String(error);
      activity.error = activity.summary;
      await logActivity(activity);
      await appendActivityToChat(activity, connection, 'failed');
      await persistConnection({ ...connection, status: 'error', lastError: activity.summary, updatedAt: Date.now() });
      await showCustomAlert(isResource ? '读取失败' : '获取失败', activity.summary);
    } finally {
      await loadData();
      render();
    }
  }

  async function toggleResourceSubscription(connectionId, uri) {
    const connection = getConnection(connectionId);
    if (!connection || !uri) return;
    const key = `${connectionId}:${uri}`;
    const existing = state.subscriptions.get(key);
    try {
      if (connection.status !== 'online' || !connection.protocolVersion || !connection.sessionId) await initializeConnection(connection);
      await rpc(connection, existing ? 'resources/unsubscribe' : 'resources/subscribe', { uri });
      if (existing) {
        await dexieDB.mcpSubscriptions.delete(existing.id);
        state.subscriptions.delete(key);
      } else {
        const record = { id: uid('subscription'), connectionId, uri, status: 'active', createdAt: Date.now(), updatedAt: Date.now() };
        await dexieDB.mcpSubscriptions.put(record);
        state.subscriptions.set(key, record);
        startEventStream(connection);
      }
      await logActivity({ connection, status: 'success', title: existing ? '资源订阅已取消' : '资源订阅已开启', summary: uri });
      render();
      showToast(existing ? '已取消资源订阅' : '已订阅资源更新', 'success');
    } catch (error) {
      await logActivity({ connection, status: 'failed', title: existing ? '取消资源订阅失败' : '资源订阅失败', summary: error.message || String(error) });
      await showCustomAlert('订阅操作失败', error.message || String(error));
    }
  }

  async function requestCapability(connectionId, method, params, options) {
    const connection = getConnection(connectionId);
    if (!connection || !connection.enabled) throw new Error('MCP 连接不存在或已停用。');
    if (!connection.protocolVersion || !connection.sessionId) await initializeConnection(connection, options);
    return rpc(connection, method, params || {}, options || {});
  }

  async function completeArgument(connectionId, ref, argument, context, options) {
    return requestCapability(connectionId, 'completion/complete', { ref, argument, ...(context ? { context } : {}) }, options);
  }

  function renderMessageCard(message) {
    const data = message.mcpActivity || {};
    const status = data.status || 'success';
    const detail = data.detail || '';
    return `
      <div class="mcp-message-card ${escapeHtml(status)}" data-mcp-activity-id="${escapeHtml(data.id || '')}">
        <div class="mcp-message-head">
          <span class="mcp-message-source">${escapeHtml(data.connectionName || 'MCP')}</span>
          <span class="mcp-status-tag ${escapeHtml(status)}">${escapeHtml(STATUS_LABELS[status] || status)}</span>
        </div>
        <div class="mcp-message-body">
          <div class="mcp-message-title">${escapeHtml(data.title || data.toolName || 'MCP 活动')}</div>
          <div class="mcp-message-summary">${escapeHtml(data.summary || message.content || '')}</div>
        </div>
        ${detail ? `<button type="button" class="mcp-message-toggle" data-mcp-card-toggle>查看执行详情</button><div class="mcp-message-detail">${escapeHtml(detail)}</div>` : ''}
      </div>`;
  }

  function updateMessageCardDom(cardData) {
    document.querySelectorAll('.mcp-message-card[data-mcp-activity-id]').forEach(card => {
      if (card.dataset.mcpActivityId !== cardData.id) return;
      const expanded = card.classList.contains('expanded');
      const container = document.createElement('div');
      container.innerHTML = renderMessageCard({ mcpActivity: cardData });
      const updatedCard = container.firstElementChild;
      if (expanded && cardData.detail) {
        updatedCard.classList.add('expanded');
        updatedCard.querySelector('[data-mcp-card-toggle]').textContent = '收起执行详情';
      }
      card.replaceWith(updatedCard);
    });
  }

  function showCapabilityDetails(connection, kind, item) {
    showSheet(
      item.title || item.name || item.uri || '能力详情',
      `<dl class="mcp-detail-grid">
        <dt>服务器</dt><dd>${escapeHtml(connection.name)}</dd>
        <dt>类型</dt><dd>${capabilityLabel(kind)}</dd>
        <dt>名称</dt><dd>${escapeHtml(item.name || item.uri || '未命名')}</dd>
        <dt>描述</dt><dd>${escapeHtml(item.description || '无')}</dd>
      </dl>
      <pre class="mcp-json-block">${escapeHtml(JSON.stringify(item, null, 2))}</pre>`,
      `<button type="button" class="mcp-primary-btn" data-mcp-action="close-sheet">完成</button>`
    );
  }

  function showActivityDetails(activity) {
    showSheet(
      activity.title || 'MCP 活动',
      `<dl class="mcp-detail-grid">
        <dt>连接</dt><dd>${escapeHtml(activity.connectionName || '未知')}</dd>
        <dt>状态</dt><dd><span class="mcp-status-tag ${escapeHtml(activity.status)}">${escapeHtml(STATUS_LABELS[activity.status] || activity.status)}</span></dd>
        <dt>时间</dt><dd>${formatTime(activity.createdAt, true)}</dd>
        <dt>摘要</dt><dd>${escapeHtml(activity.summary || '无')}</dd>
      </dl>
      ${activity.request ? `<div class="mcp-section-title">请求参数</div><pre class="mcp-json-block">${escapeHtml(JSON.stringify(activity.request, null, 2))}</pre>` : ''}
      ${activity.result ? `<div class="mcp-section-title">返回结果</div><pre class="mcp-json-block">${escapeHtml(JSON.stringify(activity.result, null, 2))}</pre>` : ''}
      ${activity.error ? `<div class="mcp-inline-notice" style="margin-top:12px;">${escapeHtml(activity.error)}</div>` : ''}`,
      `<button type="button" class="mcp-primary-btn" data-mcp-action="close-sheet">完成</button>`
    );
  }

  function sanitizedConnection(connection) {
    const copy = JSON.parse(JSON.stringify(connection));
    delete copy.secret;
    delete copy.accessToken;
    delete copy.refreshToken;
    delete copy.tokenExpiresAt;
    delete copy.sessionId;
    delete copy.pairingCode;
    delete copy.deviceId;
    delete copy.capabilities;
    delete copy.serverCapabilities;
    delete copy.serverInfo;
    delete copy.protocolVersion;
    delete copy.lastError;
    copy.enabled = false;
    copy.status = 'disabled';
    return copy;
  }

  async function exportConnections() {
    const payload = {
      kind: 'ephone-mcp-connections',
      format: 1,
      exportedAt: new Date().toISOString(),
      connections: state.connections.map(sanitizedConnection)
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    await OvoFileDownload.save(blob, `EPhone-MCP-${new Date().toISOString().slice(0, 10)}.json`);

  }

  async function importConnections(file) {
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      const list = Array.isArray(parsed) ? parsed : parsed.connections;
      if (!Array.isArray(list)) throw new Error('文件中没有连接配置列表。');
      const validTypes = new Set(Object.keys(CONNECTION_TYPES));
      const imported = list.map(item => {
        if (!item || !validTypes.has(item.type)) throw new Error(`存在不支持的连接类型：${item && item.type}`);
        const copy = sanitizedConnection(item);
        copy.id = uid('mcp');
        copy.name = String(copy.name || typeInfo(copy.type).label).slice(0, 60);
        copy.createdAt = Date.now();
        copy.updatedAt = Date.now();
        return copy;
      });
      await dexieDB.mcpConnections.bulkPut(imported);
      await loadData();
      render();
      showToast(`已导入 ${imported.length} 个连接，需重新授权后启用`, 'success');
    } catch (error) {
      await showCustomAlert('导入失败', error.message || String(error));
    } finally {
      els.importInput.value = '';
    }
  }

  async function deleteConnection(id) {
    const connection = getConnection(id);
    if (!connection) return;
    const confirmed = await showCustomConfirm('删除 MCP 连接', `将删除“${escapeHtml(connection.name)}”的配置和本地凭证。已有聊天活动卡片会保留。`, {
      confirmText: '删除',
      confirmButtonClass: 'btn-danger'
    });
    if (!confirmed) return;
    state.eventStreams.get(id)?.abort();
    state.eventStreams.delete(id);
    const client = state.clients.get(id);
    if (client) await client.close();
    state.clients.delete(id);
    await dexieDB.transaction('rw', dexieDB.mcpConnections, dexieDB.mcpSecrets, async () => {
      await dexieDB.mcpConnections.delete(id);
      await dexieDB.mcpSecrets.delete(id);
    });
    await dexieDB.mcpActivities.where('connectionId').equals(id).delete();
    await dexieDB.mcpSubscriptions.where('connectionId').equals(id).delete();
    closeSheet();
    await loadData();
    render();
    showToast('连接已删除', 'success');
  }

  async function launchShortcut(connection) {
    if (!connection || !connection.shortcutName) return;
    const confirmed = await showCustomConfirm('打开快捷指令', `即将离开当前页面并运行“${escapeHtml(connection.shortcutName)}”。快捷指令的权限和执行结果由 iOS 管理。`, { confirmText: '打开' });
    if (!confirmed) return;
    const activity = await logActivity({ connection, status: 'success', title: '启动快捷指令', summary: connection.shortcutName });
    await loadData();
    window.location.href = `shortcuts://run-shortcut?name=${encodeURIComponent(connection.shortcutName)}&input=text&text=${encodeURIComponent(JSON.stringify({ source: 'EPhone MCP', activityId: activity.id }))}`;
  }

  async function reconnectEligibleConnections() {
    const candidates = state.connections.filter(connection => connection.enabled && connection.endpoint && connection.status === 'online');
    for (const connection of candidates) {
      if (state.busy.has(connection.id)) continue;
      state.busy.add(connection.id);
      try {
        await initializeConnection(connection);
        await discoverCapabilities(connection);
        connection.status = 'online';
        connection.lastError = '';
        startEventStream(connection);
      } catch (error) {
        connection.status = 'error';
        connection.lastError = error.message || String(error);
      } finally {
        connection.updatedAt = Date.now();
        await persistConnection(connection);
        state.busy.delete(connection.id);
      }
    }
  }

  async function handleContentClick(event) {
    const target = event.target.closest('[data-mcp-action]');
    if (!target) return;
    const action = target.dataset.mcpAction;
    if (action === 'add') showTypeChooser();
    if (action === 'connections-tab') { state.activeTab = 'connections'; render(); }
    if (action === 'import') els.importInput.click();
    if (action === 'export') exportConnections();
    if (action === 'details') connectionDetails(getConnection(target.dataset.id));
    if (action === 'test') await testConnection(target.dataset.id);
    if (action === 'activity-details') {
      const activity = state.activities.find(item => item.id === target.dataset.id);
      if (activity) showActivityDetails(activity);
    }
    if (action === 'capability-details') {
      const connection = getConnection(target.dataset.id);
      const item = findCapability(connection, target.dataset.kind, target.dataset.name);
      if (connection && item) showCapabilityDetails(connection, target.dataset.kind, item);
    }
    if (action === 'invoke') {
      const connection = getConnection(target.dataset.id);
      const tool = findCapability(connection, 'tools', target.dataset.name);
      if (connection && tool) showInvokeForm(connection, tool);
    }
    if (action === 'consume-capability') {
      const connection = getConnection(target.dataset.id);
      const item = findCapability(connection, target.dataset.kind, target.dataset.name);
      if (connection && item) showCapabilityUseForm(connection, target.dataset.kind, item);
    }
    if (action === 'toggle-subscription') await toggleResourceSubscription(target.dataset.id, target.dataset.uri);
    if (action === 'clear-activity') {
      const confirmed = await showCustomConfirm('清除活动记录', '只清除 MCP 中心的活动日志，不会删除聊天中的 MCP 卡片。', { confirmText: '清除' });
      if (confirmed) {
        await dexieDB.mcpActivities.clear();
        await loadData();
        render();
      }
    }
  }

  async function handleSheetClick(event) {
    const typeButton = event.target.closest('[data-mcp-type]');
    if (typeButton) {
      connectionForm(typeButton.dataset.mcpType);
      return;
    }
    const target = event.target.closest('[data-mcp-action]');
    if (!target) return;
    const action = target.dataset.mcpAction;
    if (action === 'close-sheet') closeSheet();
    if (action === 'save-connection') await saveConnectionFromForm();
    if (action === 'edit') {
      const connection = getConnection(target.dataset.id);
      if (connection) connectionForm(connection.type, connection);
    }
    if (action === 'test') await testConnection(target.dataset.id);
    if (action === 'delete') await deleteConnection(target.dataset.id);
    if (action === 'launch-shortcut') await launchShortcut(getConnection(target.dataset.id));
    if (action === 'confirm-invoke') {
      let args;
      try {
        args = JSON.parse(document.getElementById('mcp-tool-arguments').value || '{}');
      } catch (error) {
        await showCustomAlert('参数有误', '调用参数必须是有效的 JSON 对象。');
        return;
      }
      if (!args || Array.isArray(args) || typeof args !== 'object') {
        await showCustomAlert('参数有误', '工具参数必须是 JSON 对象。');
        return;
      }
      const syncChat = !!document.getElementById('mcp-sync-chat')?.checked;
      await invokeTool(target.dataset.id, target.dataset.name, args, syncChat);
    }
    if (action === 'capability-details') {
      const connection = getConnection(target.dataset.id);
      const item = findCapability(connection, target.dataset.kind, target.dataset.name);
      if (connection && item) showCapabilityDetails(connection, target.dataset.kind, item);
    }
    if (action === 'confirm-consume') {
      let args = {};
      const input = document.getElementById('mcp-capability-arguments');
      if (input) {
        try { args = JSON.parse(input.value || '{}'); }
        catch (error) {
          await showCustomAlert('参数有误', '提示参数必须是有效的 JSON 对象。');
          return;
        }
      }
      if (!args || Array.isArray(args) || typeof args !== 'object') {
        await showCustomAlert('参数有误', '提示参数必须是 JSON 对象。');
        return;
      }
      if (target.dataset.kind === 'resourceTemplates') {
        args.uri = String(document.getElementById('mcp-resource-template-uri')?.value || '').trim();
        if (!args.uri || /\{[^}]+\}/.test(args.uri)) {
          await showCustomAlert('资源地址未完成', '请将资源模板中的占位符替换为实际值。');
          return;
        }
      }
      const syncChat = !!document.getElementById('mcp-sync-chat')?.checked;
      await consumeCapability(target.dataset.id, target.dataset.kind, target.dataset.name, args, syncChat);
    }
  }

  async function handleSettingChange(event) {
    const target = event.target.closest('[data-mcp-setting]');
    if (!target) return;
    const name = target.dataset.mcpSetting;
    state.settings[name] = target.type === 'checkbox' ? target.checked : Number(target.value);
    if (name === 'maxCallsPerTurn') state.settings[name] = Math.max(1, Math.min(30, state.settings[name] || 8));
    if (name === 'maxCatalogTools') state.settings[name] = Math.max(1, Math.min(100, state.settings[name] || 40));
    if (name === 'maxResultLength') state.settings[name] = Math.max(2000, Math.min(100000, state.settings[name] || 30000));
    await dexieDB.mcpSettings.put(state.settings);
    showToast('MCP 设置已保存', 'success', 1600);
  }

  function bindEvents() {
    document.getElementById('mcp-add-btn')?.addEventListener('click', showTypeChooser);
    document.getElementById('mcp-top-import-btn')?.addEventListener('click', () => els.importInput?.click());
    document.querySelectorAll('[data-mcp-tab]').forEach(tab => {
      tab.addEventListener('click', () => {
        state.activeTab = tab.dataset.mcpTab === 'tools' ? 'capabilities' : tab.dataset.mcpTab;
        render();
      });
    });
    els.content.addEventListener('click', event => {
      const quickType = event.target.closest('[data-mcp-type]');
      if (quickType) {
        connectionForm(quickType.dataset.mcpType);
        return;
      }
      handleContentClick(event);
    });
    els.content.addEventListener('change', handleSettingChange);
    els.sheetBody.addEventListener('click', handleSheetClick);
    els.sheetActions.addEventListener('click', handleSheetClick);
    els.sheetClose.addEventListener('click', closeSheet);
    els.sheetBackdrop.addEventListener('click', event => {
      if (event.target === els.sheetBackdrop || event.target.classList.contains('mcp-sheet-backdrop-blur')) closeSheet();
    });
    els.importInput.addEventListener('change', () => importConnections(els.importInput.files[0]));
    document.addEventListener('click', event => {
      const toggle = event.target.closest('[data-mcp-card-toggle]');
      if (!toggle) return;
      const card = toggle.closest('.mcp-message-card');
      if (!card) return;
      const expanded = card.classList.toggle('expanded');
      toggle.textContent = expanded ? '收起执行详情' : '查看执行详情';
    });
    document.addEventListener('visibilitychange', async () => {
      if (document.visibilityState !== 'visible' || !state.settings.autoReconnect || !state.initialized) return;
      const active = document.getElementById('mcp-screen')?.classList.contains('active');
      if (active) {
        await reconnectEligibleConnections();
        await loadData();
        render();
      }
    });
    window.addEventListener('online', async () => {
      if (!state.settings.autoReconnect || !state.initialized) return;
      await reconnectEligibleConnections();
      await loadData();
      render();
    });
  }

  function injectPermissionContainers() {
    const extension = document.getElementById('setting-tab-ext');
    if (extension && !document.getElementById('chat-mcp-settings')) {
      extension.insertAdjacentHTML('beforeend', '<div class="kkt-group" style="margin-top:15px;"><div style="margin-bottom:10px; padding-top:5px; padding-left:8px;"><div class="kkt-item-label" style="font-weight:bold; color:var(--primary-color);">MCP 工具权限</div></div><div class="kkt-item" style="display:block"><div id="chat-mcp-settings" style="width:100%"></div></div></div>');
    }
    const groupForm = document.getElementById('group-settings-form');
    if (groupForm && !document.getElementById('group-mcp-settings')) {
      groupForm.querySelector('.kkt-danger-btn')?.insertAdjacentHTML('beforebegin', '<div class="kkt-group" style="margin-top:15px;"><div style="margin-bottom:10px; padding-top:5px; padding-left:8px;"><div class="kkt-item-label" style="font-weight:bold; color:var(--primary-color);">MCP 工具权限</div></div><div class="kkt-item" style="display:block"><div id="group-mcp-settings" style="width:100%"></div></div></div>');
    }
  }

  async function init() {
    if (state.initialized || state.initializing) return;
    state.initializing = true;
    els = {
      content: document.getElementById('mcp-panel'),
      summaryTitle: document.getElementById('mcp-summary-title'),
      summaryDetail: document.getElementById('mcp-summary-detail'),
      summaryDot: document.getElementById('mcp-summary-dot'),
      sheetBackdrop: document.getElementById('mcp-sheet'),
      sheetTitle: document.getElementById('mcp-sheet-title'),
      sheetBody: document.getElementById('mcp-sheet-body'),
      sheetActions: document.getElementById('mcp-sheet-actions'),
      sheetClose: document.getElementById('mcp-sheet-close'),
      importInput: document.getElementById('mcp-import-input')
    };
    if (!els.content) {
      state.initializing = false;
      return;
    }
    try {
      bindEvents();
      await loadData();
      state.initialized = true;
      render();
    } finally {
      state.initializing = false;
    }
  }

  window.openMcpScreen = openMcpScreen;
  window.mcpManager = {
    init,
    open: openMcpScreen,
    renderMessageCard,
    callTool: invokeTool,
    executeTool: executeToolForChat,
    getToolsForChat,
    getChatSettings: getChatMcpSettings,
    injectPermissionContainers,
    renderPermissionEditor,
    readPermissionEditor,
    getConnections: () => state.connections.map(item => ({ ...item, secret: undefined, sessionId: undefined })),
    getEnabledTools: () => collectCapabilities().filter(item => item.kind === 'tools'),
    request: requestCapability,
    completeArgument,
    subscribeResource: async (connectionId, uri) => {
      if (!state.subscriptions.has(`${connectionId}:${uri}`)) await toggleResourceSubscription(connectionId, uri);
    },
    unsubscribeResource: async (connectionId, uri) => {
      if (state.subscriptions.has(`${connectionId}:${uri}`)) await toggleResourceSubscription(connectionId, uri);
    },
    getSettings: () => ({ ...state.settings })
  };
  window.McpManager = window.mcpManager;

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
