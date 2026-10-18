const saveImageApiGlobalSettings = () => saveGlobalSettings([
    'novelAiSettings', 'novelAiPresets', 'gptImageSettings', 'gptImagePresets',
    'googleImageSettings', 'googleImagePresets', 'stabilityImageSettings', 'stabilityImagePresets',
    'activeImageProvider', 'imageAtmosphereGroups', 'activeImageAtmosphereId',
    'autoCompressImage', 'imageGenTimeout'
]);

function setActiveImageProvider(provider) {
    const map = {
        gpt: ['gpt-image-enabled', 'gptImageSettings'],
        novelai: ['novelai-enabled', 'novelAiSettings'],
        google: ['google-image-enabled', 'googleImageSettings'],
        stability: ['stability-image-enabled', 'stabilityImageSettings']
    };
    db.activeImageProvider = provider || '';
    Object.entries(map).forEach(([key, entry]) => {
        const active = key === provider;
        const checkbox = document.getElementById(entry[0]);
        if (checkbox) checkbox.checked = active;
        if (db[entry[1]]) db[entry[1]].enabled = active;
    });
}

function setupGptImageSettings() {
    const urlEl = document.getElementById('gpt-image-url');
    const keyEl = document.getElementById('gpt-image-key');
    const modelEl = document.getElementById('gpt-image-model');
    const modelSelectEl = document.getElementById('gpt-image-model-select');
    const fetchModelsBtn = document.getElementById('gpt-image-fetch-models-btn');
    const sizeEl = document.getElementById('gpt-image-size');
    const sysPromptEl = document.getElementById('gpt-image-system-prompt');
    const negPromptEl = document.getElementById('gpt-image-negative-prompt');
    const saveBtn = document.getElementById('gpt-image-save-btn');
    const testBtn = document.getElementById('gpt-image-test-btn');

    // 预设管理DOM
    const presetSelect = document.getElementById('gpt-image-preset-select');
    const applyPresetBtn = document.getElementById('gpt-image-apply-preset');
    const savePresetBtn = document.getElementById('gpt-image-save-preset');
    const managePresetBtn = document.getElementById('gpt-image-manage-presets');
    const importPresetBtn = document.getElementById('gpt-image-import-presets');
    const exportPresetBtn = document.getElementById('gpt-image-export-presets');
    const manageModal = document.getElementById('gpt-image-presets-modal');
    const closeModalBtn = document.getElementById('gpt-image-close-modal');
    const presetListContainer = document.getElementById('gpt-image-presets-list');

    // 互斥开关逻辑
    const gptEnabledCheckbox = document.getElementById('gpt-image-enabled');
    if (gptEnabledCheckbox) {
        gptEnabledCheckbox.addEventListener('change', function() {
            if (this.checked) {
                const novelaiEnabledCheckbox = document.getElementById('novelai-enabled');
                if (novelaiEnabledCheckbox && novelaiEnabledCheckbox.checked) {
                    novelaiEnabledCheckbox.checked = false;
                    showToast('已自动关闭 NovelAI 生图，两种生图引擎只能开启一个');
                }
            }
        });
    }

    // 加载设置
    if (db.gptImageSettings) {
        const s = db.gptImageSettings;
        const enabledEl = document.getElementById('gpt-image-enabled');
        if (enabledEl) enabledEl.checked = !!s.enabled;
        if (urlEl) urlEl.value = s.url || '';
        if (keyEl) keyEl.value = s.key || '';
        if (modelEl) modelEl.value = s.model || 'dall-e-3';
        let defaultSize = '512x512';
        if (Object.keys(s).length > 0 && !s.size) {
            defaultSize = '1024x1024';
        }
        if (sizeEl) sizeEl.value = s.size || defaultSize;
        if (sysPromptEl) sysPromptEl.value = s.systemPrompt || '';
        if (negPromptEl) negPromptEl.value = s.negativePrompt || '';
    }

    // 保存设置
    if (saveBtn) {
        saveBtn.addEventListener('click', async () => {
            const enabledEl = document.getElementById('gpt-image-enabled');
            let defaultSize = '512x512';
            if (db.gptImageSettings && Object.keys(db.gptImageSettings).length > 0 && !db.gptImageSettings.size) {
                defaultSize = '1024x1024';
            }
            db.gptImageSettings = {
                enabled: enabledEl ? enabledEl.checked : false,
                url: urlEl ? urlEl.value.trim() : '',
                key: keyEl ? keyEl.value.trim() : '',
                model: modelEl ? modelEl.value.trim() : 'dall-e-3',
                size: sizeEl ? sizeEl.value : defaultSize,
                systemPrompt: sysPromptEl ? sysPromptEl.value.trim() : '',
                negativePrompt: negPromptEl ? negPromptEl.value.trim() : ''
            };
            if (db.gptImageSettings.enabled) setActiveImageProvider('gpt');
            await saveImageApiGlobalSettings();
            showToast('GPT 生图设置已保存！');
        });
    }

    // 拉取模型
    if (fetchModelsBtn) {
        fetchModelsBtn.addEventListener('click', () => window.fetchAndPopulateGptModels(true));
    }

    if (modelSelectEl) {
        modelSelectEl.addEventListener('change', () => {
            if (modelSelectEl.value && modelEl) {
                modelEl.value = modelSelectEl.value;
            }
        });
    }

    // 测试生图
    if (testBtn) {
        testBtn.addEventListener('click', async () => {
            const url = urlEl ? urlEl.value.trim() : '';
            const key = keyEl ? keyEl.value.trim() : '';
            if (!url || !key) {
                showToast('请先填写 GPT API 地址和 Key');
                return;
            }

            testBtn.disabled = true;
            testBtn.querySelector('.btn-text').textContent = '⏳ 生成中...';

            try {
                // 如果 window.generateGptImage 还没有加载出来，做个安全检查
                if (typeof generateGptImage !== 'function') {
                    throw new Error('生图功能尚未就绪，请刷新重试');
                }

                let defaultSize = '512x512';
                if (db.gptImageSettings && Object.keys(db.gptImageSettings).length > 0 && !db.gptImageSettings.size) {
                    defaultSize = '1024x1024';
                }
                const result = await generateGptImage('1girl, beautiful, masterpiece', {
                    url: url,
                    key: key,
                    model: modelEl ? modelEl.value.trim() : 'dall-e-3',
                    size: sizeEl ? sizeEl.value : defaultSize,
                    systemPrompt: sysPromptEl ? sysPromptEl.value.trim() : '',
                    negativePrompt: negPromptEl ? negPromptEl.value.trim() : ''
                });

                if (result && result.imageUrl) {
                    const preview = document.getElementById('gpt-image-test-preview');
                    const img = document.getElementById('gpt-image-test-image');
                    if (preview && img) {
                        img.src = result.imageUrl;
                        preview.style.display = 'block';
                        img.onclick = () => {
                            if (typeof openImageViewer === 'function') {
                                openImageViewer(result.imageUrl);
                            }
                        };
                        img.style.cursor = 'zoom-in';
                    }
                    showToast('✅ GPT 测试生图成功！');
                }
            } catch (err) {
                console.error('[GPT Image] 测试生图失败:', err);
                showToast('❌ 生图失败: ' + (err.message || '未知错误'));
            } finally {
                testBtn.disabled = false;
                testBtn.querySelector('.btn-text').textContent = '🎨 测试 GPT 生图';
            }
        });
    }

    // 预设管理逻辑
    function _getGptPresets() {
        return db.gptImagePresets || [];
    }
    
    function _saveGptPresets(arr) {
        db.gptImagePresets = arr || [];
        saveImageApiGlobalSettings();
    }

    function populateGptPresets() {
        if (!presetSelect) return;
        const presets = _getGptPresets();
        presetSelect.innerHTML = '<option value="">— 选择 —</option>';
        presets.forEach(p => {
            const opt = document.createElement('option');
            opt.value = p.name;
            opt.textContent = p.name;
            presetSelect.appendChild(opt);
        });
    }

    populateGptPresets();

    if (applyPresetBtn) {
        applyPresetBtn.addEventListener('click', () => {
            const name = presetSelect.value;
            if (!name) return showToast('请先选择预设');
            const p = _getGptPresets().find(x => x.name === name);
            if (!p) return showToast('未找到该预设');

            const enabledEl = document.getElementById('gpt-image-enabled');
            if (enabledEl && p.data.enabled !== undefined) enabledEl.checked = !!p.data.enabled;
            if (urlEl && p.data.url !== undefined) urlEl.value = p.data.url;
            if (keyEl && p.data.key !== undefined) keyEl.value = p.data.key;
            if (modelEl && p.data.model !== undefined) {
                modelEl.value = p.data.model;
                if (modelSelectEl && Array.from(modelSelectEl.options).some(o => o.value === p.data.model)) {
                    modelSelectEl.value = p.data.model;
                }
            }
            if (sizeEl && p.data.size !== undefined) sizeEl.value = p.data.size;
            if (sysPromptEl && p.data.systemPrompt !== undefined) sysPromptEl.value = p.data.systemPrompt;
            if (negPromptEl && p.data.negativePrompt !== undefined) negPromptEl.value = p.data.negativePrompt;
            
            showToast(`已加载 GPT 预设：${name}`);
        });
    }

    if (savePresetBtn) {
        savePresetBtn.addEventListener('click', () => {
            const enabledEl = document.getElementById('gpt-image-enabled');
            let defaultSize = '512x512';
            if (db.gptImageSettings && Object.keys(db.gptImageSettings).length > 0 && !db.gptImageSettings.size) {
                defaultSize = '1024x1024';
            }
            const data = {
                enabled: enabledEl ? enabledEl.checked : false,
                url: urlEl ? urlEl.value.trim() : '',
                key: keyEl ? keyEl.value.trim() : '',
                model: modelEl ? modelEl.value.trim() : 'dall-e-3',
                size: sizeEl ? sizeEl.value : defaultSize,
                systemPrompt: sysPromptEl ? sysPromptEl.value.trim() : '',
                negativePrompt: negPromptEl ? negPromptEl.value.trim() : ''
            };
            
            const name = prompt('请输入预设名称（将覆盖同名预设）：');
            if (!name || !name.trim()) return;
            
            const presets = _getGptPresets();
            const idx = presets.findIndex(p => p.name === name.trim());
            const presetObj = { name: name.trim(), data: data };
            
            if (idx >= 0) presets[idx] = presetObj;
            else presets.push(presetObj);
            
            _saveGptPresets(presets);
            populateGptPresets();
            showToast('GPT 生图预设已保存');
        });
    }

    function renderGptPresetsList() {
        if (!presetListContainer) return;
        presetListContainer.innerHTML = '';
        const presets = _getGptPresets();
        if (presets.length === 0) {
            presetListContainer.innerHTML = '<p style="text-align:center;color:#999;padding:10px;">暂无预设</p>';
            return;
        }
        presets.forEach((p, idx) => {
            const row = document.createElement('div');
            row.style.cssText = 'display:flex;justify-content:space-between;align-items:center;padding:8px;border-bottom:1px solid #f0f0f0;';
            
            const nameDiv = document.createElement('div');
            nameDiv.style.cssText = 'flex:1;font-weight:500;';
            nameDiv.textContent = p.name;
            
            const btnWrap = document.createElement('div');
            btnWrap.style.cssText = 'display:flex;gap:6px;';
            
            const renameBtn = document.createElement('button');
            renameBtn.className = 'btn btn-small';
            renameBtn.textContent = '重命名';
            renameBtn.onclick = () => {
                const newName = prompt('输入新名称：', p.name);
                if (!newName || !newName.trim() || newName.trim() === p.name) return;
                const all = _getGptPresets();
                all[idx].name = newName.trim();
                _saveGptPresets(all);
                populateGptPresets();
                renderGptPresetsList();
            };
            
            const delBtn = document.createElement('button');
            delBtn.className = 'btn btn-danger btn-small';
            delBtn.textContent = '删除';
            delBtn.onclick = () => {
                if (!confirm('确定删除预设：' + p.name + '？')) return;
                const all = _getGptPresets();
                all.splice(idx, 1);
                _saveGptPresets(all);
                populateGptPresets();
                renderGptPresetsList();
            };
            
            btnWrap.appendChild(renameBtn);
            btnWrap.appendChild(delBtn);
            row.appendChild(nameDiv);
            row.appendChild(btnWrap);
            presetListContainer.appendChild(row);
        });
    }

    if (managePresetBtn) managePresetBtn.addEventListener('click', () => {
        if (!manageModal) return;
        renderGptPresetsList();
        manageModal.style.display = 'flex';
    });

    if (closeModalBtn) closeModalBtn.addEventListener('click', () => {
        if (manageModal) manageModal.style.display = 'none';
    });
    
    if (exportPresetBtn) exportPresetBtn.addEventListener('click', async () => {
        const presets = _getGptPresets();
        if (presets.length === 0) return showToast('暂无预设可导出');
        const safePresets = presets.map(p => ({ ...p, data: { ...(p.data || {}), key: '' } }));
        const blob = new Blob([JSON.stringify(safePresets, null, 2)], { type: 'application/json' });
        await OvoFileDownload.save(blob, `GPT_Image_Presets_${new Date().toISOString().slice(0, 10)}.json`);

    });

    if (importPresetBtn) importPresetBtn.addEventListener('click', () => {
        const inp = document.createElement('input');
        inp.type = 'file';
        inp.accept = '.json';
        inp.onchange = async (e) => {
            const file = e.target.files[0];
            if (!file) return;
            try {
                const text = await file.text();
                const imported = JSON.parse(text);
                if (!Array.isArray(imported)) {
                    showToast('格式不正确：需要预设数组');
                    return;
                }
                const presets = _getGptPresets();
                imported.forEach(p => {
                    if (p.name && p.data) {
                        const idx = presets.findIndex(exist => exist.name === p.name);
                        if (idx >= 0) presets[idx] = p;
                        else presets.push(p);
                    }
                });
                _saveGptPresets(presets);
                populateGptPresets();
                showToast(`成功导入 ${imported.length} 个 GPT 预设`);
            } catch (err) {
                showToast('导入失败：' + err.message);
            }
        };
        inp.click();
    });
}

