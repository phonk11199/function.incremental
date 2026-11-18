(function() {
    const Decimal = window.Decimal;
    if (!Decimal) {
        console.error('break_eternity.js 加载失败');
        return;
    }

    const canvas = document.getElementById('gameCanvas');
    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;
    const halfW = width / 2;
    const halfH = height / 2;

    const titleText = document.getElementById('titleText');
    const xValueEl = document.getElementById('xValue');
    const yValueEl = document.getElementById('yValue');
    const kStat = document.getElementById('kStat');
    const kValueEl = document.getElementById('kValue');
    const bStat = document.getElementById('bStat');
    const bValueEl = document.getElementById('bValue');
    const timeValueEl = document.getElementById('timeValue');
    const resetBtn = document.getElementById('resetBtn');

    const kUpgradeItem = document.getElementById('kUpgradeItem');
    const upgradeKBtn = document.getElementById('upgradeKBtn');
    const kPriceText = document.getElementById('kPriceText');
    const bUpgradeItem = document.getElementById('bUpgradeItem');
    const upgradeBBtn = document.getElementById('upgradeBBtn');
    const bPriceText = document.getElementById('bPriceText');
    const guideText = document.getElementById('guideText');

    // ---- 游戏状态 ----
    let x, y, k, b, t, upgradeCount, bUpgradeCount, elapsedMs, trajectory;
    let hasRevealedK;
    let hasRevealedB;
    let hasBUpgraded;
    let bRequiredK;
    let intervalId = null;
    let autoSaveId = null;

    // ---- 视图交互状态 ----
    let viewZoom = 1;          // 缩放倍数，0.1 ~ 10
    let viewOffsetX = 0;       // 平移偏移（像素）
    let viewOffsetY = 0;
    let isDragging = false;
    let dragStartX = 0, dragStartY = 0;
    let dragStartOffsetX = 0, dragStartOffsetY = 0;
    let lastPinchDist = null;

    // 常量
    const TICK_MS = 10;
    const X_INCREMENT = new Decimal(0.01);
    const VIEW_PADDING_RATIO = new Decimal(0.15);
    const MIN_VIEW_MAX = new Decimal(10);
    const INITIAL_THRESHOLD = new Decimal(50);
    const THRESHOLD_GROWTH = new Decimal(1.1);
    const SAVE_KEY = 'incremental_yx_save_v3';
    const SAVE_VERSION = 'v0.1beta';
    const AUTO_SAVE_MS = 5000;
    const B_INITIAL_REQUIRED_K = 10;
    const B_BASE_AMOUNT = new Decimal(10);
    const B_AMOUNT_GROWTH = new Decimal(1.5);
    const ZOOM_MIN = 0.1;
    const ZOOM_MAX = 10;

    function initState() {
        x = new Decimal(0);
        k = 1;
        b = new Decimal(0);
        t = new Decimal(0);
        upgradeCount = 0;
        bUpgradeCount = 0;
        y = new Decimal(0);
        elapsedMs = 0;
        trajectory = [];
        hasRevealedK = false;
        hasRevealedB = false;
        hasBUpgraded = false;
        bRequiredK = B_INITIAL_REQUIRED_K;
        viewZoom = 1;
        viewOffsetX = 0;
        viewOffsetY = 0;
    }

    function computeY() {
        return Decimal.max(new Decimal(x).mul(k).add(b), new Decimal(0));
    }

    function computeThreshold() {
        return new Decimal(INITIAL_THRESHOLD)
            .mul(THRESHOLD_GROWTH.pow(upgradeCount))
            .floor();
    }

    function computeBAmount() {
        return B_BASE_AMOUNT.mul(B_AMOUNT_GROWTH.pow(bUpgradeCount)).floor();
    }

    // ---- 视图：自动范围 + 手动缩放/平移 ----
    // 自动范围随 t、y 增长；手动缩放通过 viewZoom 乘在自动范围上；
    // 平移通过 viewOffsetX/Y 像素偏移。
    function computeAutoView() {
        const candidate = Decimal.max(t, y, b, MIN_VIEW_MAX);
        const viewMaxY = candidate.mul(Decimal.add(1, VIEW_PADDING_RATIO));
        const aspect = new Decimal(halfW).div(halfH);
        const viewMaxX = viewMaxY.mul(aspect);
        return { viewMaxX, viewMaxY };
    }

    function computeView() {
        const auto = computeAutoView();
        // 手动缩放：缩放越大，视图范围越小
        const zoomFactor = new Decimal(1).div(viewZoom);
        const viewMaxX = auto.viewMaxX.mul(zoomFactor);
        const viewMaxY = auto.viewMaxY.mul(zoomFactor);
        return { viewMaxX, viewMaxY };
    }

    function mapX(xVal, view) {
        if (view.viewMaxX.eq(0)) return halfW;
        const ratio = xVal.div(view.viewMaxX);
        return halfW + ratio.toNumber() * halfW + viewOffsetX;
    }

    function mapY(yVal, view) {
        if (view.viewMaxY.eq(0)) return halfH;
        const ratio = yVal.div(view.viewMaxY);
        return halfH - ratio.toNumber() * halfH + viewOffsetY;
    }

    // 将画布像素坐标反算为数值坐标（用于滚轮以鼠标为中心缩放）
    function unmapX(px, view) {
        const ratio = (px - halfW - viewOffsetX) / halfW;
        return view.viewMaxX.mul(ratio);
    }

    function unmapY(py, view) {
        const ratio = (halfH + viewOffsetY - py) / halfH;
        return view.viewMaxY.mul(ratio);
    }

    function formatDecimal(d) {
        if (d.lt(1000)) return d.toFixed(2);
        try { return d.toStringWithDecimalPlaces(3); }
        catch (e) { return d.toString(); }
    }

    function formatTick(d) {
        if (d.lt(1000)) return d.toFixed(0);
        try { return d.toStringWithDecimalPlaces(0); }
        catch (e) { return d.toString(); }
    }

    function computeTickValues(viewMax) {
        const ticks = [];
        if (viewMax.lte(0)) return ticks;
        const maxNum = viewMax.toNumber();
        if (!isFinite(maxNum)) return ticks;

        let magnitude = new Decimal(1);
        while (magnitude.lte(viewMax)) {
            ticks.push({ value: magnitude });
            magnitude = magnitude.mul(10);
            if (ticks.length > 20) break;
        }
        const filtered = [];
        for (const t of ticks) {
            if (filtered.length === 0) {
                filtered.push(t);
            } else {
                const prev = filtered[filtered.length - 1];
                const prevRatio = prev.value.div(viewMax).toNumber();
                const curRatio = t.value.div(viewMax).toNumber();
                const pixelGap = (curRatio - prevRatio) * halfH;
                if (pixelGap >= 24) {
                    filtered.push(t);
                }
            }
        }
        return filtered;
    }

    function drawTicks(view) {
        const ticksY = computeTickValues(view.viewMaxY);
        const ticksX = computeTickValues(view.viewMaxX);
        const zeroX = halfW + viewOffsetX;
        const zeroY = halfH + viewOffsetY;

        ctx.save();
        ctx.font = '11px "SF Mono", "Fira Code", Consolas, monospace';
        ctx.fillStyle = '#888888';
        ctx.strokeStyle = '#AAAAAA';
        ctx.lineWidth = 1;

        ctx.textAlign = 'right';
        ctx.textBaseline = 'top';
        ctx.fillText('0', zeroX - 4, zeroY + 4);

        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        for (const t of ticksX) {
            const ratio = t.value.div(view.viewMaxX).toNumber();
            const px = halfW + ratio * halfW + viewOffsetX;
            if (px > zeroX + 4 && px <= width + 100) {
                ctx.beginPath();
                ctx.moveTo(px, zeroY - 3);
                ctx.lineTo(px, zeroY + 3);
                ctx.stroke();
                ctx.fillText(formatTick(t.value), px, zeroY + 6);
            }
        }

        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        for (const t of ticksY) {
            const ratio = t.value.div(view.viewMaxY).toNumber();
            const py = halfH - ratio * halfH + viewOffsetY;
            if (py < zeroY - 4 && py >= -100) {
                ctx.beginPath();
                ctx.moveTo(zeroX - 3, py);
                ctx.lineTo(zeroX + 3, py);
                ctx.stroke();
                ctx.fillText(formatTick(t.value), zeroX - 6, py);
            }
        }
        ctx.restore();
    }

    function draw() {
        ctx.clearRect(0, 0, width, height);

        const view = computeView();
        const zeroX = halfW + viewOffsetX;
        const zeroY = halfH + viewOffsetY;

        // 坐标轴（带平移）
        ctx.save();
        ctx.strokeStyle = '#CCCCCC';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, zeroY);
        ctx.lineTo(width, zeroY);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(zeroX, 0);
        ctx.lineTo(zeroX, height);
        ctx.stroke();
        ctx.restore();

        // 四象限浅色刻度点
        ctx.save();
        ctx.fillStyle = '#E8E8E8';
        const gridSteps = 8;
        for (let i = 1; i <= gridSteps; i++) {
            const tt = i / gridSteps;
            const offsetX = tt * halfW;
            const offsetY = tt * halfH;
            const points = [
                [zeroX + offsetX, zeroY - offsetY],
                [zeroX - offsetX, zeroY - offsetY],
                [zeroX + offsetX, zeroY + offsetY],
                [zeroX - offsetX, zeroY + offsetY],
            ];
            for (const [px, py] of points) {
                if (px >= 0 && px <= width && py >= 0 && py <= height) {
                    ctx.beginPath();
                    ctx.arc(px, py, 1, 0, 2 * Math.PI);
                    ctx.fill();
                }
            }
        }
        ctx.restore();

        drawTicks(view);

        // 轨迹线
        if (trajectory.length > 1) {
            ctx.save();
            ctx.strokeStyle = '#2F6B4F';
            ctx.lineWidth = 2;
            ctx.lineJoin = 'round';
            ctx.lineCap = 'round';
            ctx.beginPath();
            let started = false;
            for (let i = 0; i < trajectory.length; i++) {
                const p = trajectory[i];
                const px = mapX(p.t, view);
                const py = mapY(p.y, view);
                if (!isFinite(px) || !isFinite(py)) {
                    started = false;
                    continue;
                }
                if (!started) {
                    ctx.moveTo(px, py);
                    started = true;
                } else {
                    ctx.lineTo(px, py);
                }
            }
            ctx.stroke();
            ctx.restore();
        }

        // 当前点
        const px = mapX(t, view);
        const py = mapY(y, view);
        if (isFinite(px) && isFinite(py) && px >= -50 && px <= width + 50 && py >= -50 && py <= height + 50) {
            ctx.save();
            ctx.fillStyle = '#2F6B4F';
            ctx.globalAlpha = 0.15;
            ctx.beginPath();
            ctx.arc(px, py, 10, 0, 2 * Math.PI);
            ctx.fill();

            ctx.globalAlpha = 1;
            ctx.fillStyle = '#2F6B4F';
            ctx.beginPath();
            ctx.arc(px, py, 5, 0, 2 * Math.PI);
            ctx.fill();

            ctx.fillStyle = '#FFFFFF';
            ctx.beginPath();
            ctx.arc(px, py, 2, 0, 2 * Math.PI);
            ctx.fill();
            ctx.restore();

            ctx.save();
            ctx.strokeStyle = '#B0B0B0';
            ctx.lineWidth = 1;
            ctx.setLineDash([2, 3]);
            ctx.beginPath();
            ctx.moveTo(px, py);
            ctx.lineTo(px, zeroY);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(px, py);
            ctx.lineTo(zeroX, py);
            ctx.stroke();
            ctx.restore();

            ctx.save();
            ctx.fillStyle = '#1E1E1E';
            ctx.font = '12px "SF Mono", "Fira Code", monospace';
            const label = `(${formatDecimal(t)}, ${formatDecimal(y)})`;
            const tx = Math.min(Math.max(px + 8, 4), width - 200);
            const ty = Math.min(Math.max(py - 8, 16), height - 8);
            ctx.fillText(label, tx, ty);
            ctx.restore();
        }

        // 缩放指示（右下角，中性色小字）
        ctx.save();
        ctx.fillStyle = '#AAAAAA';
        ctx.font = '11px "SF Mono", "Fira Code", Consolas, monospace';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'bottom';
        ctx.fillText(`缩放 ${viewZoom.toFixed(2)}x`, width - 8, height - 8);
        ctx.restore();
    }

    function updateUI() {
        xValueEl.textContent = formatDecimal(x);
        yValueEl.textContent = formatDecimal(y);
        kValueEl.textContent = String(k);
        bValueEl.textContent = formatDecimal(b);
        timeValueEl.textContent = (elapsedMs / 1000).toFixed(1) + 's';

        if (hasBUpgraded) {
            titleText.textContent = 'y = kx + b';
        } else if (hasRevealedK) {
            titleText.textContent = 'y = kx';
        } else {
            titleText.textContent = 'y = x';
        }

        if (hasRevealedK) {
            kStat.classList.remove('hidden');
        } else {
            kStat.classList.add('hidden');
        }

        if (hasRevealedB) {
            bStat.classList.remove('hidden');
        } else {
            bStat.classList.add('hidden');
        }

        const kThreshold = computeThreshold();
        const canClickK = y.gt(kThreshold);
        upgradeKBtn.disabled = !canClickK;
        kPriceText.textContent = `需要 y > ${formatTick(kThreshold)}`;

        if (hasRevealedB) {
            bUpgradeItem.classList.remove('hidden');
            const canClickB = k >= bRequiredK;
            upgradeBBtn.disabled = !canClickB;
            bPriceText.textContent = `需要 k > = ${bRequiredK}`;
        } else {
            bUpgradeItem.classList.add('hidden');
        }

        if (hasBUpgraded) {
            guideText.textContent = '';
        } else if (hasRevealedB) {
            guideText.textContent = `k >= ${bRequiredK} 时点击增加 b`;
        } else if (hasRevealedK) {
            guideText.textContent = 'k >= 10 时出现增加 b 按钮';
        } else {
            guideText.textContent = `y > ${formatTick(kThreshold)} 时出现升级按钮`;
        }
    }

    function tick() {
        x = x.add(X_INCREMENT);
        t = t.add(X_INCREMENT);
        y = computeY();
        elapsedMs += TICK_MS;

        if (!hasRevealedK && y.gt(new Decimal(50))) {
            hasRevealedK = true;
        }

        if (!hasRevealedB && k >= B_INITIAL_REQUIRED_K) {
            hasRevealedB = true;
        }

        trajectory.push({ t: t, y: y });

        updateUI();
        draw();
    }

    function upgradeK() {
        const kThreshold = computeThreshold();
        if (!y.gt(kThreshold)) return;

        const kBefore = k;
        const xCost = kThreshold.div(kBefore);
        x = x.sub(xCost);

        k += 1;
        upgradeCount += 1;
        y = computeY();

        trajectory.push({ t: t, y: y });

        if (!hasRevealedK && y.gt(new Decimal(50))) {
            hasRevealedK = true;
        }
        if (!hasRevealedB && k >= B_INITIAL_REQUIRED_K) {
            hasRevealedB = true;
        }

        updateUI();
        draw();
    }

    function upgradeB() {
        if (k < bRequiredK) return;

        const amount = computeBAmount();
        b = b.add(amount);
        bUpgradeCount += 1;

        k = 1;
        x = new Decimal(0);
        upgradeCount = 0;
        y = computeY();

        hasBUpgraded = true;
        bRequiredK += 1;
        hasRevealedB = true;

        trajectory.push({ t: t, y: y });

        updateUI();
        draw();
    }

    // ---- 缩放/平移交互 ----
    function resetView() {
        viewZoom = 1;
        viewOffsetX = 0;
        viewOffsetY = 0;
        draw();
    }

    // 以画布像素坐标为中心缩放
    function zoomAt(px, py, factor) {
        const oldView = computeView();
        const oldValX = unmapX(px, oldView);
        const oldValY = unmapY(py, oldView);

        let newZoom = viewZoom * factor;
        if (newZoom < ZOOM_MIN) newZoom = ZOOM_MIN;
        if (newZoom > ZOOM_MAX) newZoom = ZOOM_MAX;
        if (newZoom === viewZoom) return;

        viewZoom = newZoom;

        // 调整偏移，使 oldValX/oldValY 仍落在 (px, py)
        const newView = computeView();
        const newPx = mapX(oldValX, newView);
        const newPy = mapY(oldValY, newView);
        viewOffsetX += px - newPx;
        viewOffsetY += py - newPy;

        draw();
    }

    // 滚轮缩放（以鼠标位置为中心）
    canvas.addEventListener('wheel', (e) => {
        e.preventDefault();
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        const px = (e.clientX - rect.left) * scaleX;
        const py = (e.clientY - rect.top) * scaleY;

        const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
        zoomAt(px, py, factor);
    }, { passive: false });

    // 鼠标拖拽平移
    canvas.addEventListener('mousedown', (e) => {
        if (e.button !== 0) return;
        isDragging = true;
        dragStartX = e.clientX;
        dragStartY = e.clientY;
        dragStartOffsetX = viewOffsetX;
        dragStartOffsetY = viewOffsetY;
        canvas.style.cursor = 'grabbing';
    });

    window.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        viewOffsetX = dragStartOffsetX + (e.clientX - dragStartX) * scaleX;
        viewOffsetY = dragStartOffsetY + (e.clientY - dragStartY) * scaleY;
        draw();
    });

    window.addEventListener('mouseup', () => {
        isDragging = false;
        canvas.style.cursor = 'grab';
    });

    canvas.style.cursor = 'grab';

    // 双击重置视图
    canvas.addEventListener('dblclick', (e) => {
        e.preventDefault();
        resetView();
    });

    // 双指捏合缩放（触摸）
    canvas.addEventListener('touchstart', (e) => {
        if (e.touches.length === 2) {
            e.preventDefault();
            const dx = e.touches[0].clientX - e.touches[1].clientX;
            const dy = e.touches[0].clientY - e.touches[1].clientY;
            lastPinchDist = Math.sqrt(dx * dx + dy * dy);
        } else if (e.touches.length === 1) {
            isDragging = true;
            dragStartX = e.touches[0].clientX;
            dragStartY = e.touches[0].clientY;
            dragStartOffsetX = viewOffsetX;
            dragStartOffsetY = viewOffsetY;
        }
    }, { passive: false });

    canvas.addEventListener('touchmove', (e) => {
        if (e.touches.length === 2) {
            e.preventDefault();
            const dx = e.touches[0].clientX - e.touches[1].clientX;
            const dy = e.touches[0].clientY - e.touches[1].clientY;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (lastPinchDist !== null && lastPinchDist > 0) {
                const factor = dist / lastPinchDist;
                // 以双指中点为缩放中心
                const midX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
                const midY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
                const rect = canvas.getBoundingClientRect();
                const scaleX = canvas.width / rect.width;
                const scaleY = canvas.height / rect.height;
                const px = (midX - rect.left) * scaleX;
                const py = (midY - rect.top) * scaleY;
                zoomAt(px, py, factor);
            }
            lastPinchDist = dist;
        } else if (e.touches.length === 1 && isDragging) {
            e.preventDefault();
            const rect = canvas.getBoundingClientRect();
            const scaleX = canvas.width / rect.width;
            const scaleY = canvas.height / rect.height;
            viewOffsetX = dragStartOffsetX + (e.touches[0].clientX - dragStartX) * scaleX;
            viewOffsetY = dragStartOffsetY + (e.touches[0].clientY - dragStartY) * scaleY;
            draw();
        }
    }, { passive: false });

    canvas.addEventListener('touchend', (e) => {
        if (e.touches.length < 2) {
            lastPinchDist = null;
        }
        if (e.touches.length === 0) {
            isDragging = false;
        }
    });

    // ---- 存档 ----
    function serializeTrajectory() {
        const maxPoints = 2000;
        const start = Math.max(0, trajectory.length - maxPoints);
        const arr = [];
        for (let i = start; i < trajectory.length; i++) {
            const p = trajectory[i];
            arr.push([p.t.toString(), p.y.toString()]);
        }
        return arr;
    }

    function save() {
        try {
            const data = {
                version: SAVE_VERSION,
                x: x.toString(),
                k: k,
                b: b.toString(),
                t: t.toString(),
                upgradeCount: upgradeCount,
                bUpgradeCount: bUpgradeCount,
                elapsedMs: elapsedMs,
                hasRevealedK: hasRevealedK,
                hasRevealedB: hasRevealedB,
                hasBUpgraded: hasBUpgraded,
                bRequiredK: bRequiredK,
                trajectory: serializeTrajectory(),
            };
            localStorage.setItem(SAVE_KEY, JSON.stringify(data));
        } catch (e) {}
    }

    function load() {
        try {
            const raw = localStorage.getItem(SAVE_KEY);
            if (!raw) return false;
            const data = JSON.parse(raw);
            if (!data || data.version !== SAVE_VERSION) return false;

            initState();
            x = new Decimal(data.x);
            k = data.k;
            b = new Decimal(data.b);
            t = new Decimal(data.t);
            upgradeCount = data.upgradeCount;
            bUpgradeCount = data.bUpgradeCount;
            elapsedMs = data.elapsedMs;
            hasRevealedK = data.hasRevealedK;
            hasRevealedB = data.hasRevealedB;
            hasBUpgraded = data.hasBUpgraded;
            bRequiredK = data.bRequiredK;
            y = computeY();

            trajectory = [];
            if (Array.isArray(data.trajectory)) {
                for (const item of data.trajectory) {
                    trajectory.push({
                        t: new Decimal(item[0]),
                        y: new Decimal(item[1]),
                    });
                }
            }
            if (trajectory.length === 0) {
                trajectory.push({ t: t, y: y });
            }

            return true;
        } catch (e) {
            return false;
        }
    }

    function start() {
        if (intervalId !== null) clearInterval(intervalId);
        intervalId = setInterval(tick, TICK_MS);

        if (autoSaveId !== null) clearInterval(autoSaveId);
        autoSaveId = setInterval(save, AUTO_SAVE_MS);
    }

    function stop() {
        if (intervalId !== null) { clearInterval(intervalId); intervalId = null; }
        if (autoSaveId !== null) { clearInterval(autoSaveId); autoSaveId = null; }
    }

    function reset() {
        stop();
        try { localStorage.removeItem(SAVE_KEY); } catch (e) {}
        initState();
        y = computeY();
        updateUI();
        draw();
        start();
    }

    upgradeKBtn.addEventListener('click', upgradeK);
    upgradeBBtn.addEventListener('click', upgradeB);
    resetBtn.addEventListener('click', reset);
    window.addEventListener('beforeunload', save);

    const loaded = load();
    if (!loaded) {
        initState();
        y = computeY();
    }
    updateUI();
    draw();
    start();

    // ---- 暴露给 settings.js 的接口 ----
    window.GameAPI = {
        exportSave() {
            return {
                version: SAVE_VERSION,
                x: x.toString(),
                k: k,
                b: b.toString(),
                t: t.toString(),
                upgradeCount: upgradeCount,
                bUpgradeCount: bUpgradeCount,
                elapsedMs: elapsedMs,
                hasRevealedK: hasRevealedK,
                hasRevealedB: hasRevealedB,
                hasBUpgraded: hasBUpgraded,
                bRequiredK: bRequiredK,
                trajectory: serializeTrajectory(),
            };
        },
        importSave(data) {
            if (!data || data.version !== SAVE_VERSION) return false;
            if (typeof data.k !== 'number' || typeof data.bRequiredK !== 'number') return false;
            if (typeof data.x !== 'string' || typeof data.b !== 'string' || typeof data.t !== 'string') return false;
            if (!Array.isArray(data.trajectory)) return false;

            try {
                stop();
                initState();
                x = new Decimal(data.x);
                k = data.k;
                b = new Decimal(data.b);
                t = new Decimal(data.t);
                upgradeCount = data.upgradeCount;
                bUpgradeCount = data.bUpgradeCount;
                elapsedMs = data.elapsedMs;
                hasRevealedK = data.hasRevealedK;
                hasRevealedB = data.hasRevealedB;
                hasBUpgraded = data.hasBUpgraded;
                bRequiredK = data.bRequiredK;
                y = computeY();

                trajectory = [];
                for (const item of data.trajectory) {
                    trajectory.push({
                        t: new Decimal(item[0]),
                        y: new Decimal(item[1]),
                    });
                }
                if (trajectory.length === 0) {
                    trajectory.push({ t: t, y: y });
                }

                updateUI();
                draw();
                start();
                return true;
            } catch (e) {
                stop();
                initState();
                y = computeY();
                updateUI();
                draw();
                start();
                return false;
            }
        },
    };
})();