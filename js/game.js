(function() {
    const Decimal = window.Decimal;
    if (!Decimal) { console.error('break_eternity.js 加载失败'); return; }

    const canvas = document.getElementById('gameCanvas');
    const ctx = canvas.getContext('2d');
    const width = canvas.width, height = canvas.height;
    const halfW = width / 2, halfH = height / 2;

    const titleText = document.getElementById('titleText');
    const xValueEl = document.getElementById('xValue');
    const yValueEl = document.getElementById('yValue');
    const kStat = document.getElementById('kStat'), kValueEl = document.getElementById('kValue');
    const bStat = document.getElementById('bStat'), bValueEl = document.getElementById('bValue');
    const timeValueEl = document.getElementById('timeValue');
    const formulaBar = document.getElementById('formulaBar');
    const resetBtn = document.getElementById('resetBtn');
    const guideText = document.getElementById('guideText');

    // 按钮
    const upgradeKBtn = document.getElementById('upgradeKBtn'), kPriceText = document.getElementById('kPriceText');
    const upgradeBBtn = document.getElementById('upgradeBBtn'), bPriceText = document.getElementById('bPriceText');
    const upgradeX2Btn = document.getElementById('upgradeX2Btn'), x2PriceText = document.getElementById('x2PriceText'), x2UpgradeItem = document.getElementById('x2UpgradeItem');
    const upgradeX3Btn = document.getElementById('upgradeX3Btn'), x3PriceText = document.getElementById('x3PriceText'), x3UpgradeItem = document.getElementById('x3UpgradeItem');
    const upgradeX4Btn = document.getElementById('upgradeX4Btn'), x4PriceText = document.getElementById('x4PriceText'), x4UpgradeItem = document.getElementById('x4UpgradeItem');
    const upgradeX5Btn = document.getElementById('upgradeX5Btn'), x5PriceText = document.getElementById('x5PriceText'), x5UpgradeItem = document.getElementById('x5UpgradeItem');
    const kUpgradeItem = document.getElementById('kUpgradeItem'), bUpgradeItem = document.getElementById('bUpgradeItem');

    // 核心状态
    let x, x1, x2, x3, x4, x5, y, k, b, t, yOffset;
    let upgradeCount, bUpgradeCount, elapsedMs, trajectory;
    let hasRevealedK, hasRevealedB, hasBUpgraded, bRequiredK;
    let intervalId = null, autoSaveId = null;

    // 视图状态
    let viewZoom = 1, viewOffsetX = 0, viewOffsetY = 0;
    let isDragging = false, dragStartX = 0, dragStartY = 0, dragStartOffsetX = 0, dragStartOffsetY = 0, lastPinchDist = null;

    // 常量
    const TICK_MS = 10, X_INCREMENT = new Decimal(0.01);
    const VIEW_PADDING_RATIO = new Decimal(0.15), MIN_VIEW_MAX = new Decimal(10);
    const INITIAL_THRESHOLD = new Decimal(50), THRESHOLD_GROWTH = new Decimal(1.1);
    const SAVE_KEY = 'incremental_yx_save_v3', SAVE_VERSION = 'v0.1beta2'; // 更新版本号清空旧冲突存档
    const AUTO_SAVE_MS = 5000, B_INITIAL_REQUIRED_K = 10;
    const B_BASE_AMOUNT = new Decimal(10), B_AMOUNT_GROWTH = new Decimal(1.5);
    const ZOOM_MIN = 0.1, ZOOM_MAX = 10, MAX_POINTS = 50000;
    
    const X2_BASE_PRICE = new Decimal(100), X3_BASE_PRICE = new Decimal(200);
    const X4_BASE_PRICE = new Decimal(500), X5_BASE_PRICE = new Decimal(1000);
    const X_PRICE_GROWTH = new Decimal(1.2);
    let x2Count = 0, x3Count = 0, x4Count = 0, x5Count = 0;

    function initState() {
        x = new Decimal(0);       // 实际的 x
        x1 = new Decimal(1);      // 倍率
        x2 = new Decimal(1); x3 = new Decimal(1); x4 = new Decimal(1); x5 = new Decimal(1);
        k = 1; b = new Decimal(0); t = new Decimal(0); yOffset = new Decimal(0);
        upgradeCount = 0; bUpgradeCount = 0;
        x2Count = 0; x3Count = 0; x4Count = 0; x5Count = 0;
        y = new Decimal(0); elapsedMs = 0; trajectory = [];
        hasRevealedK = false; hasRevealedB = false; hasBUpgraded = false; bRequiredK = B_INITIAL_REQUIRED_K;
        viewZoom = 1; viewOffsetX = 0; viewOffsetY = 0;
    }

    function computeY() { return Decimal.max(new Decimal(x).mul(k).add(b).add(yOffset), new Decimal(0)); }
    function computeThreshold() { return new Decimal(INITIAL_THRESHOLD).mul(THRESHOLD_GROWTH.pow(upgradeCount)).floor(); }
    function computeBAmount() { return B_BASE_AMOUNT.mul(B_AMOUNT_GROWTH.pow(bUpgradeCount)).floor(); }
    function getPrice(base, count) { return base.mul(X_PRICE_GROWTH.pow(count)).floor(); }

    function computeAutoView() {
        const candidate = Decimal.max(t, y, b, MIN_VIEW_MAX);
        const viewMaxY = candidate.mul(Decimal.add(1, VIEW_PADDING_RATIO));
        const viewMaxX = viewMaxY.mul(new Decimal(halfW).div(halfH));
        return { viewMaxX, viewMaxY };
    }
    function computeView() {
        const auto = computeAutoView();
        const zoomFactor = new Decimal(1).div(viewZoom);
        return { viewMaxX: auto.viewMaxX.mul(zoomFactor), viewMaxY: auto.viewMaxY.mul(zoomFactor) };
    }
    function mapX(xVal, view) { return halfW + (view.viewMaxX.eq(0)?0:xVal.div(view.viewMaxX).toNumber())*halfW + viewOffsetX; }
    function mapY(yVal, view) { return halfH - (view.viewMaxY.eq(0)?0:yVal.div(view.viewMaxY).toNumber())*halfH + viewOffsetY; }
    function unmapX(px, view) { return view.viewMaxX.mul((px - halfW - viewOffsetX) / halfW); }
    function unmapY(py, view) { return view.viewMaxY.mul((halfH + viewOffsetY - py) / halfH); }

    function formatDecimal(d) { if (d.lt(1000)) return d.toFixed(2); try { return d.toStringWithDecimalPlaces(3); } catch (e) { return d.toString(); } }
    function formatTick(d) { if (d.lt(1000)) return d.toFixed(0); try { return d.toStringWithDecimalPlaces(0); } catch (e) { return d.toString(); } }

    function computeTickValues(viewMax) {
        const ticks = []; if (viewMax.lte(0) || !isFinite(viewMax.toNumber())) return ticks;
        let mag = new Decimal(1);
        while (mag.lte(viewMax) && ticks.length <= 20) { ticks.push({ value: mag }); mag = mag.mul(10); }
        const filtered = [];
        for (const tk of ticks) {
            if (!filtered.length) filtered.push(tk);
            else {
                const prev = filtered[filtered.length - 1];
                if ((tk.value.div(viewMax).toNumber() - prev.value.div(viewMax).toNumber()) * halfH >= 24) filtered.push(tk);
            }
        }
        return filtered;
    }

    function drawTicks(view) {
        const ticksY = computeTickValues(view.viewMaxY), ticksX = computeTickValues(view.viewMaxX);
        const zeroX = halfW + viewOffsetX, zeroY = halfH + viewOffsetY;
        ctx.save(); ctx.font = '11px monospace'; ctx.fillStyle = '#888'; ctx.strokeStyle = '#AAA'; ctx.lineWidth = 1;
        ctx.textAlign = 'right'; ctx.textBaseline = 'top'; ctx.fillText('0', zeroX - 4, zeroY + 4);
        ctx.textAlign = 'center'; ctx.textBaseline = 'top';
        for (const tk of ticksX) {
            const px = halfW + tk.value.div(view.viewMaxX).toNumber() * halfW + viewOffsetX;
            if (px > zeroX + 4 && px <= width + 100) {
                ctx.beginPath(); ctx.moveTo(px, zeroY - 3); ctx.lineTo(px, zeroY + 3); ctx.stroke();
                ctx.fillText(formatTick(tk.value), px, zeroY + 6);
            }
        }
        ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
        for (const tk of ticksY) {
            const py = halfH - tk.value.div(view.viewMaxY).toNumber() * halfH + viewOffsetY;
            if (py < zeroY - 4 && py >= -100) {
                ctx.beginPath(); ctx.moveTo(zeroX - 3, py); ctx.lineTo(zeroX + 3, py); ctx.stroke();
                ctx.fillText(formatTick(tk.value), zeroX - 6, py);
            }
        }
        ctx.restore();
    }

    function draw() {
        ctx.clearRect(0, 0, width, height);
        const view = computeView();
        const zeroX = halfW + viewOffsetX, zeroY = halfH + viewOffsetY;

        ctx.save(); ctx.strokeStyle = '#CCC'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(0, zeroY); ctx.lineTo(width, zeroY); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(zeroX, 0); ctx.lineTo(zeroX, height); ctx.stroke();
        ctx.restore();

        ctx.save(); ctx.fillStyle = '#E8E8E8';
        for (let i = 1; i <= 8; i++) {
            const tt = i / 8;
            for (const [px, py] of [[zeroX+tt*halfW, zeroY-tt*halfH], [zeroX-tt*halfW, zeroY-tt*halfH], [zeroX+tt*halfW, zeroY+tt*halfH], [zeroX-tt*halfW, zeroY+tt*halfH]]) {
                if (px >= 0 && px <= width && py >= 0 && py <= height) { ctx.beginPath(); ctx.arc(px, py, 1, 0, 2*Math.PI); ctx.fill(); }
            }
        }
        ctx.restore();

        drawTicks(view);

        if (trajectory.length > 1) {
            ctx.save(); ctx.strokeStyle = '#2F6B4F'; ctx.lineWidth = 2; ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.beginPath();
            let started = false;
            for (const p of trajectory) {
                const px = mapX(p.t, view), py = mapY(p.y, view);
                if (!isFinite(px) || !isFinite(py)) { started = false; continue; }
                if (!started) { ctx.moveTo(px, py); started = true; } else { ctx.lineTo(px, py); }
            }
            ctx.stroke(); ctx.restore();
        }

        const px = mapX(t, view), py = mapY(y, view);
        if (isFinite(px) && isFinite(py) && px >= -50 && px <= width+50 && py >= -50 && py <= height+50) {
            ctx.save(); ctx.fillStyle = '#2F6B4F'; ctx.globalAlpha = 0.15; ctx.beginPath(); ctx.arc(px, py, 10, 0, 2*Math.PI); ctx.fill();
            ctx.globalAlpha = 1; ctx.fillStyle = '#2F6B4F'; ctx.beginPath(); ctx.arc(px, py, 5, 0, 2*Math.PI); ctx.fill();
            ctx.fillStyle = '#FFF'; ctx.beginPath(); ctx.arc(px, py, 2, 0, 2*Math.PI); ctx.fill(); ctx.restore();
            
            ctx.save(); ctx.strokeStyle = '#B0B0B0'; ctx.lineWidth = 1; ctx.setLineDash([2, 3]);
            ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px, zeroY); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(zeroX, py); ctx.stroke(); ctx.restore();
            
            ctx.save(); ctx.fillStyle = '#1E1E1E'; ctx.font = '12px monospace';
            ctx.fillText(`(${formatDecimal(t)}, ${formatDecimal(y)})`, Math.min(Math.max(px+8, 4), width-200), Math.min(Math.max(py-8, 16), height-8));
            ctx.restore();
        }

        ctx.save(); ctx.fillStyle = '#AAA'; ctx.font = '11px monospace'; ctx.textAlign = 'right'; ctx.textBaseline = 'bottom';
        ctx.fillText(`缩放 ${viewZoom.toFixed(2)}x`, width-8, height-8); ctx.restore();
    }

    function updateUI() {
        xValueEl.textContent = formatDecimal(x);
        yValueEl.textContent = formatDecimal(y);
        kValueEl.textContent = String(k);
        bValueEl.textContent = formatDecimal(b);
        timeValueEl.textContent = (elapsedMs / 1000).toFixed(1) + 's';

        if (b.gte(new Decimal(80))) {
            titleText.textContent = 'y = kx₁ + b';
            formulaBar.style.display = 'block';
            x2UpgradeItem.classList.remove('hidden'); x3UpgradeItem.classList.remove('hidden');
            x4UpgradeItem.classList.remove('hidden'); x5UpgradeItem.classList.remove('hidden');
        } else if (hasBUpgraded) {
            titleText.textContent = 'y = kx + b';
            formulaBar.style.display = 'none';
        } else if (hasRevealedK) {
            titleText.textContent = 'y = kx';
            formulaBar.style.display = 'none';
        } else {
            titleText.textContent = 'y = x';
            formulaBar.style.display = 'none';
        }

        kStat.classList.toggle('hidden', !hasRevealedK);
        bStat.classList.toggle('hidden', !hasRevealedB);

        const kThreshold = computeThreshold();
        upgradeKBtn.disabled = !y.gt(kThreshold);
        kPriceText.textContent = `需要 y > ${formatTick(kThreshold)}`;

        if (hasRevealedB) {
            bUpgradeItem.classList.remove('hidden');
            upgradeBBtn.disabled = !(k >= bRequiredK);
            bPriceText.textContent = `需要 k > = ${bRequiredK}`;
        } else {
            bUpgradeItem.classList.add('hidden');
        }

        if (b.gte(new Decimal(80))) {
            const p2 = getPrice(X2_BASE_PRICE, x2Count);
            upgradeX2Btn.disabled = !x.gte(p2);
            x2PriceText.textContent = `价格：${formatTick(p2)}`;

            const p3 = getPrice(X3_BASE_PRICE, x3Count);
            upgradeX3Btn.disabled = !x.gte(p3);
            x3PriceText.textContent = `价格：${formatTick(p3)}`;

            const p4 = getPrice(X4_BASE_PRICE, x4Count);
            upgradeX4Btn.disabled = !x.gte(p4);
            x4PriceText.textContent = `价格：${formatTick(p4)}`;

            const p5 = getPrice(X5_BASE_PRICE, x5Count);
            upgradeX5Btn.disabled = !x.gte(p5);
            x5PriceText.textContent = `价格：${formatTick(p5)}`;
        }

        if (hasBUpgraded) guideText.textContent = '';
        else if (hasRevealedB) guideText.textContent = `k >= ${bRequiredK} 时点击增加 b`;
        else if (hasRevealedK) guideText.textContent = 'k >= 10 时出现增加 b 按钮';
        else guideText.textContent = `y > ${formatTick(kThreshold)} 时出现升级按钮`;
    }

    function tick() {
        // 1. 算倍率
        x1 = x2.mul(x3).mul(x4).mul(x5);
        // 2. x 按 0.01 乘以倍率增长
        x = x.add(X_INCREMENT.mul(x1));
        // 3. t 增长
        t = t.add(X_INCREMENT);
        // 4. y 更新
        y = computeY();
        elapsedMs += TICK_MS;

        if (!hasRevealedK && y.gt(new Decimal(50))) hasRevealedK = true;
        if (!hasRevealedB && k >= B_INITIAL_REQUIRED_K) hasRevealedB = true;

        trajectory.push({ t, y });
        if (trajectory.length > MAX_POINTS) trajectory.shift();

        updateUI(); draw();
    }

    function upgradeK() {
        if (!y.gt(computeThreshold())) return;
        x = Decimal.max(x.sub(computeThreshold().div(k)), 0);
        k += 1; upgradeCount += 1; y = computeY();
        trajectory.push({ t, y });
        if (!hasRevealedK && y.gt(new Decimal(50))) hasRevealedK = true;
        if (!hasRevealedB && k >= B_INITIAL_REQUIRED_K) hasRevealedB = true;
        updateUI(); draw();
    }

    function upgradeB() {
        if (k < bRequiredK) return;
        b = b.add(computeBAmount()); bUpgradeCount += 1; k = 1; upgradeCount = 0; y = computeY();
        hasBUpgraded = true; bRequiredK += 1; hasRevealedB = true;
        trajectory.push({ t, y });
        updateUI(); draw();
    }

    function buyX(base, count, target) {
        const price = getPrice(base, count);
        if (x.lt(price)) return;
        x = x.sub(price);
        if (target === 2) { x2 = x2.add(1); x2Count++; }
        else if (target === 3) { x3 = x3.add(1); x3Count++; }
        else if (target === 4) { x4 = x4.add(1); x4Count++; }
        else if (target === 5) { x5 = x5.add(1); x5Count++; }
        y = computeY();
        trajectory.push({ t, y });
        updateUI(); draw();
    }

    // 缩放与拖拽
    function resetView() { viewZoom = 1; viewOffsetX = 0; viewOffsetY = 0; draw(); }
    function zoomAt(px, py, factor) {
        const oldView = computeView(), oldValX = unmapX(px, oldView), oldValY = unmapY(py, oldView);
        let newZoom = Math.min(Math.max(viewZoom * factor, ZOOM_MIN), ZOOM_MAX);
        if (newZoom === viewZoom) return;
        viewZoom = newZoom; const newView = computeView();
        viewOffsetX += px - mapX(oldValX, newView);
        viewOffsetY += py - mapY(oldValY, newView);
        draw();
    }
    canvas.addEventListener('wheel', (e) => {
        e.preventDefault(); const rect = canvas.getBoundingClientRect();
        zoomAt((e.clientX - rect.left) * (canvas.width/rect.width), (e.clientY - rect.top) * (canvas.height/rect.height), e.deltaY < 0 ? 1.1 : 1/1.1);
    }, { passive: false });
    canvas.addEventListener('mousedown', (e) => {
        if (e.button !== 0) return;
        isDragging = true; dragStartX = e.clientX; dragStartY = e.clientY;
        dragStartOffsetX = viewOffsetX; dragStartOffsetY = viewOffsetY; canvas.style.cursor = 'grabbing';
    });
    window.addEventListener('mousemove', (e) => {
        if (!isDragging) return; const rect = canvas.getBoundingClientRect();
        viewOffsetX = dragStartOffsetX + (e.clientX - dragStartX) * (canvas.width/rect.width);
        viewOffsetY = dragStartOffsetY + (e.clientY - dragStartY) * (canvas.height/rect.height); draw();
    });
    window.addEventListener('mouseup', () => { isDragging = false; canvas.style.cursor = 'grab'; });
    canvas.style.cursor = 'grab';
    canvas.addEventListener('dblclick', (e) => { e.preventDefault(); resetView(); });

    // 存档
    function serializeTrajectory() { return trajectory.slice(Math.max(0, trajectory.length - MAX_POINTS)).map(p => [p.t.toString(), p.y.toString()]); }
    function save() {
        try {
            localStorage.setItem(SAVE_KEY, JSON.stringify({
                version: SAVE_VERSION, x: x.toString(), x2: x2.toString(), x3: x3.toString(), x4: x4.toString(), x5: x5.toString(),
                k, b: b.toString(), t: t.toString(), yOffset: yOffset.toString(),
                x2Count, x3Count, x4Count, x5Count,
                upgradeCount, bUpgradeCount, elapsedMs,
                hasRevealedK, hasRevealedB, hasBUpgraded, bRequiredK, trajectory: serializeTrajectory()
            }));
        } catch (e) {}
    }
    function load() {
        try {
            const data = JSON.parse(localStorage.getItem(SAVE_KEY));
            if (!data || data.version !== SAVE_VERSION) return false;
            initState();
            x = new Decimal(data.x); x2 = new Decimal(data.x2 || 1); x3 = new Decimal(data.x3 || 1); x4 = new Decimal(data.x4 || 1); x5 = new Decimal(data.x5 || 1);
            k = data.k; b = new Decimal(data.b); t = new Decimal(data.t); yOffset = new Decimal(data.yOffset || 0);
            x2Count = data.x2Count || 0; x3Count = data.x3Count || 0; x4Count = data.x4Count || 0; x5Count = data.x5Count || 0;
            upgradeCount = data.upgradeCount; bUpgradeCount = data.bUpgradeCount; elapsedMs = data.elapsedMs;
            hasRevealedK = data.hasRevealedK; hasRevealedB = data.hasRevealedB; hasBUpgraded = data.hasBUpgraded; bRequiredK = data.bRequiredK;
            x1 = x2.mul(x3).mul(x4).mul(x5);
            y = computeY();
            trajectory = [];
            if (Array.isArray(data.trajectory)) data.trajectory.forEach(item => trajectory.push({ t: new Decimal(item[0]), y: new Decimal(item[1]) }));
            if (trajectory.length === 0) trajectory.push({ t, y });
            return true;
        } catch (e) { return false; }
    }
    function start() {
        if (intervalId) clearInterval(intervalId); intervalId = setInterval(tick, TICK_MS);
        if (autoSaveId) clearInterval(autoSaveId); autoSaveId = setInterval(save, AUTO_SAVE_MS);
    }
    function stop() { if (intervalId) clearInterval(intervalId); if (autoSaveId) clearInterval(autoSaveId); intervalId = autoSaveId = null; }
    function reset() {
        stop(); try { localStorage.removeItem(SAVE_KEY); } catch (e) {}
        initState(); y = computeY(); updateUI(); draw(); start();
    }

    upgradeKBtn.addEventListener('click', upgradeK);
    upgradeBBtn.addEventListener('click', upgradeB);
    upgradeX2Btn.addEventListener('click', () => buyX(X2_BASE_PRICE, x2Count, 2));
    upgradeX3Btn.addEventListener('click', () => buyX(X3_BASE_PRICE, x3Count, 3));
    upgradeX4Btn.addEventListener('click', () => buyX(X4_BASE_PRICE, x4Count, 4));
    upgradeX5Btn.addEventListener('click', () => buyX(X5_BASE_PRICE, x5Count, 5));
    resetBtn.addEventListener('click', reset);
    window.addEventListener('beforeunload', save);

    if (!load()) { initState(); y = computeY(); }
    updateUI(); draw(); start();

    // 只保留基础导出导入
    window.GameAPI = {
        exportSave() { return { version: SAVE_VERSION, x: x.toString(), x2: x2.toString(), x3: x3.toString(), x4: x4.toString(), x5: x5.toString(), k, b: b.toString(), t: t.toString(), yOffset: yOffset.toString(), x2Count, x3Count, x4Count, x5Count, upgradeCount, bUpgradeCount, elapsedMs, hasRevealedK, hasRevealedB, hasBUpgraded, bRequiredK, trajectory: serializeTrajectory() }; },
        importSave(data) {
            if (!data || data.version !== SAVE_VERSION) return false;
            try {
                stop(); initState();
                x = new Decimal(data.x); x2 = new Decimal(data.x2 || 1); x3 = new Decimal(data.x3 || 1); x4 = new Decimal(data.x4 || 1); x5 = new Decimal(data.x5 || 1);
                k = data.k; b = new Decimal(data.b); t = new Decimal(data.t); yOffset = new Decimal(data.yOffset || 0);
                x2Count = data.x2Count || 0; x3Count = data.x3Count || 0; x4Count = data.x4Count || 0; x5Count = data.x5Count || 0;
                upgradeCount = data.upgradeCount; bUpgradeCount = data.bUpgradeCount; elapsedMs = data.elapsedMs;
                hasRevealedK = data.hasRevealedK; hasRevealedB = data.hasRevealedB; hasBUpgraded = data.hasBUpgraded; bRequiredK = data.bRequiredK;
                x1 = x2.mul(x3).mul(x4).mul(x5);
                y = computeY(); trajectory = [];
                if (Array.isArray(data.trajectory)) data.trajectory.forEach(item => trajectory.push({ t: new Decimal(item[0]), y: new Decimal(item[1]) }));
                if (trajectory.length === 0) trajectory.push({ t, y });
                updateUI(); draw(); start(); return true;
            } catch (e) { stop(); initState(); y = computeY(); updateUI(); draw(); start(); return false; }
        }
    };
})();