function setupNovelAiSettings() {
    // --- 新增：全局生图超时时间配置初始化 ---
    if (typeof db !== 'undefined' && db.imageGenTimeout === undefined) db.imageGenTimeout = 0; // 默认 0s (不限制)
    const timeoutInput = document.getElementById('global-image-gen-timeout');
    if (timeoutInput) {
        timeoutInput.value = db.imageGenTimeout;
        timeoutInput.addEventListener('change', async (e) => {
            db.imageGenTimeout = parseInt(e.target.value, 10) || 0; // 0代表不限制
            await saveImageApiGlobalSettings();
            showToast('生图超时时间已保存');
        });
    }

    const autoCompressEl = document.getElementById('global-auto-compress-image');
    if (autoCompressEl) {
        if (typeof db.autoCompressImage !== 'undefined') {
            autoCompressEl.checked = db.autoCompressImage;
        } else {
            autoCompressEl.checked = true; // 默认开启
            db.autoCompressImage = true;
            if (typeof saveGlobalSettings === 'function') saveImageApiGlobalSettings();
        }
        autoCompressEl.addEventListener('change', async (e) => {
            db.autoCompressImage = e.target.checked;
            if (typeof saveGlobalSettings === 'function') await saveImageApiGlobalSettings();
            showToast('自动压缩生图设置已保存');
        });
    }

    const enabledEl = document.getElementById('novelai-enabled');
    if (enabledEl) {
        enabledEl.addEventListener('change', function() {
            if (this.checked) {
                const gptEnabledCheckbox = document.getElementById('gpt-image-enabled');
                if (gptEnabledCheckbox && gptEnabledCheckbox.checked) {
                    gptEnabledCheckbox.checked = false;
                    showToast('已自动关闭 GPT 生图，两种生图引擎只能开启一个');
                }
            }
        });
    }

    const tokenEl = document.getElementById('novelai-token');
    const customUrlEnabledEl = document.getElementById('novelai-custom-url-enabled');
    const customUrlContainer = document.getElementById('novelai-custom-url-container');
    const compatibleOptions = document.getElementById('novelai-compatible-options');
    const customUrlEl = document.getElementById('novelai-custom-url');
    const endpointModeEl = document.getElementById('novelai-endpoint-mode');
    const authModeEl = document.getElementById('novelai-auth-mode');
    const generatePathEl = document.getElementById('novelai-generate-path');
    const streamPathEl = document.getElementById('novelai-stream-path');
    const encodeVibePathEl = document.getElementById('novelai-encode-vibe-path');
    const authNameEl = document.getElementById('novelai-auth-name');
    const extraHeadersEl = document.getElementById('novelai-extra-headers');
    const modelEl = document.getElementById('novelai-api-model') || document.getElementById('novelai-model');
    const legacyModelEl = document.getElementById('novelai-model');
    const resolutionEl = document.getElementById('novelai-resolution');
    const samplerEl = document.getElementById('novelai-sampler');
    const noiseScheduleEl = document.getElementById('novelai-noise-schedule');
    const qualityToggleEl = document.getElementById('novelai-quality-toggle');
    const ucPresetEl = document.getElementById('novelai-uc-preset');
    const smeaEl = document.getElementById('novelai-smea');
    const smeaDynEl = document.getElementById('novelai-smea-dyn');
    const autoSmeaEl = document.getElementById('novelai-auto-smea');
    const cfgRescaleEl = document.getElementById('novelai-cfg-rescale');
    const seedEl = document.getElementById('novelai-seed');
    const imageFormatEl = document.getElementById('novelai-image-format');
    const stepsSlider = document.getElementById('novelai-steps');
    const stepsValue = document.getElementById('novelai-steps-value');
    const scaleSlider = document.getElementById('novelai-scale');
    const scaleValue = document.getElementById('novelai-scale-value');
    const systemPromptEl = document.getElementById('novelai-system-prompt');
    const artistTagsEl = document.getElementById('novelai-artist-tags');
    const negativePromptEl = document.getElementById('novelai-negative-prompt');
    const saveBtn = document.getElementById('novelai-save-btn');
    const testBtn = document.getElementById('novelai-test-btn');

    // === NovelAI 预设管理相关 DOM ===
    const presetSelect = document.getElementById('novelai-preset-select');
    const applyPresetBtn = document.getElementById('novelai-apply-preset');
    const savePresetBtn = document.getElementById('novelai-save-preset');
    const managePresetBtn = document.getElementById('novelai-manage-presets');
    const importPresetBtn = document.getElementById('novelai-import-presets');
    const exportPresetBtn = document.getElementById('novelai-export-presets');
    const manageModal = document.getElementById('novelai-presets-modal');
    const closeModalBtn = document.getElementById('novelai-close-modal');
    const presetListContainer = document.getElementById('novelai-presets-list');

    const generationModeEl = document.getElementById('novelai-generation-mode');
    const qualityPresetEl = document.getElementById('novelai-quality-preset');
    const transparentEl = document.getElementById('novelai-transparent-background');
    const readNovelAiPanel = () => ({
        ...db.novelAiSettings,
        enabled: enabledEl?.checked || false, token: tokenEl?.value.trim() || '',
        customUrlEnabled: !!customUrlEnabledEl?.checked, customUrl: customUrlEl?.value.trim() || '',
        model: modelEl?.value || 'nai-diffusion-4-curated-preview', resolution: resolutionEl?.value || '832x1216',
        sampler: samplerEl?.value || 'k_euler', noiseSchedule: noiseScheduleEl?.value || 'karras',
        qualityToggle: qualityToggleEl?.checked !== false, qualityPresetId: qualityPresetEl?.value || 'standard',
        ucPreset: Number(ucPresetEl?.value || 0), ucPresetId: ['heavy', 'light', 'humanFocus', 'none', 'furryFocus'][Number(ucPresetEl?.value || 0)],
        generationMode: generationModeEl?.value || 'auto', transparentBackground: !!transparentEl?.checked,
        smea: !!smeaEl?.checked, smeaDyn: !!smeaDynEl?.checked, autoSmea: !!autoSmeaEl?.checked,
        cfgRescale: Number(cfgRescaleEl?.value || 0), seed: seedEl?.value === '' ? '' : Number(seedEl?.value || 0),
        imageFormat: imageFormatEl?.value || 'png', steps: Number(stepsSlider?.value || 28), scale: Number(scaleSlider?.value || 5),
        systemPrompt: systemPromptEl?.value.trim() || '', artistTags: artistTagsEl?.value.trim() || '', negativePrompt: negativePromptEl?.value || '',
        ...readCompatibleOptions()
    });
    window.readNovelAiPanelSettings = readNovelAiPanel;
    const loadAdditionalSettings = s => {
        if (generationModeEl) generationModeEl.value = s.generationMode || 'auto';
        if (qualityPresetEl) qualityPresetEl.value = s.qualityPresetId || 'standard';
        if (transparentEl) transparentEl.checked = !!s.transparentBackground;
        if (ucPresetEl && s.ucPresetId) { const index = ['heavy', 'light', 'humanFocus', 'none', 'furryFocus'].indexOf(s.ucPresetId.replace('human_focus', 'humanFocus')); if (index >= 0) ucPresetEl.value = String(index); }
    };
    const refreshCapabilities = () => {
        const v5 = /nai-diffusion-5/.test(modelEl?.value || '');
        const tip = document.getElementById('novelai-capability-tip');
        if (tip) tip.textContent = v5 ? 'V5：Guidance 0–10，使用 Karras；SMEA 设置保留但不发送。透明背景仅 V5 可用。' : '保留当前采样设置；透明背景仅 V5 可用，Light 质量预设仅 V5。';
    };
    modelEl?.addEventListener('change', refreshCapabilities);
    const readCompatibleOptions = () => {
        let extraHeaders = null;
        const raw = extraHeadersEl?.value.trim();
        if (raw) {
            extraHeaders = JSON.parse(raw);
            if (!extraHeaders || Array.isArray(extraHeaders) || typeof extraHeaders !== 'object') throw new Error('额外请求头必须是 JSON 对象');
        }
        const authMode = authModeEl?.value || 'bearer';
        return {
            endpointMode: endpointModeEl?.value || 'auto', authMode,
            generatePath: generatePathEl?.value.trim() || '/ai/generate-image',
            streamPath: streamPathEl?.value.trim() || '/ai/generate-image-stream',
            encodeVibePath: encodeVibePathEl?.value.trim() || '/ai/encode-vibe',
            authHeaderName: authMode === 'header' ? (authNameEl?.value.trim() || 'Authorization') : '',
            authQueryName: authMode === 'query' ? (authNameEl?.value.trim() || 'key') : '',
            extraHeaders
        };
    };

    // 加载已保存的设置
    if (db.novelAiSettings) {
        const s = db.novelAiSettings;
        if (enabledEl) enabledEl.checked = !!s.enabled;
        if (tokenEl) tokenEl.value = s.token || '';
        if (customUrlEnabledEl) {
            customUrlEnabledEl.checked = !!s.customUrlEnabled;
            if (customUrlContainer) customUrlContainer.style.display = s.customUrlEnabled ? 'flex' : 'none';
            if (compatibleOptions) compatibleOptions.style.display = s.customUrlEnabled ? 'block' : 'none';
        }
        if (customUrlEl) customUrlEl.value = s.customUrl || '';
        if (endpointModeEl) endpointModeEl.value = s.endpointMode || 'auto';
        if (authModeEl) authModeEl.value = s.authMode || 'bearer';
        if (generatePathEl) generatePathEl.value = s.generatePath || '/ai/generate-image';
        if (streamPathEl) streamPathEl.value = s.streamPath || '/ai/generate-image-stream';
        if (encodeVibePathEl) encodeVibePathEl.value = s.encodeVibePath || '/ai/encode-vibe';
        if (authNameEl) authNameEl.value = s.authHeaderName || s.authQueryName || '';
        if (extraHeadersEl) extraHeadersEl.value = s.extraHeaders ? JSON.stringify(s.extraHeaders) : '';
        if (modelEl && s.model) modelEl.value = s.model;
        if (legacyModelEl && s.model) legacyModelEl.value = s.model;
        if (resolutionEl && s.resolution) resolutionEl.value = s.resolution;
        if (samplerEl && s.sampler) samplerEl.value = s.sampler;
        if (noiseScheduleEl) noiseScheduleEl.value = s.noiseSchedule || 'karras';
        if (qualityToggleEl) qualityToggleEl.checked = s.qualityToggle !== false;
        if (ucPresetEl) ucPresetEl.value = String(s.ucPreset ?? 0);
        if (smeaEl) smeaEl.checked = !!s.smea;
        if (smeaDynEl) smeaDynEl.checked = !!s.smeaDyn;
        if (autoSmeaEl) autoSmeaEl.checked = !!s.autoSmea;
        if (cfgRescaleEl) cfgRescaleEl.value = String(s.cfgRescale ?? 0);
        if (seedEl) seedEl.value = s.seed ?? '';
        if (imageFormatEl) imageFormatEl.value = s.imageFormat || 'png';
        if (stepsSlider && s.steps !== undefined) {
            stepsSlider.value = s.steps;
            if (stepsValue) stepsValue.textContent = s.steps;
        }
        if (scaleSlider && s.scale !== undefined) {
            scaleSlider.value = s.scale;
            if (scaleValue) scaleValue.textContent = s.scale;
        }
        if (systemPromptEl && s.systemPrompt !== undefined) {
            systemPromptEl.value = s.systemPrompt;
        }
        if (artistTagsEl && s.artistTags !== undefined) {
            artistTagsEl.value = s.artistTags;
        }
        if (negativePromptEl && s.negativePrompt !== undefined) {
            negativePromptEl.value = s.negativePrompt;
        }
    }

    loadAdditionalSettings(db.novelAiSettings || {});
    refreshCapabilities();

    // 滑块实时反馈
    if (stepsSlider && stepsValue) {
        stepsSlider.addEventListener('input', (e) => {
            stepsValue.textContent = e.target.value;
        });
    }
    if (scaleSlider && scaleValue) {
        scaleSlider.addEventListener('input', (e) => {
            scaleValue.textContent = e.target.value;
        });
    }
    modelEl?.addEventListener('change', () => {
        if (legacyModelEl && legacyModelEl !== modelEl) legacyModelEl.value = modelEl.value;
    });
    if (legacyModelEl && legacyModelEl !== modelEl) {
        legacyModelEl.addEventListener('change', () => {
            modelEl.value = legacyModelEl.value;
            modelEl.dispatchEvent(new Event('change'));
        });
    }
    
    if (customUrlEnabledEl && customUrlContainer) {
        customUrlEnabledEl.addEventListener('change', (e) => {
            customUrlContainer.style.display = e.target.checked ? 'flex' : 'none';
            if (compatibleOptions) compatibleOptions.style.display = e.target.checked ? 'block' : 'none';
        });
    }

    // 保存设置
    if (saveBtn) {
        saveBtn?.addEventListener('click', async () => {
            let compatible;
            try { compatible = readCompatibleOptions(); }
            catch (error) { showToast(error.message); return; }
            db.novelAiSettings = readNovelAiPanel();
            if (db.novelAiSettings.enabled) setActiveImageProvider('novelai');
            await saveImageApiGlobalSettings();
            showToast('NovelAI 生图设置已保存！');
        });
    }

    // 测试生图
    if (testBtn) {
        testBtn?.addEventListener('click', async () => {
            const token = tokenEl ? tokenEl.value.trim() : '';
            if (!token && (authModeEl?.value || 'bearer') !== 'none') {
                showToast('请先填写 NovelAI API Token');
                return;
            }

            testBtn.disabled = true;
            testBtn.querySelector('.btn-text').textContent = '⏳ 生成中...';
            const testController = new AbortController();
            const testTimeout = Number(db.imageGenTimeout) > 0 ? setTimeout(() => testController.abort(), Number(db.imageGenTimeout) * 1000) : null;

            try {
                const compatible = readCompatibleOptions();
                const result = await generateNovelAiImage('1girl, upper body, beautiful', readNovelAiPanel(), testController.signal);
                if (result && result.imageUrl) {
                    const preview = document.getElementById('novelai-test-preview');
                    const img = document.getElementById('novelai-test-image');
                    if (preview && img) {
                        img.src = result.imageUrl;
                        preview.style.display = 'block';
                        img.onclick = () => {
                            if (typeof openImageViewer === 'function') {
                                openImageViewer(result.imageUrl);
                            }
                        };
                        img.style.cursor = 'zoom-in';
                    }
                    showToast('✅ 测试生图成功！');
                }
            } catch (err) {
                console.error('[NovelAI] 测试生图失败:', err);
                showToast('❌ 生图失败: ' + (err.message || '未知错误'));
            } finally {
                clearTimeout(testTimeout);
                testBtn.disabled = false;
                testBtn.querySelector('.btn-text').textContent = '🎨 测试生图';
            }
        });
    }

    window.NovelAiStudio?.setup();

    // === NovelAI 预设管理逻辑 ===

    function _getNovelAiPresets() {
        return db.novelAiPresets || [];
    }
    
    function _saveNovelAiPresets(arr) {
        db.novelAiPresets = arr || [];
        saveImageApiGlobalSettings();

    }

    function populateNovelAiPresets() {
        if (!presetSelect) return;
        const presets = _getNovelAiPresets();
        presetSelect.innerHTML = '<option value="">— 选择 —</option>';
        presets.forEach(p => {
            const opt = document.createElement('option');
            opt.value = p.name;
            opt.textContent = p.name;
            presetSelect.appendChild(opt);
        });
    }

    // 初始渲染
    populateNovelAiPresets();

    if (applyPresetBtn) {
        applyPresetBtn.addEventListener('click', () => {
            const selectedName = presetSelect.value;
            if (!selectedName) return showToast('请先选择预设');
            const presets = _getNovelAiPresets();
            const p = presets.find(x => x.name === selectedName);
            if (!p) return showToast('未找到该预设');

            if (tokenEl && p.data.token !== undefined) tokenEl.value = p.data.token;
            if (customUrlEnabledEl && p.data.customUrlEnabled !== undefined) {
                customUrlEnabledEl.checked = !!p.data.customUrlEnabled;
                if (customUrlContainer) customUrlContainer.style.display = p.data.customUrlEnabled ? 'flex' : 'none';
                if (compatibleOptions) compatibleOptions.style.display = p.data.customUrlEnabled ? 'block' : 'none';
            }
            if (customUrlEl && p.data.customUrl !== undefined) customUrlEl.value = p.data.customUrl;
            if (endpointModeEl) endpointModeEl.value = p.data.endpointMode || 'auto';
            if (authModeEl) authModeEl.value = p.data.authMode || 'bearer';
            if (generatePathEl) generatePathEl.value = p.data.generatePath || '/ai/generate-image';
            if (streamPathEl) streamPathEl.value = p.data.streamPath || '/ai/generate-image-stream';
            if (encodeVibePathEl) encodeVibePathEl.value = p.data.encodeVibePath || '/ai/encode-vibe';
            if (authNameEl) authNameEl.value = p.data.authHeaderName || p.data.authQueryName || '';
            if (extraHeadersEl) extraHeadersEl.value = p.data.extraHeaders ? JSON.stringify(p.data.extraHeaders) : '';
            if (modelEl && p.data.model) modelEl.value = p.data.model;
            if (legacyModelEl && p.data.model) legacyModelEl.value = p.data.model;
            if (modelEl && p.data.model) modelEl.dispatchEvent(new Event('change'));
            if (resolutionEl && p.data.resolution) resolutionEl.value = p.data.resolution;
            if (samplerEl && p.data.sampler) samplerEl.value = p.data.sampler;
            if (noiseScheduleEl) noiseScheduleEl.value = p.data.noiseSchedule || 'karras';
            if (qualityToggleEl) qualityToggleEl.checked = p.data.qualityToggle !== false;
            if (ucPresetEl) ucPresetEl.value = String(p.data.ucPreset ?? 0);
            if (smeaEl) smeaEl.checked = !!p.data.smea;
            if (smeaDynEl) smeaDynEl.checked = !!p.data.smeaDyn;
            if (autoSmeaEl) autoSmeaEl.checked = !!p.data.autoSmea;
            if (cfgRescaleEl) cfgRescaleEl.value = String(p.data.cfgRescale ?? 0);
            if (seedEl) seedEl.value = p.data.seed ?? '';
            if (imageFormatEl) imageFormatEl.value = p.data.imageFormat || 'png';
            if (stepsSlider && p.data.steps !== undefined) {
                stepsSlider.value = p.data.steps;
                if (stepsValue) stepsValue.textContent = p.data.steps;
            }
            if (scaleSlider && p.data.scale !== undefined) {
                scaleSlider.value = p.data.scale;
                if (scaleValue) scaleValue.textContent = p.data.scale;
            }
            if (systemPromptEl && p.data.systemPrompt !== undefined) systemPromptEl.value = p.data.systemPrompt;
            if (artistTagsEl && p.data.artistTags !== undefined) artistTagsEl.value = p.data.artistTags;
            if (negativePromptEl && p.data.negativePrompt !== undefined) negativePromptEl.value = p.data.negativePrompt;
            if (Array.isArray(p.data.characterPrompts)) {
                db.novelAiSettings ||= {};
                db.novelAiSettings.characterPrompts = JSON.parse(JSON.stringify(p.data.characterPrompts));
                db.novelAiSettings.characterUseCoords = !!p.data.characterUseCoords;
                db.novelAiSettings.characterUseOrder = p.data.characterUseOrder !== false;
                document.dispatchEvent(new CustomEvent('novelai-character-settings-changed'));
            }
            
            loadAdditionalSettings(p.data);
            refreshCapabilities();
            showToast(`已加载 NovelAI 预设：${selectedName}`);
        });
    }

    if (savePresetBtn) {
        savePresetBtn.addEventListener('click', () => {
            let compatible;
            try { compatible = readCompatibleOptions(); }
            catch (error) { showToast(error.message); return; }
            const data = readNovelAiPanel();
            delete data.token;
            delete data.enabled;
            data.characterPrompts = JSON.parse(JSON.stringify(db.novelAiSettings?.characterPrompts || []));
            
            const name = prompt('请输入预设名称（将覆盖同名预设）：');
            if (!name || !name.trim()) return;
            
            const presets = _getNovelAiPresets();
            const idx = presets.findIndex(p => p.name === name.trim());
            const presetObj = { name: name.trim(), data: data };
            
            if (idx >= 0) {
                presets[idx] = presetObj;
            } else {
                presets.push(presetObj);
            }
            
            _saveNovelAiPresets(presets);
            populateNovelAiPresets();
            showToast('NovelAI 预设已保存');
        });
    }

    function renderPresetsList() {
        if (!presetListContainer) return;
        presetListContainer.innerHTML = '';
        const presets = _getNovelAiPresets();
        if (presets.length === 0) {
            presetListContainer.innerHTML = '<p style="text-align:center;color:#999;padding:10px;">暂无预设</p>';
            return;
        }
        presets.forEach((p, idx) => {
            const row = document.createElement('div');
            row.style.cssText = 'display:flex;justify-content:space-between;align-items:center;padding:8px;border-bottom:1px solid #f0f0f0;';
            
            const nameDiv = document.createElement('div');
            nameDiv.style.cssText = 'flex:1;font-weight:500;';
            nameDiv.textContent = p.name;
            
            const btnWrap = document.createElement('div');
            btnWrap.style.cssText = 'display:flex;gap:6px;';
            
            const renameBtn = document.createElement('button');
            renameBtn.className = 'btn btn-small';
            renameBtn.textContent = '重命名';
            renameBtn.onclick = () => {
                const newName = prompt('输入新名称：', p.name);
                if (!newName || !newName.trim() || newName.trim() === p.name) return;
                const all = _getNovelAiPresets();
                all[idx].name = newName.trim();
                _saveNovelAiPresets(all);
                populateNovelAiPresets();
                renderPresetsList();
            };
            
            const delBtn = document.createElement('button');
            delBtn.className = 'btn btn-danger btn-small';
            delBtn.textContent = '删除';
            delBtn.onclick = () => {
                if (!confirm('确定删除预设：' + p.name + '？')) return;
                const all = _getNovelAiPresets();
                all.splice(idx, 1);
                _saveNovelAiPresets(all);
                populateNovelAiPresets();
                renderPresetsList();
            };
            
            btnWrap.appendChild(renameBtn);
            btnWrap.appendChild(delBtn);
            row.appendChild(nameDiv);
            row.appendChild(btnWrap);
            presetListContainer.appendChild(row);
        });
    }

    if (managePresetBtn) {
        managePresetBtn.addEventListener('click', () => {
            if (!manageModal) return;
            renderPresetsList();
            manageModal.style.display = 'flex';
        });
    }

    if (closeModalBtn) {
        closeModalBtn.addEventListener('click', () => {
            if (manageModal) manageModal.style.display = 'none';
        });
    }
    
    if (exportPresetBtn) {
        exportPresetBtn.addEventListener('click', async () => {
            const presets = _getNovelAiPresets();
            if (presets.length === 0) return showToast('暂无预设可导出');
            const safePresets = presets.map(p => ({ ...p, data: { ...(p.data || {}), token: '' } }));
            const blob = new Blob([JSON.stringify(safePresets, null, 2)], { type: 'application/json' });
            await OvoFileDownload.save(blob, `NovelAI_Presets_${new Date().toISOString().slice(0, 10)}.json`);

        });
    }

    if (importPresetBtn) {
        importPresetBtn.addEventListener('click', () => {
            const inp = document.createElement('input');
            inp.type = 'file';
            inp.accept = '.json';
            inp.onchange = async (e) => {
                const file = e.target.files[0];
                if (!file) return;
                try {
                    const text = await file.text();
                    const imported = JSON.parse(text);
                    if (!Array.isArray(imported)) {
                        showToast('格式不正确：需要预设数组');
                        return;
                    }
                    const presets = _getNovelAiPresets();
                    imported.forEach(p => {
                        if (p.name && p.data) {
                            const idx = presets.findIndex(exist => exist.name === p.name);
                            if (idx >= 0) presets[idx] = p;
                            else presets.push(p);
                        }
                    });
                    _saveNovelAiPresets(presets);
                    populateNovelAiPresets();
                    showToast(`成功导入 ${imported.length} 个 NovelAI 预设`);
                } catch (err) {
                    showToast('导入失败：' + err.message);
                }
            };
            inp.click();
        });
    }
    // VIBE 数据依赖 IndexedDB；设置界面加载完成后再绑定其独立管理器。
    window.NovelAiVibe?.setupUI?.().catch(error => {
        console.error('[NovelAI VIBE] 初始化失败:', error);
        showToast(`VIBE 初始化失败：${error.message}`);
    });
}

