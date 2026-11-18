(function() {
    const openSettingsBtn = document.getElementById('openSettingsBtn');
    const closeSettingsBtn = document.getElementById('closeSettingsBtn');
    const settingsOverlay = document.getElementById('settingsOverlay');
    const settingsBody = document.getElementById('settingsBody');

    // ---- 混淆密钥（硬编码，仅防手改，非安全加密）----
    const XOR_KEY = 'yx2024_key_7f3a9c';

    // ---- 打开/关闭设置 ----
    function openSettings() {
        settingsOverlay.classList.remove('hidden');
    }
    function closeSettings() {
        settingsOverlay.classList.add('hidden');
    }
    openSettingsBtn.addEventListener('click', openSettings);
    closeSettingsBtn.addEventListener('click', closeSettings);
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !settingsOverlay.classList.contains('hidden')) {
            closeSettings();
        }
    });

    // ---- 混淆 / 去混淆 ----
    // 导出：JSON -> 异或混淆 -> 反转 -> Base64
    function obfuscate(jsonStr) {
        // 1. 异或
        let xored = '';
        for (let i = 0; i < jsonStr.length; i++) {
            const c = jsonStr.charCodeAt(i);
            const k = XOR_KEY.charCodeAt(i % XOR_KEY.length);
            xored += String.fromCharCode(c ^ k);
        }
        // 2. 反转字符串 + 每个字符偏移 1（简单置换，进一步防止直接异或还原）
        let reversed = '';
        for (let i = xored.length - 1; i >= 0; i--) {
            reversed += String.fromCharCode(xored.charCodeAt(i) + 1);
        }
        // 3. Base64（处理 Unicode）
        return btoa(unescape(encodeURIComponent(reversed)));
    }

    // 导入：Base64 -> 反转/偏移还原 -> 异或 -> JSON
    function deobfuscate(b64) {
        // 1. Base64 解码（处理 Unicode）
        const reversed = decodeURIComponent(escape(atob(b64)));
        // 2. 反转/偏移还原
        let xored = '';
        for (let i = reversed.length - 1; i >= 0; i--) {
            xored += String.fromCharCode(reversed.charCodeAt(i) - 1);
        }
        // 3. 异或还原
        let jsonStr = '';
        for (let i = 0; i < xored.length; i++) {
            const c = xored.charCodeAt(i);
            const k = XOR_KEY.charCodeAt(i % XOR_KEY.length);
            jsonStr += String.fromCharCode(c ^ k);
        }
        return jsonStr;
    }

    // ---- 导出 ----
    function exportSave() {
        const data = window.GameAPI.exportSave();
        const jsonStr = JSON.stringify(data);
        const obfuscated = obfuscate(jsonStr);
        const content = 'YX1:' + obfuscated;

        // 下载为 .json 文件
        const blob = new Blob([content], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'incremental_yx_save.json';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        showExportResult('存档已导出');
    }

    // ---- 导入 ----
    function importSaveFromText(text) {
        // 校验前缀
        if (!text.startsWith('YX1:')) {
            showImportResult('存档无效：格式不正确', true);
            return;
        }
        const b64 = text.slice(4).trim();
        if (!b64) {
            showImportResult('存档无效：内容为空', true);
            return;
        }

        let data;
        try {
            const jsonStr = deobfuscate(b64);
            data = JSON.parse(jsonStr);
        } catch (e) {
            showImportResult('存档无效：无法解析', true);
            return;
        }

        // 弹确认
        const confirmed = window.confirm('导入存档将覆盖当前进度，确定继续吗？');
        if (!confirmed) return;

        const ok = window.GameAPI.importSave(data);
        if (ok) {
            showImportResult('存档导入成功');
        } else {
            showImportResult('存档无效：数据校验失败', true);
        }
    }

    function importSaveFromFile(file) {
        const reader = new FileReader();
        reader.onload = (e) => {
            importSaveFromText(e.target.result);
        };
        reader.onerror = () => {
            showImportResult('读取文件失败', true);
        };
        reader.readAsText(file);
    }

    // ---- 结果提示 ----
    function showExportResult(msg) {
        const el = document.getElementById('settingsResult');
        if (!el) return;
        el.textContent = msg;
        el.classList.remove('error');
        el.classList.add('visible');
        clearTimeout(el._timer);
        el._timer = setTimeout(() => {
            el.classList.remove('visible');
        }, 3000);
    }

    function showImportResult(msg, isError) {
        const el = document.getElementById('settingsResult');
        if (!el) return;
        el.textContent = msg;
        if (isError) {
            el.classList.add('error');
        } else {
            el.classList.remove('error');
        }
        el.classList.add('visible');
        clearTimeout(el._timer);
        el._timer = setTimeout(() => {
            el.classList.remove('visible');
        }, 4000);
    }

    // ---- 构建设置界面内容 ----
    function buildSettingsUI() {
        settingsBody.innerHTML = '';

        // 导入导出区域
        const section = document.createElement('div');
        section.className = 'settings-section';

        const title = document.createElement('h3');
        title.className = 'settings-section-title';
        title.textContent = '存档管理';
        section.appendChild(title);

        // 导出按钮
        const exportBtn = document.createElement('button');
        exportBtn.className = 'settings-action-btn';
        exportBtn.innerHTML = `
            <svg class="icon-small" viewBox="0 0 24 24">
                <path d="M12 3v12M8 11l4 4 4-4" />
                <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
            </svg>
            导出存档
        `;
        exportBtn.addEventListener('click', exportSave);
        section.appendChild(exportBtn);

        // 导出文本框（显示导出的文本，可复制）
        const exportTextarea = document.createElement('textarea');
        exportTextarea.className = 'settings-textarea hidden';
        exportTextarea.id = 'exportTextarea';
        exportTextarea.readOnly = true;
        exportTextarea.placeholder = '导出的存档文本将显示在这里';
        section.appendChild(exportTextarea);

        // 复制导出文本按钮
        const copyBtn = document.createElement('button');
        copyBtn.className = 'settings-action-btn secondary hidden';
        copyBtn.id = 'copyExportBtn';
        copyBtn.textContent = '复制文本';
        copyBtn.addEventListener('click', () => {
            const ta = document.getElementById('exportTextarea');
            if (ta) {
                ta.select();
                document.execCommand('copy');
                showExportResult('已复制到剪贴板');
            }
        });
        section.appendChild(copyBtn);

        // 分隔线
        const divider = document.createElement('div');
        divider.className = 'settings-divider';
        section.appendChild(divider);

        // 导入按钮（文件）
        const importFileBtn = document.createElement('button');
        importFileBtn.className = 'settings-action-btn';
        importFileBtn.innerHTML = `
            <svg class="icon-small" viewBox="0 0 24 24">
                <path d="M12 21V9M8 13l4-4 4 4" />
                <path d="M4 7v-2a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v2" />
            </svg>
            从文件导入
        `;
        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.accept = '.json,application/json';
        fileInput.className = 'hidden';
        fileInput.id = 'importFileInput';
        fileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                importSaveFromFile(file);
                fileInput.value = ''; // 允许重复选择同一文件
            }
        });
        importFileBtn.addEventListener('click', () => fileInput.click());
        section.appendChild(importFileBtn);
        section.appendChild(fileInput);

        // 导入按钮（粘贴文本）
        const importTextBtn = document.createElement('button');
        importTextBtn.className = 'settings-action-btn secondary';
        importTextBtn.textContent = '粘贴文本导入';
        importTextBtn.addEventListener('click', () => {
            const ta = document.getElementById('importTextarea');
            if (ta) {
                ta.classList.toggle('hidden');
            }
        });
        section.appendChild(importTextBtn);

        // 导入文本框
        const importTextarea = document.createElement('textarea');
        importTextarea.className = 'settings-textarea hidden';
        importTextarea.id = 'importTextarea';
        importTextarea.placeholder = '粘贴存档文本（YX1: 开头）';
        section.appendChild(importTextarea);

        // 确认导入文本按钮
        const confirmImportBtn = document.createElement('button');
        confirmImportBtn.className = 'settings-action-btn secondary hidden';
        confirmImportBtn.id = 'confirmImportBtn';
        confirmImportBtn.textContent = '确认导入';
        confirmImportBtn.addEventListener('click', () => {
            const ta = document.getElementById('importTextarea');
            if (ta) {
                const text = ta.value.trim();
                if (!text) {
                    showImportResult('请先粘贴存档文本', true);
                    return;
                }
                importSaveFromText(text);
                ta.value = '';
            }
        });
        section.appendChild(confirmImportBtn);

        // 提示文字
        const hint = document.createElement('p');
        hint.className = 'settings-hint';
        section.appendChild(hint);

        // 结果提示
        const result = document.createElement('div');
        result.className = 'settings-result';
        result.id = 'settingsResult';
        section.appendChild(result);

        settingsBody.appendChild(section);

        // 联动显示/隐藏文本域和复制按钮（在导出时动态控制）
        // 扩展 exportSave 以填充文本框
        const originalExport = exportSave;
        // 重写导出按钮行为：导出并显示文本
        exportBtn.removeEventListener('click', exportSave);
        exportBtn.addEventListener('click', () => {
            const data = window.GameAPI.exportSave();
            const jsonStr = JSON.stringify(data);
            const obfuscated = obfuscate(jsonStr);
            const content = 'YX1:' + obfuscated;

            // 下载
            const blob = new Blob([content], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'incremental_yx_save.json';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            // 显示文本框和复制按钮
            exportTextarea.value = content;
            exportTextarea.classList.remove('hidden');
            copyBtn.classList.remove('hidden');
            showExportResult('存档已导出，可复制下方文本');
        });

        // 导入文本框显示时，显示确认按钮
        importTextBtn.addEventListener('click', () => {
            const ta = document.getElementById('importTextarea');
            const btn = document.getElementById('confirmImportBtn');
            if (ta && btn) {
                const isHidden = ta.classList.toggle('hidden');
                if (isHidden) {
                    btn.classList.add('hidden');
                } else {
                    btn.classList.remove('hidden');
                }
            }
        });
    }

    // 初始化设置界面
    buildSettingsUI();
})();