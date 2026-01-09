window.graph = null;
let minimap = null, isMobileGraphMode = false;

let lodTimer = null;



// 初始化 G6 实例

function initGraphInstance() {

    const container = document.getElementById('mountNode');

    if (!container) return; // 防止找不到 DOM 报错



    graph = new G6.Graph({

        container: 'mountNode',

        width: container.offsetWidth || window.innerWidth, height: container.offsetHeight || window.innerHeight,

        fitView: false,

        modes: { default: ['drag-canvas', 'zoom-canvas', 'drag-node'] },

        layout: { type: 'force', linkDistance: 150, nodeStrength: -30, preventOverlap: true, nodeSize: 60, alphaDecay: 0.25, workerEnabled: false },

        defaultNode: { type: 'circle', style: { lineWidth: 2, stroke: '#fff' } },

        defaultEdge: { style: { endArrow: { path: G6.Arrow.triangle(8, 8, 0) } } }

    });

    

    window.onresize = () => { if (window.innerWidth > 768 && graph) graph.changeSize(container.offsetWidth, container.offsetHeight); };

    

    graph.on('viewportchange', handleLOD);

    graph.on('node:mouseenter', (e) => {

        const item = e.item; graph.setAutoPaint(false);

        graph.getNodes().forEach(n => { if (n !== item) graph.setItemState(n, 'dark', true); });

        graph.setItemState(item, 'highlight', true);

        graph.getEdges().forEach(edge => {

            if (edge.getSource() === item || edge.getTarget() === item) { graph.setItemState(edge, 'highlight', true); edge.toFront(); } 

            else { graph.setItemState(edge, 'dark', true); }

        });

        graph.paint(); graph.setAutoPaint(true);

    });

    graph.on('node:mouseleave', clearStates); 

    graph.on('canvas:click', clearStates);

}



// 刷新画布

function updateGraph() {

    if (!graph) return; // 防止 graph 还没初始化就调用



    // 调用 window 上的函数和变量

    const layoutSet = window.getLayoutSettings ? window.getLayoutSettings() : {}; 

    const factions = window.factionConfig || [];

    

    const cmap = {}; 

    factions.forEach(f => cmap[f.id] = f.color);

    

const legendEl = document.getElementById('legend');

    if (legendEl) {

        // --- 修改开始：增加显示/隐藏判断 ---

        // 检查 layoutSet.showLegend 是否为 true (如果是 undefined 默认视为 true)

        const shouldShow = layoutSet.showLegend !== false;

        

        if (shouldShow) {

            legendEl.style.display = 'block';

            legendEl.innerHTML = factions.map(f=>`<div class="legend-item"><div class="dot" style="background:${f.color}"></div>${f.name}</div>`).join('');

        } else {

            legendEl.style.display = 'none';

        }

        // --- 修改结束 ---

    }

    

    const nodesData = [];

    const edgesData = [];

    const nodeMap = new Map();

    

    // 从 DOM 读取数据（因为 DOM 是唯一真实数据源）

    document.querySelectorAll('#nodeListContainer .input-row').forEach(r => {

        const name = r.querySelector('.inp-name').value.trim();

        const faction = r.querySelector('.inp-fac').value.trim();

        if(name) nodeMap.set(name, { id: name, label: name, faction: faction || 'Unknown' });

    });



    const deg = {};

    document.querySelectorAll('#edgeListContainer .input-row').forEach(r => {

        const s = r.querySelector('.inp-source').value.trim();

        const l = r.querySelector('.inp-label').value.trim();

        const t = r.querySelector('.inp-target').value.trim();

        

        if(s && t) {

            edgesData.push({ 

                source: s, target: t, label: l,

                type: layoutSet.edgeType || 'quadratic',

                style: { stroke: '#b5b5b5', lineWidth: 1, endArrow: layoutSet.showArrow ? { path: G6.Arrow.triangle(6,6,0), fill:'#b5b5b5' } : false },

                labelCfg: { autoRotate: true, style: { fill: '#333', stroke: '#fff', lineWidth: 2 } }

            });

            

            deg[s] = (deg[s]||0)+1; 

            deg[t] = (deg[t]||0)+1;



            if(!nodeMap.has(s)) nodeMap.set(s, { id: s, label: s, faction: 'Unknown' });

            if(!nodeMap.has(t)) nodeMap.set(t, { id: t, label: t, faction: 'Unknown' });

        }

    });



// 计算最大度数，防止除以0

    const maxDeg = Math.max(...Object.values(deg), 1);

    

    // --- 新增：获取开关状态，默认为 true ---

    const enableAutoSize = layoutSet.autoNodeSize !== false; 

    

    nodeMap.forEach(n => {

        let size;

        

        if (enableAutoSize) {

            // === 逻辑修改：5个层级计算 ===

            const currentDeg = deg[n.id] || 0;

            const ratio = currentDeg / maxDeg; // 0.0 到 1.0

            

            // 将 ratio 映射到 1-5 的整数层级

            // Math.ceil(0.1 * 5) = 1

            // Math.ceil(0.5 * 5) = 3

            // Math.ceil(1.0 * 5) = 5

            let level = Math.ceil(ratio * 5);

            if (level === 0) level = 1; // 孤立点至少为第1级

            

            // 定义5个层级对应的具体像素大小 (例如: 40, 50, 60, 70, 80)

            const baseSize = 30;

            const step = 5;

            size = baseSize + (level * step);

            

        } else {

            // === 关闭自动大小：固定默认值 ===

            size = 50; 

        }



        let labelStyle = { fill: '#000000', fontSize: 11 };

        

        nodesData.push({

            ...n, 

            size: size,

            type: 'circle',

            style: { fill: cmap[n.faction]||'#999', stroke: '#fff', lineWidth: 2 },

            labelCfg: { style: labelStyle, position: layoutSet.labelMode === 'bottom' ? 'bottom' : 'center', offset: layoutSet.labelMode === 'bottom' ? 5 : 0 }

        });

    });

    



    







    // 布局保护

    const layoutType = layoutSet.layoutType || 'force';

    const dist = parseInt(layoutSet.linkDist) || 150;

    

const layoutConfig = { 
        type: layoutType, 
        preventOverlap: true, 
        nodeSize: 60, 
        workerEnabled: false // <--- 关键！必须在这里也显式关闭
    };

    if (layoutType === 'force') { 
        layoutConfig.linkDistance = dist; 
        layoutConfig.nodeStrength = -30; 
        layoutConfig.alphaDecay = 0.25; //衰减动画
        // 确保这里没有覆盖 workerEnabled
    }

    if (layoutType === 'circular') { layoutConfig.radius = dist * 2; }

    else if (layoutType === 'radial') { layoutConfig.unitRadius = dist; }

    else if (layoutType === 'dagre') { layoutConfig.ranksep = dist / 2; layoutConfig.nodesep = 30; }



    graph.updateLayout(layoutConfig);

    graph.data({ nodes: nodesData, edges: edgesData });

    graph.render();

    

    toggleMinimap();

    handleLOD(); 

}