function setupAdditionalImageProviders() {
    const providerDefs = {
        google: {
            settingKey: 'googleImageSettings', checkbox: 'google-image-enabled', save: 'google-image-save-btn', test: 'google-image-test-btn',
            preview: 'google-image-test-preview', image: 'google-image-test-image', generate: 'generateGoogleImage',
            defaults: { url: 'https://generativelanguage.googleapis.com', model: 'gemini-3.1-flash-image', aspectRatio: '' },
            fields: { url: 'google-image-url', key: 'google-image-key', model: 'google-image-model', aspectRatio: 'google-image-aspect-ratio', systemPrompt: 'google-image-system-prompt', negativePrompt: 'google-image-negative-prompt' }
        },
        stability: {
            settingKey: 'stabilityImageSettings', checkbox: 'stability-image-enabled', save: 'stability-image-save-btn', test: 'stability-image-test-btn',
            preview: 'stability-image-test-preview', image: 'stability-image-test-image', generate: 'generateStabilityImage',
            defaults: { url: 'https://api.stability.ai', service: 'core', aspectRatio: '1:1', outputFormat: 'png', stylePreset: '', seed: '' },
            fields: { url: 'stability-image-url', key: 'stability-image-key', service: 'stability-image-service', aspectRatio: 'stability-image-aspect-ratio', outputFormat: 'stability-image-output-format', stylePreset: 'stability-image-style-preset', seed: 'stability-image-seed', systemPrompt: 'stability-image-system-prompt', negativePrompt: 'stability-image-negative-prompt' }
        }
    };

    const readForm = def => {
        const value = { enabled: !!document.getElementById(def.checkbox)?.checked };
        Object.entries(def.fields).forEach(([key, id]) => { value[key] = document.getElementById(id)?.value?.trim?.() || ''; });
        if (value.seed !== undefined && value.seed !== '') value.seed = Math.max(0, Number.parseInt(value.seed, 10) || 0);
        return value;
    };

    Object.entries(providerDefs).forEach(([provider, def]) => {
        const settings = Object.assign({}, def.defaults, db[def.settingKey] || {});
        const checkbox = document.getElementById(def.checkbox);
        if (checkbox) checkbox.checked = !!settings.enabled;
        Object.entries(def.fields).forEach(([key, id]) => {
            const element = document.getElementById(id);
            if (element) element.value = settings[key] ?? def.defaults[key] ?? '';
        });
        checkbox?.addEventListener('change', () => {
            if (checkbox.checked) {
                setActiveImageProvider(provider);
                showToast(`已选择 ${provider === 'google' ? 'Google' : 'Stability'} 生图，保存后生效`);
            }
        });
        document.getElementById(def.save)?.addEventListener('click', async () => {
            const next = readForm(def);
            if (next.enabled && (!next.url || !next.key)) return showToast('请填写完整的 API 地址和密钥');
            db[def.settingKey] = next;
            if (next.enabled) setActiveImageProvider(provider);
            await saveImageApiGlobalSettings();
            showToast(`${provider === 'google' ? 'Google' : 'Stability'} 生图设置已保存`);
        });
        document.getElementById(def.test)?.addEventListener('click', async () => {
            const button = document.getElementById(def.test);
            const next = readForm(def);
            if (!next.url || !next.key) return showToast('请先填写 API 地址和密钥');
            const label = button?.querySelector('.btn-text');
            if (button) button.disabled = true;
            if (label) label.textContent = '⏳ 生成中...';
            try {
                const generator = window[def.generate];
                if (typeof generator !== 'function') throw new Error('生图服务未加载');
                const result = await generator('一只坐在窗边的猫，柔和自然光，高质量', next);
                const preview = document.getElementById(def.preview);
                const image = document.getElementById(def.image);
                if (preview && image && result?.imageUrl) {
                    image.src = result.imageUrl;
                    image.onclick = () => window.openImageViewer?.(result.imageUrl);
                    image.style.cursor = 'zoom-in';
                    preview.style.display = 'block';
                }
                showToast('✅ 测试生图成功');
            } catch (error) {
                console.error(`[${provider}] 测试失败:`, error);
                showToast(`❌ ${error.message || '测试失败'}`);
            } finally {
                if (button) button.disabled = false;
                if (label) label.textContent = provider === 'google' ? '🎨 测试 Google 生图' : '🎨 测试 Stability 生图';
            }
        });
    });

    ['gpt', 'novelai'].forEach(provider => {
        const id = provider === 'gpt' ? 'gpt-image-enabled' : 'novelai-enabled';
        document.getElementById(id)?.addEventListener('change', event => {
            if (event.target.checked) setActiveImageProvider(provider);
        });
    });

    // 绑定 Google 与 Stability 预设管理
    setupGenericImagePresets('google', {
        title: 'Google',
        presetKey: 'googleImagePresets',
        settingKey: 'googleImageSettings',
        fields: {
            url: 'google-image-url',
            key: 'google-image-key',
            model: 'google-image-model',
            aspectRatio: 'google-image-aspect-ratio',
            systemPrompt: 'google-image-system-prompt',
            negativePrompt: 'google-image-negative-prompt'
        },
        controls: {
            select: 'google-image-preset-select',
            applyBtn: 'google-image-apply-preset',
            saveBtn: 'google-image-save-preset',
            manageBtn: 'google-image-manage-presets',
            importBtn: 'google-image-import-presets',
            exportBtn: 'google-image-export-presets',
            modal: 'google-image-presets-modal',
            closeModalBtn: 'google-image-close-modal',
            listContainer: 'google-image-presets-list'
        }
    });

    setupGenericImagePresets('stability', {
        title: 'Stability',
        presetKey: 'stabilityImagePresets',
        settingKey: 'stabilityImageSettings',
        fields: {
            url: 'stability-image-url',
            key: 'stability-image-key',
            service: 'stability-image-service',
            aspectRatio: 'stability-image-aspect-ratio',
            outputFormat: 'stability-image-output-format',
            stylePreset: 'stability-image-style-preset',
            seed: 'stability-image-seed',
            systemPrompt: 'stability-image-system-prompt',
            negativePrompt: 'stability-image-negative-prompt'
        },
        controls: {
            select: 'stability-image-preset-select',
            applyBtn: 'stability-image-apply-preset',
            saveBtn: 'stability-image-save-preset',
            manageBtn: 'stability-image-manage-presets',
            importBtn: 'stability-image-import-presets',
            exportBtn: 'stability-image-export-presets',
            modal: 'stability-image-presets-modal',
            closeModalBtn: 'stability-image-close-modal',
            listContainer: 'stability-image-presets-list'
        }
    });
}

