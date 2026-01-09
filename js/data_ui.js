// js/data_ui.js

// === 全局变量定义 ===
const urlParams = new URLSearchParams(window.location.search);
const CURRENT_GRAPH_ID = urlParams.get('id');

// 如果没有 ID，踢回首页
if (!CURRENT_GRAPH_ID) {
    alert("未指定图表ID，即将返回首页");
    window.location.href = 'index.html';
}

window.DEFAULT_FACTIONS = [ { id: 'Gryffindor', name: '格兰芬多', color: '#740001' }, { id: 'Slytherin', name: '斯莱特林', color: '#1A472A' }, { id: 'Hogwarts', name: '霍格沃茨', color: '#5D5D5D' }, { id: 'DeathEaters', name: '食死徒', color: '#000000' }, { id: 'Unknown', name: '其他', color: '#999999' } ];
window.factionConfig = []; 

// === 初始化入口 ===
document.addEventListener('DOMContentLoaded', async () => { 
    if (typeof initGraphInstance === 'function') {
        initGraphInstance(); 
    } else {
        console.error("错误：graph_render.js 未加载，无法初始化图形。");
        return;
    }

    await loadDataFromServer(); 
    
    // 自动保存 (每5分钟)
    setInterval(() => {
        saveDataToServer();
    }, 5 * 60 * 1000);
});

// === 标签页切换 ===
function switchTab(btn, tabId) {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(tabId).classList.add('active');
}

// ============ 核心：数据读取 ============
async function loadDataFromServer() {
    if (typeof CURRENT_GRAPH_ID === 'undefined' || !CURRENT_GRAPH_ID) return;

    setStatus('loading', '读取云端数据...');
    try {
        const res = await fetch(`api/api.php?action=get_data&id=${CURRENT_GRAPH_ID}`);
        if (!res.ok) throw new Error(res.statusText);
        const json = await res.json();
        
        if (json.status === 'success') {
            // [更新标题]
            if (json.project_name) {
                document.title = json.project_name + " - 编辑中";
                const titleEl = document.getElementById('page-title');
                if (titleEl) {
                    titleEl.innerHTML = `${json.project_name}<span style="font-size:11px;color:#1890ff;">云</span>`;
                }
            }

            // 1. 加载配置
            if (json.config && !Array.isArray(json.config)) {
                window.factionConfig = json.config.factions || JSON.parse(JSON.stringify(window.DEFAULT_FACTIONS));
                applyLayoutSettings(json.config.layout);
            } else if (Array.isArray(json.config)) {
                window.factionConfig = json.config; 
            } else {
                window.factionConfig = JSON.parse(JSON.stringify(window.DEFAULT_FACTIONS));
            }
            
            renderFac(); 

            // 2. 加载节点与连线
            document.getElementById('nodeListContainer').innerHTML = '';
            document.getElementById('edgeListContainer').innerHTML = '';
            
            if (Array.isArray(json.data)) {
                const uniqueNodes = new Map();
                json.data.forEach(d => { if (!uniqueNodes.has(d.name)) uniqueNodes.set(d.name, d.faction); });
                uniqueNodes.forEach((faction, name) => addNodeRowHTML(name, faction));
                json.data.forEach(d => { if (d.target && d.rel) addEdgeRowHTML(d.name, d.rel, d.target); });
            } else if (json.data && json.data.nodes) {
                json.data.nodes.forEach(n => addNodeRowHTML(n.id, n.faction));
                json.data.edges.forEach(e => addEdgeRowHTML(e.source, e.label, e.target));
            }
            
            // 空数据默认值
            const hasNodes = document.querySelectorAll('#nodeListContainer .input-row').length > 0;
            if (!hasNodes) {
                addNodeRowHTML('哈利', 'Gryffindor');
                addNodeRowHTML('罗恩', 'Gryffindor');
                addEdgeRowHTML('哈利', '挚友', '罗恩');
            }
            
            updateGraph(); 
            setStatus('saved', '已同步最新数据');
        } else {
            // 新建项目
            window.factionConfig = JSON.parse(JSON.stringify(window.DEFAULT_FACTIONS));
            renderFac();
            addNodeRowHTML('哈利', 'Gryffindor');
            addNodeRowHTML('罗恩', 'Gryffindor');
            addEdgeRowHTML('哈利', '挚友', '罗恩');
            updateGraph();
            setStatus('saved', '新建项目');
            
            const titleEl = document.getElementById('page-title');
            if (titleEl) titleEl.innerHTML = `新关系图<span style="font-size:11px;color:#1890ff;">云</span>`;
        }
    } catch (err) {
        console.error("加载失败:", err);
        setStatus('error', '连接服务器失败');
    }
}

