(function() {
    const openSettingsBtn = document.getElementById('openSettingsBtn');
    const closeSettingsBtn = document.getElementById('closeSettingsBtn');
    const settingsOverlay = document.getElementById('settingsOverlay');
    const settingsBody = document.getElementById('settingsBody');

    const XOR_KEY = 'yx2024_key_7f3a9c';

    // ---- 打开/关闭设置 ----
    function openSettings() {
        settingsOverlay.classList.remove('hidden');
        buildSettingsUI(); // 每次打开重置视图
    }
    function closeSettings() {
        settingsOverlay.classList.add('hidden');
    }
    openSettingsBtn.addEventListener('click', openSettings);
    closeSettingsBtn.addEventListener('click', closeSettings);
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !settingsOverlay.classList.contains('hidden')) closeSettings();
    });

    // ---- 混淆 / 去混淆 ----
    function obfuscate(jsonStr) {
        let xored = '';
        for (let i = 0; i < jsonStr.length; i++) xored += String.fromCharCode(jsonStr.charCodeAt(i) ^ XOR_KEY.charCodeAt(i % XOR_KEY.length));
        let reversed = '';
        for (let i = xored.length - 1; i >= 0; i--) reversed += String.fromCharCode(xored.charCodeAt(i) + 1);
        return btoa(unescape(encodeURIComponent(reversed)));
    }
    function deobfuscate(b64) {
        const reversed = decodeURIComponent(escape(atob(b64)));
        let xored = '';
        for (let i = reversed.length - 1; i >= 0; i--) xored += String.fromCharCode(reversed.charCodeAt(i) - 1);
        let jsonStr = '';
        for (let i = 0; i < xored.length; i++) jsonStr += String.fromCharCode(xored.charCodeAt(i) ^ XOR_KEY.charCodeAt(i % XOR_KEY.length));
        return jsonStr;
    }

    // ---- 存档逻辑 ----
    function exportSave() {
        const data = window.GameAPI.exportSave();
        const content = 'YX1:' + obfuscate(JSON.stringify(data));
        const blob = new Blob([content], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = 'incremental_yx_save.json';
        document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
        showResult('存档已导出', false);
    }

    function importSaveFromText(text) {
        if (!text.startsWith('YX1:')) return showResult('存档无效：格式不正确', true);
        const b64 = text.slice(4).trim();
        if (!b64) return showResult('存档无效：内容为空', true);
        let data;
        try { data = JSON.parse(deobfuscate(b64)); } catch (e) { return showResult('存档无效：无法解析', true); }
        if (!window.confirm('导入存档将覆盖当前进度，确定继续吗？')) return;
        if (window.GameAPI.importSave(data)) showResult('存档导入成功', false);
        else showResult('存档无效：数据校验失败', true);
    }

    function importSaveFromFile(file) {
        const reader = new FileReader();
        reader.onload = (e) => importSaveFromText(e.target.result);
        reader.onerror = () => showResult('读取文件失败', true);
        reader.readAsText(file);
    }

    // ---- 提示 UI ----
    function showResult(msg, isError) {
        const el = document.getElementById('settingsResult');
        if (!el) return;
        el.textContent = msg;
        el.classList.toggle('error', isError);
        el.classList.add('visible');
        clearTimeout(el._timer);
        el._timer = setTimeout(() => el.classList.remove('visible'), 3000);
    }

    // ---- 构建界面 ----
    function buildSettingsUI() {
        settingsBody.innerHTML = '';
        const section = document.createElement('div');
        section.className = 'settings-section';

        const title = document.createElement('h3');
        title.className = 'settings-section-title';
        title.textContent = '存档管理';
        section.appendChild(title);

        // 导出按钮
        const exportBtn = document.createElement('button');
        exportBtn.className = 'settings-action-btn';
        exportBtn.textContent = '导出存档';
        exportBtn.addEventListener('click', exportSave);
        section.appendChild(exportBtn);

        // 导出文本框（隐藏）
        const exportTextarea = document.createElement('textarea');
        exportTextarea.className = 'settings-textarea hidden';
        exportTextarea.id = 'exportTextarea';
        exportTextarea.readOnly = true;
        exportTextarea.placeholder = '导出的存档文本将显示在这里';
        section.appendChild(exportTextarea);

        // 复制文本按钮
        const copyBtn = document.createElement('button');
        copyBtn.className = 'settings-action-btn secondary hidden';
        copyBtn.id = 'copyExportBtn';
        copyBtn.textContent = '复制文本';
        copyBtn.addEventListener('click', () => {
            const ta = document.getElementById('exportTextarea');
            if (ta) {
                ta.select();
                document.execCommand('copy');
                showResult('已复制到剪贴板', false);
            }
        });
        section.appendChild(copyBtn);

        // 分隔线
        const divider = document.createElement('div');
        divider.className = 'settings-divider';
        section.appendChild(divider);

        // 导入按钮（文件）
        const importFileBtn = document.createElement('button');
        importFileBtn.className = 'settings-action-btn secondary';
        importFileBtn.textContent = '从文件导入';
        const fileInput = document.createElement('input');
        fileInput.type = 'file'; fileInput.accept = '.json,application/json'; fileInput.className = 'hidden';
        fileInput.addEventListener('change', (e) => { const f = e.target.files[0]; if (f) importSaveFromFile(f); fileInput.value = ''; });
        importFileBtn.addEventListener('click', () => fileInput.click());
        section.appendChild(importFileBtn); section.appendChild(fileInput);

        // 导入按钮（文本）
        const importTextBtn = document.createElement('button');
        importTextBtn.className = 'settings-action-btn secondary';
        importTextBtn.textContent = '粘贴文本导入';
        const importTextarea = document.createElement('textarea');
        importTextarea.className = 'settings-textarea hidden';
        importTextarea.id = 'importTextarea';
        importTextarea.placeholder = '粘贴存档文本（YX1: 开头）';
        const confirmImportBtn = document.createElement('button');
        confirmImportBtn.className = 'settings-action-btn secondary hidden';
        confirmImportBtn.id = 'confirmImportBtn';
        confirmImportBtn.textContent = '确认导入';
        importTextBtn.addEventListener('click', () => {
            importTextarea.classList.toggle('hidden');
            confirmImportBtn.classList.toggle('hidden');
        });
        confirmImportBtn.addEventListener('click', () => {
            const text = importTextarea.value.trim();
            if (!text) return showResult('请先粘贴', true);
            importSaveFromText(text); importTextarea.value = '';
        });
        section.appendChild(importTextBtn); section.appendChild(importTextarea); section.appendChild(confirmImportBtn);

        // 结果提示
        const result = document.createElement('div');
        result.className = 'settings-result'; result.id = 'settingsResult';
        section.appendChild(result);

        settingsBody.appendChild(section);

        // 覆盖原来的导出事件，实现导出并显示文本
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
            showResult('存档已导出，可复制下方文本', false);
        });
    }

    // 初始化
    buildSettingsUI();
})();