function toggleMinimap() {

    const chk = document.getElementById('cfg-minimap');

    if (!chk) return;

    const show = chk.checked;

    

    if (show) {

        if (!minimap || minimap.destroyed) minimap = new G6.Minimap({ size: [150, 100], className: 'g6-minimap', type: 'delegate' });

        if (!graph.get('plugins').includes(minimap)) graph.addPlugin(minimap);

    } else { if (minimap && graph.get('plugins').includes(minimap)) graph.removePlugin(minimap); }

}



function clearStates() { graph.setAutoPaint(false); graph.getNodes().forEach(n => graph.clearItemStates(n)); graph.getEdges().forEach(e => graph.clearItemStates(e)); graph.paint(); graph.setAutoPaint(true); }



function handleLOD() {

    const lodChk = document.getElementById('cfg-lod');

    if (!lodChk || !lodChk.checked) return;

    

    if (lodTimer) return; 

    lodTimer = setTimeout(() => {

        const zoom = graph.getZoom();

        const shouldHideLabel = zoom < 0.4;

        graph.getNodes().forEach(node => {

            const labelShape = node.getContainer().find(ele => ele.get('type') === 'text');

            if (labelShape) shouldHideLabel ? labelShape.hide() : labelShape.show();

        });

        lodTimer = null;

    }, 50);

}



function toggleMobileView() {

    const editor = document.getElementById('viewEditor'); const graphView = document.getElementById('viewGraph'); const btn = document.getElementById('fabBtn');

    if (isMobileGraphMode) { editor.classList.add('view-active'); graphView.classList.remove('view-active'); btn.innerHTML = '👁️'; isMobileGraphMode = false; }

    else { updateGraph(); editor.classList.remove('view-active'); graphView.classList.add('view-active'); btn.innerHTML = '✏️'; isMobileGraphMode = true; setTimeout(() => { if(graph) { graph.changeSize(window.innerWidth, window.innerHeight); graph.fitView(); } }, 50); }

}