// ============ 核心：数据保存 (修复了变量重复和增加截图) ============
// ============ 核心：数据保存 ============
async function saveDataToServer() {
    // [新增] 1. 强制当前聚焦的输入框失去焦点，触发布局更新和输入法提交
    if (document.activeElement && (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'SELECT')) {
        document.activeElement.blur();
    }
    setStatus('saving', '正在保存...');

    // 1. 收集 Nodes (增加 cleanInput 清洗)
    const nodes = [];
    document.querySelectorAll('#nodeListContainer .input-row').forEach(r => {
        // [修改] 使用 cleanInput 包裹
        const rawName = r.querySelector('.inp-name').value;
        const rawFac = r.querySelector('.inp-fac').value;
        
        const name = cleanInput(rawName);
        const faction = cleanInput(rawFac);

        if (name) nodes.push({ id: name, faction: faction || 'Unknown' });
    });

    // 2. 收集 Edges (增加 cleanInput 清洗)
    const edges = [];
    document.querySelectorAll('#edgeListContainer .input-row').forEach(r => {
        // [修改] 使用 cleanInput 包裹
        const s = cleanInput(r.querySelector('.inp-source').value);
        const l = cleanInput(r.querySelector('.inp-label').value);
        const t = cleanInput(r.querySelector('.inp-target').value);
        
        if (s && t) edges.push({ source: s, target: t, label: l });
    });

    const combinedConfig = {
        factions: window.factionConfig,
        layout: getLayoutSettings()
    };
    
    // 3. 截图生成
// --- 修改开始：使用异步压缩截图 ---
    let thumbData = null;
    if (typeof graph !== 'undefined' && graph) {
        // 使用 await 等待图片压缩完成
        thumbData = await getGraphThumbnail(graph);
    }
    // --- 修改结束 ---

    const payload = {
        id: CURRENT_GRAPH_ID,
        thumbnail: thumbData,
        data: { nodes, edges }, 
        config: combinedConfig
    };

    try {
        const res = await fetch('api/api.php?action=save_data', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const result = await res.json();
        if (result.status === 'success') {
            setStatus('saved', '已保存');
            
            // [可选] 保存成功后，把清洗后的干净值回填到输入框里，
            // 这样用户能看到怪字符消失了（如果看着不舒服可以删掉下面这段）
            document.querySelectorAll('.inp-name').forEach(i => i.value = cleanInput(i.value));
            document.querySelectorAll('.inp-label').forEach(i => i.value = cleanInput(i.value));
            
        } else {
            setStatus('error', '保存失败');
        }
    } catch (err) {
        console.error(err);
        setStatus('error', '网络错误');
    }
}
// ============ DOM 操作 ============

function getAllNodeNames() {
    const names = [];
    document.querySelectorAll('#nodeListContainer .inp-name').forEach(input => {
        const val = input.value.trim();
        if (val) names.push(val);
    });
    return names;
}

function refreshAllEdgeSelects() {
    const names = getAllNodeNames();
    let optionsHtml = '<option value="">--选择--</option>';
    names.forEach(n => { optionsHtml += `<option value="${n}">${n}</option>`; });
    document.querySelectorAll('.inp-source, .inp-target').forEach(sel => {
        const currentVal = sel.value; 
        sel.innerHTML = optionsHtml;  
        sel.value = currentVal;       
    });
}

function addNodeRow() { addNodeRowHTML(); refreshAllEdgeSelects(); updateGraph(); }
// ============ 节点行生成 (带拖拽功能) ============
function addNodeRowHTML(name='', faction='') {
    const div = document.createElement('div');
    div.className = 'input-row';
    
    // 1. 开启拖拽
    div.setAttribute('draggable', 'true');

    // 2. 绑定全套拖拽事件
    div.addEventListener('dragstart', handleDragStart);
    div.addEventListener('dragover', handleDragOver);
    div.addEventListener('dragleave', handleDragLeave); // [新增] 离开时清除样式
    div.addEventListener('drop', handleDrop);
    div.addEventListener('dragend', handleDragEnd);

    let optionsHtml = '';
    window.factionConfig.forEach(f => {
        const selected = (f.id === faction) ? 'selected' : '';
        optionsHtml += `<option value="${f.id}" ${selected}>${f.name}</option>`;
    });

    div.innerHTML = `
        <div class="drag-handle" title="按住拖动排序">⋮</div>
        <input class="inp-name" value="${name}" placeholder="姓名" onchange="refreshAllEdgeSelects(); updateGraph()">
        <select class="inp-fac" onchange="updateGraph()">${optionsHtml}</select>
        <div class="btn-del" onclick="removeRow(this)">×</div>
    `;
    
    document.getElementById('nodeListContainer').appendChild(div);
}

// ============ 拖拽核心逻辑 (视觉优化版) ============
let dragSrcEl = null;

function handleDragStart(e) {
    // 过滤：只有点击抓手或非输入区域才能拖动
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.classList.contains('btn-del')) {
        e.preventDefault();
        return;
    }

    dragSrcEl = this;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/html', this.innerHTML);
    
    // 延时添加样式，让用户能看到拿起来的动作
    setTimeout(() => {
        this.classList.add('dragging');
    }, 0);
}