function setupGenericImagePresets(providerName, config) {
    const { title, presetKey, fields, controls } = config;
    const presetSelect = document.getElementById(controls.select);
    const applyPresetBtn = document.getElementById(controls.applyBtn);
    const savePresetBtn = document.getElementById(controls.saveBtn);
    const managePresetBtn = document.getElementById(controls.manageBtn);
    const importPresetBtn = document.getElementById(controls.importBtn);
    const exportPresetBtn = document.getElementById(controls.exportBtn);
    const manageModal = document.getElementById(controls.modal);
    const closeModalBtn = document.getElementById(controls.closeModalBtn);
    const presetListContainer = document.getElementById(controls.listContainer);

    function _getPresets() {
        return db[presetKey] || [];
    }

    function _savePresets(arr) {
        db[presetKey] = arr || [];
        saveImageApiGlobalSettings();
    }

    function populatePresets() {
        if (!presetSelect) return;
        const presets = _getPresets();
        presetSelect.innerHTML = '<option value="">— 选择 —</option>';
        presets.forEach(p => {
            const opt = document.createElement('option');
            opt.value = p.name;
            opt.textContent = p.name;
            presetSelect.appendChild(opt);
        });
    }

    populatePresets();

    if (applyPresetBtn) {
        applyPresetBtn.addEventListener('click', () => {
            const name = presetSelect ? presetSelect.value : '';
            if (!name) return showToast('请先选择预设');
            const p = _getPresets().find(x => x.name === name);
            if (!p) return showToast('未找到该预设');

            Object.entries(fields).forEach(([key, domId]) => {
                const el = document.getElementById(domId);
                if (el && p.data[key] !== undefined) {
                    el.value = p.data[key];
                }
            });

            showToast(`已加载 ${title} 预设：${name}`);
        });
    }

    if (savePresetBtn) {
        savePresetBtn.addEventListener('click', () => {
            const data = {};
            Object.entries(fields).forEach(([key, domId]) => {
                const el = document.getElementById(domId);
                data[key] = el ? el.value.trim() : '';
            });

            const name = prompt('请输入预设名称（将覆盖同名预设）：');
            if (!name || !name.trim()) return;

            const presets = _getPresets();
            const idx = presets.findIndex(p => p.name === name.trim());
            const presetObj = { name: name.trim(), data: data };

            if (idx >= 0) presets[idx] = presetObj;
            else presets.push(presetObj);

            _savePresets(presets);
            populatePresets();
            showToast(`${title} 生图预设已保存`);
        });
    }

    function renderPresetsList() {
        if (!presetListContainer) return;
        presetListContainer.innerHTML = '';
        const presets = _getPresets();
        if (presets.length === 0) {
            presetListContainer.innerHTML = '<p style="text-align:center;color:#999;padding:10px;">暂无预设</p>';
            return;
        }
        presets.forEach((p, idx) => {
            const row = document.createElement('div');
            row.style.cssText = 'display:flex;justify-content:space-between;align-items:center;padding:8px;border-bottom:1px solid #f0f0f0;';

            const nameDiv = document.createElement('div');
            nameDiv.style.cssText = 'flex:1;font-weight:500;';
            nameDiv.textContent = p.name;

            const btnWrap = document.createElement('div');
            btnWrap.style.cssText = 'display:flex;gap:6px;';

            const renameBtn = document.createElement('button');
            renameBtn.className = 'btn btn-small';
            renameBtn.textContent = '重命名';
            renameBtn.onclick = () => {
                const newName = prompt('输入新名称：', p.name);
                if (!newName || !newName.trim() || newName.trim() === p.name) return;
                const all = _getPresets();
                all[idx].name = newName.trim();
                _savePresets(all);
                populatePresets();
                renderPresetsList();
            };

            const delBtn = document.createElement('button');
            delBtn.className = 'btn btn-danger btn-small';
            delBtn.textContent = '删除';
            delBtn.onclick = () => {
                if (!confirm(`确定删除预设：${p.name}？`)) return;
                const all = _getPresets();
                all.splice(idx, 1);
                _savePresets(all);
                populatePresets();
                renderPresetsList();
            };

            btnWrap.appendChild(renameBtn);
            btnWrap.appendChild(delBtn);
            row.appendChild(nameDiv);
            row.appendChild(btnWrap);
            presetListContainer.appendChild(row);
        });
    }

    if (managePresetBtn) {
        managePresetBtn.addEventListener('click', () => {
            if (!manageModal) return;
            renderPresetsList();
            manageModal.style.display = 'flex';
        });
    }

    if (closeModalBtn) {
        closeModalBtn.addEventListener('click', () => {
            if (manageModal) manageModal.style.display = 'none';
        });
    }

    if (exportPresetBtn) {
        exportPresetBtn.addEventListener('click', async () => {
            const presets = _getPresets();
            if (presets.length === 0) return showToast('暂无预设可导出');
            const safePresets = presets.map(p => ({ ...p, data: { ...(p.data || {}), key: '' } }));
            const blob = new Blob([JSON.stringify(safePresets, null, 2)], { type: 'application/json' });
            await OvoFileDownload.save(blob, `${title}_Image_Presets_${new Date().toISOString().slice(0, 10)}.json`);

        });
    }

    if (importPresetBtn) {
        importPresetBtn.addEventListener('click', () => {
            const inp = document.createElement('input');
            inp.type = 'file';
            inp.accept = '.json';
            inp.onchange = async (e) => {
                const file = e.target.files[0];
                if (!file) return;
                try {
                    const text = await file.text();
                    const imported = JSON.parse(text);
                    if (!Array.isArray(imported)) {
                        showToast('格式不正确：需要预设数组');
                        return;
                    }
                    const presets = _getPresets();
                    imported.forEach(p => {
                        if (p.name && p.data) {
                            const idx = presets.findIndex(exist => exist.name === p.name);
                            if (idx >= 0) presets[idx] = p;
                            else presets.push(p);
                        }
                    });
                    _savePresets(presets);
                    populatePresets();
                    showToast(`成功导入 ${imported.length} 个 ${title} 预设`);
                } catch (err) {
                    showToast('导入失败：' + err.message);
                }
            };
            inp.click();
        });
    }
}