function handleDragOver(e) {
    if (e.preventDefault) e.preventDefault();
    e.dataTransfer.dropEffect = 'move';

    // 如果滑过的是自己，或者不是列表行，不做处理
    if (this === dragSrcEl) return;

    // === 核心逻辑：计算鼠标在目标行的上半部还是下半部 ===
    const rect = this.getBoundingClientRect();
    const offset = e.clientY - rect.top;
    const height = rect.height;

    // 清除旧状态，防止冲突
    this.classList.remove('drop-hint-top', 'drop-hint-bottom');

    if (offset < height / 2) {
        // 鼠标在上半部 -> 提示插入到上方
        this.classList.add('drop-hint-top');
    } else {
        // 鼠标在下半部 -> 提示插入到下方
        this.classList.add('drop-hint-bottom');
    }

    return false;
}

function handleDragLeave(e) {
    // 鼠标离开该行时，清除提示线
    this.classList.remove('drop-hint-top', 'drop-hint-bottom');
}

function handleDrop(e) {
    if (e.stopPropagation) e.stopPropagation();

    // 只有当源和目标不同时才处理
    if (dragSrcEl !== this) {
        const container = document.getElementById('nodeListContainer');
        
        // 根据刚才 handleDragOver留下的类名，决定插在哪里
        if (this.classList.contains('drop-hint-top')) {
            // 插在目标之前
            container.insertBefore(dragSrcEl, this);
        } else {
            // 插在目标之后 (即下一个兄弟之前)
            container.insertBefore(dragSrcEl, this.nextSibling);
        }
    }
    
    // 清理当前行的样式
    this.classList.remove('drop-hint-top', 'drop-hint-bottom');
    return false;
}

function handleDragEnd(e) {
    this.classList.remove('dragging');
    
    // 清理所有行可能残留的样式 (双重保险)
    document.querySelectorAll('.input-row').forEach(row => {
        row.classList.remove('drop-hint-top', 'drop-hint-bottom');
    });

    dragSrcEl = null;
    refreshAllEdgeSelects(); // 刷新下拉框顺序
}


function addEdgeRow() { addEdgeRowHTML(); updateGraph(); }
function addEdgeRowHTML(s='', l='', t='') {
    const div = document.createElement('div');
    div.className = 'input-row';
    const names = getAllNodeNames();
    let optionsHtml = '<option value="">--选择--</option>';
    names.forEach(n => { optionsHtml += `<option value="${n}">${n}</option>`; });

    div.innerHTML = `
        <select class="inp-source" onchange="updateGraph()">${optionsHtml}</select>
        <input class="inp-label" value="${l}" placeholder="关系" onchange="updateGraph()">
        <select class="inp-target" onchange="updateGraph()">${optionsHtml}</select>
        <div class="btn-del" onclick="removeRow(this)">×</div>
    `;
    document.getElementById('edgeListContainer').appendChild(div);
    const selects = div.querySelectorAll('select');
    if(s) selects[0].value = s;
    if(t) selects[1].value = t;
}

function removeRow(btn) {
    const needConfirm = document.getElementById('cfg-confirm-del').checked;
    if (needConfirm && !confirm("确定删除此行？")) return;
    const isNodeRow = btn.closest('#nodeListContainer') !== null;
    btn.parentElement.remove();
    if (isNodeRow) refreshAllEdgeSelects();
    updateGraph();
}

// ============ 工具函数 ============
window.getLayoutSettings = function() {
    if (!document.getElementById('cfg-layout-type')) return {};
    return {
        layoutType: document.getElementById('cfg-layout-type').value,
        linkDist: document.getElementById('cfg-link-dist').value,
        labelMode: document.getElementById('cfg-label-mode').value,
        edgeType: document.getElementById('cfg-edge-type').value,
        showArrow: document.getElementById('cfg-show-arrow').checked,
        showMinimap: document.getElementById('cfg-minimap').checked,
        showLegend: document.getElementById('cfg-show-legend').checked,
        autoNodeSize: document.getElementById('cfg-auto-size').checked,
        enableLOD: document.getElementById('cfg-lod').checked,
        confirmDel: document.getElementById('cfg-confirm-del').checked
    };
}

function applyLayoutSettings(settings) {
    if (!settings) return;
    if (settings.layoutType) document.getElementById('cfg-layout-type').value = settings.layoutType;
    if (settings.linkDist) { document.getElementById('cfg-link-dist').value = settings.linkDist; document.getElementById('lbl-dist-val').innerText = settings.linkDist; }
    if (settings.labelMode) document.getElementById('cfg-label-mode').value = settings.labelMode;
    if (settings.edgeType) document.getElementById('cfg-edge-type').value = settings.edgeType;
    if (settings.showArrow !== undefined) document.getElementById('cfg-show-arrow').checked = settings.showArrow;
    if (settings.showMinimap !== undefined) document.getElementById('cfg-minimap').checked = settings.showMinimap;
    if (settings.showLegend !== undefined) document.getElementById('cfg-show-legend').checked = settings.showLegend;
    if (settings.autoNodeSize !== undefined) document.getElementById('cfg-auto-size').checked = settings.autoNodeSize;
    if (settings.enableLOD !== undefined) document.getElementById('cfg-lod').checked = settings.enableLOD;
    if (settings.confirmDel !== undefined) document.getElementById('cfg-confirm-del').checked = settings.confirmDel;
}

function updateDistLabel() { document.getElementById('lbl-dist-val').innerText = document.getElementById('cfg-link-dist').value; }
function setStatus(type, text) {
    const dot = document.querySelector('.status-dot');
    const txt = document.getElementById('status-text');
    if(dot) dot.className = 'status-dot ' + type;
    if(txt) txt.innerText = text;
}

// 阵营管理
function renderFac() { 
    const l=document.getElementById('factionConfigList'); l.innerHTML=''; 
    window.factionConfig.forEach((f,i)=>{
        const d=document.createElement('div');d.className='faction-row';
        d.innerHTML=`<input type="color" value="${f.color}" onchange="updFac(${i},'color',this.value)" style="width:30px;flex:none;border:none"><input value="${f.id}" onchange="updFac(${i},'id',this.value)" style="flex:1;font-size:12px;width:0"><input value="${f.name}" onchange="updFac(${i},'name',this.value)" style="flex:1;font-size:12px;width:0"><span onclick="delFac(${i})" style="color:red;cursor:pointer">×</span>`;
        l.appendChild(d);
    }); 
    refreshAllSelectOptions();
}
function updFac(i,k,v){ window.factionConfig[i][k]=v; refreshAllSelectOptions(); } 
function delFac(i){if(window.factionConfig.length>1){window.factionConfig.splice(i,1);renderFac();}} 
function addFactionConfigRow(){window.factionConfig.push({id:'New',name:'新',color:'#1890ff'});renderFac();} 

function refreshAllSelectOptions() {
    document.querySelectorAll('.inp-fac').forEach(sel => {
        const currentVal = sel.value;
        let html = '';
        window.factionConfig.forEach(f => { html += `<option value="${f.id}">${f.name}</option>`; });
        sel.innerHTML = html;
        sel.value = currentVal;
    });
}

function updateAndGoGraph() { updateGraph(); saveDataToServer(); if (window.innerWidth <= 768 && !isMobileGraphMode) toggleMobileView(); }

function downloadJSON(){
    const d=graph.save();
    const c={nodes:d.nodes.map(n=>({id:n.id,label:n.label,faction:n.faction})),edges:d.edges.map(e=>({source:e.source,target:e.target,label:e.label}))};
    const b=new Blob([JSON.stringify(c,null,2)],{type:"application/json"});
    const u=URL.createObjectURL(b);
    const a=document.createElement('a'); a.href=u; a.download="data.json"; a.click();
}

function handleFileImport(input){
    const f=input.files[0];if(!f)return;
    const r=new FileReader();
    r.onload=e=>{try{
        const j=JSON.parse(e.target.result);
        if(confirm("覆盖云端数据？")){
            document.getElementById('nodeListContainer').innerHTML='';
            document.getElementById('edgeListContainer').innerHTML='';
            if(j.nodes) j.nodes.forEach(n=>addNodeRowHTML(n.id,n.faction));
            if(j.edges) j.edges.forEach(e=>addEdgeRowHTML(e.source,e.label,e.target));
            updateAndGoGraph();
        }
    }catch(err){alert("Error")}};
    r.readAsText(f);
}
 // === 工具：清洗输入字符串 ===