function setupImageAtmosphereGroups() {
    if (!Array.isArray(db.imageAtmosphereGroups)) db.imageAtmosphereGroups = [];
    const select = document.getElementById('image-atmosphere-select');
    const fields = {
        name: document.getElementById('image-atmosphere-name'),
        prompt: document.getElementById('image-atmosphere-prompt'),
        negativePrompt: document.getElementById('image-atmosphere-negative'),
        gpt: document.getElementById('image-atmosphere-gpt'),
        novelai: document.getElementById('image-atmosphere-novelai'),
        google: document.getElementById('image-atmosphere-google'),
        stability: document.getElementById('image-atmosphere-stability')
    };
    if (!select || !fields.name) return;

    const clearFields = () => Object.values(fields).forEach(element => { if (element) element.value = ''; });
    const renderSelect = () => {
        select.innerHTML = '<option value="">不选择旧文字预设</option>';
        db.imageAtmosphereGroups.forEach(group => {
            if (!group?.id || !group?.name) return;
            const option = document.createElement('option');
            option.value = group.id;
            option.textContent = group.name;
            select.appendChild(option);
        });
        select.value = db.imageAtmosphereGroups.some(group => group.id === db.activeImageAtmosphereId) ? db.activeImageAtmosphereId : '';
    };
    const loadSelected = () => {
        const group = db.imageAtmosphereGroups.find(item => item.id === select.value);
        if (!group) return clearFields();
        fields.name.value = group.name || '';
        fields.prompt.value = group.prompt || '';
        fields.negativePrompt.value = group.negativePrompt || '';
        Object.keys(group.providerPrompts || {}).forEach(key => { if (fields[key]) fields[key].value = group.providerPrompts[key] || ''; });
    };
    select.addEventListener('change', async () => {
        db.activeImageAtmosphereId = select.value || '';
        loadSelected();
        await saveImageApiGlobalSettings();
        showToast(select.value ? '已选择旧文字预设（不会自动注入生图）' : '已取消选择旧文字预设');
    });
    document.getElementById('image-atmosphere-new')?.addEventListener('click', () => {
        select.value = '';
        clearFields();
        fields.name.focus();
    });
    document.getElementById('image-atmosphere-save')?.addEventListener('click', async () => {
        const name = fields.name.value.trim();
        if (!name) return showToast('请填写氛围组名称');
        const id = select.value || `atmosphere_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
        const group = {
            id, name, enabled: true, prompt: fields.prompt.value.trim(), negativePrompt: fields.negativePrompt.value.trim(),
            providerPrompts: {
                gpt: fields.gpt.value.trim(), novelai: fields.novelai.value.trim(),
                google: fields.google.value.trim(), stability: fields.stability.value.trim()
            }
        };
        const index = db.imageAtmosphereGroups.findIndex(item => item.id === id);
        if (index >= 0) db.imageAtmosphereGroups[index] = group;
        else db.imageAtmosphereGroups.push(group);
        db.activeImageAtmosphereId = id;
        await saveImageApiGlobalSettings();
        renderSelect();
        loadSelected();
        showToast(index >= 0 ? '旧文字预设已更新' : '旧文字预设已创建（不会自动注入生图）');
    });
    document.getElementById('image-atmosphere-delete')?.addEventListener('click', async () => {
        if (!select.value) return showToast('请先选择要删除的氛围组');
        const decision = typeof showAppConfirmDialog === 'function'
            ? await showAppConfirmDialog({
                title: '删除氛围组', message: `确定删除“${fields.name.value || '当前氛围组'}”吗？`,
                confirmText: '删除', cancelText: '取消', dismissText: ''
            })
            : 'cancel';
        if (decision !== 'confirm') return;
        db.imageAtmosphereGroups = db.imageAtmosphereGroups.filter(item => item.id !== select.value);
        db.activeImageAtmosphereId = '';
        await saveImageApiGlobalSettings();
        renderSelect();
        clearFields();
        showToast('氛围组已删除');
    });
    document.getElementById('image-atmosphere-export')?.addEventListener('click', async () => {
        if (!db.imageAtmosphereGroups.length) return showToast('没有可导出的氛围组');
        const payload = { type: 'ovo-image-atmospheres', items: db.imageAtmosphereGroups };
        await OvoFileDownload.save(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }), `OVO_生图氛围组_${new Date().toISOString().slice(0, 10)}.json`);

    });
    document.getElementById('image-atmosphere-import')?.addEventListener('click', () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json,application/json';
        input.style.display = 'none';
        input.addEventListener('change', async () => {
            const file = input.files?.[0];
            if (!file) return input.remove();
            try {
                const parsed = JSON.parse(await file.text());
                const items = Array.isArray(parsed) ? parsed : parsed?.items;
                if (!Array.isArray(items)) throw new Error('文件中没有氛围组列表');
                let count = 0;
                items.forEach(item => {
                    if (!item || typeof item.name !== 'string' || typeof item.prompt !== 'string') return;
                    const same = db.imageAtmosphereGroups.find(existing => existing.id === item.id || existing.name === item.name);
                    const copy = JSON.parse(JSON.stringify(item));
                    if (same) copy.id = `atmosphere_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
                    if (!copy.id) copy.id = `atmosphere_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
                    copy.name = same ? `${copy.name}（导入）` : copy.name;
                    copy.enabled = copy.enabled !== false;
                    db.imageAtmosphereGroups.push(copy);
                    count++;
                });
                if (!count) throw new Error('没有可导入的有效氛围组');
                await saveImageApiGlobalSettings();
                renderSelect();
                showToast(`已导入 ${count} 个氛围组`);
            } catch (error) {
                showToast(`导入失败：${error.message}`);
            } finally {
                input.remove();
            }
        });
        document.body.appendChild(input);
        input.click();
    });

    renderSelect();
    loadSelected();
}