// === 工具：清洗输入字符串 (增强版) ===
function cleanInput(str) {
    if (!str) return '';
    
    // 强制转换为字符串，防止意外的 undefined/null
    str = String(str);

    // 1. 移除 Unicode 替换符 ()
    // 2. 移除 零宽空格 (\u200b, \u200c, \u200d, \ufeff) - 手机输入法常带
    // 3. 移除 从左至右/从右至左标记 (\u200e, \u200f)
    // 4. 移除 控制字符 (\x00-\x1F, \x7F-\x9F)
    return str.replace(/[\ufffd\u200b-\u200f\ufeff\u200e\u202a-\u202e\u2066-\u2069\x00-\x1F\x7F-\x9F]/g, '').trim();
}

// === 工具：生成低分辨率缩略图 (解决白屏和体积过大问题) ===
function getGraphThumbnail_99(targetGraph) {
    return new Promise((resolve) => {
        if (!targetGraph) { resolve(null); return; }

        try {
            // 1. 获取原图 (包含背景色)
            // 注意：G6 截取的是当前可视区域。建议用户在保存前最好能看到全图。
            const fullDataUrl = targetGraph.toDataURL('image/jpeg', '#f0f2f5');

            // 2. 创建一个图片对象加载它
            const img = new Image();
            img.src = fullDataUrl;

            img.onload = () => {
                // 3. 创建一个小画布进行压缩
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');

                // 设定缩略图宽度 (例如 320px，高度按比例)
                const targetWidth = 320;
                const scale = targetWidth / img.width;
                const targetHeight = img.height * scale;

                canvas.width = targetWidth;
                canvas.height = targetHeight;

                // 填充背景 (防止透明变黑)
                ctx.fillStyle = '#f0f2f5';
                ctx.fillRect(0, 0, canvas.width, canvas.height);

                // 绘制缩小后的图
                ctx.drawImage(img, 0, 0, targetWidth, targetHeight);

                // 4. 导出为低质量 JPEG (0.6 质量足够做缩略图)
                resolve(canvas.toDataURL('image/jpeg', 0.6));
            };

            img.onerror = () => {
                console.error("缩略图生成失败");
                resolve(null);
            };

        } catch (e) {
            console.error("截图错误:", e);
            resolve(null);
        }
    });
}



// === 工具：生成低分辨率缩略图 (最终稳定版) ===
function getGraphThumbnail(targetGraph) {
    return new Promise((resolve) => {
        // 1. 基础检查
        if (!targetGraph) { resolve(null); return; }

        try {
            // 2. 强制全屏适配 (确保截取完整画面)
            // 20px padding 防止贴边
            targetGraph.fitView(20);

            // 3. 强制等待渲染 (关键：解决白屏)
            // 必须给浏览器时间去重绘 Canvas，否则 toDataURL 拿到的是上一帧
            setTimeout(() => {
                try {
                    // 4. 获取原图 (指定背景色，防止透明变黑)
                    const fullDataUrl = targetGraph.toDataURL('image/jpeg', '#f0f2f5');

                    // 5. 创建图片对象进行压缩
                    const img = new Image();
                    img.src = fullDataUrl;

                    img.onload = () => {
                        const canvas = document.createElement('canvas');
                        const ctx = canvas.getContext('2d');

                        // 缩略图宽 320px
                        const targetWidth = 320;
                        // 防止除以0
                        const ratio = img.width > 0 ? (targetWidth / img.width) : 1;
                        const targetHeight = img.height * ratio;

                        canvas.width = targetWidth;
                        canvas.height = targetHeight;

                        // 绘制背景和图片
                        ctx.fillStyle = '#f0f2f5';
                        ctx.fillRect(0, 0, canvas.width, canvas.height);
                        ctx.drawImage(img, 0, 0, targetWidth, targetHeight);

                        // 返回压缩后的 Base64
                        resolve(canvas.toDataURL('image/jpeg', 0.6));
                    };

                    img.onerror = () => {
                        console.error("生成缩略图：图片加载失败");
                        resolve(null);
                    };

                } catch (innerErr) {
                    console.error("生成缩略图：内部错误", innerErr);
                    resolve(null);
                }
            }, 300); // 增加等待时间到 300ms，确保手机端也能渲染完成

        } catch (e) {
            console.error("生成缩略图：主流程错误", e);
            resolve(null);
        }
    });
}