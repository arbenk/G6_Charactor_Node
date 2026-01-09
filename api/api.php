<?php
// api/api.php
// 统一入口文件

require 'db.php';

// 获取操作类型
$action = $_GET['action'] ?? '';

// Debug 模式单独处理
if ($action === 'debug') {
    handleDebug($host, $db, $user, $pass, $charset);
    exit;
}

// 其他接口统一为 JSON 格式
header('Content-Type: application/json');

try {
    switch ($action) {
        case 'get_list':
            handleGetList($pdo);
            break;
            
        case 'get_data':
            handleGetData($pdo);
            break;
            
        case 'create_graph':
            handleCreateGraph($pdo);
            break;
            
        case 'save_data':
            handleSaveData($pdo);
            break;
            
        case 'delete_graph':
            handleDeleteGraph($pdo);
            break;

        case 'rename_graph': // [新增]
            handleRenameGraph($pdo);
            break;
            
        default:
            echo json_encode(['status' => 'error', 'message' => '未知或缺少 action 参数']);
            break;
        case 'duplicate_graph': // [新增]
            handleDuplicateGraph($pdo);
            break;
            
        case 'reorder_graphs': // [新增]
            handleReorderGraphs($pdo);
            break;
    }
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
}

// ==========================================
// 具体处理函数
// ==========================================

function handleGetList($pdo) {
    // [修改] 增加 ORDER BY sort_order ASC, updated_at DESC
    // 这样数字越小越靠前；如果没排序，按时间倒序
    $stmt = $pdo->query("SELECT id, project_name, updated_at, thumbnail FROM graph_data ORDER BY sort_order ASC, updated_at DESC");
    $rows = $stmt->fetchAll();
    echo json_encode(['status' => 'success', 'list' => $rows]);
}

function handleGetData($pdo) {
    $id = isset($_GET['id']) ? intval($_GET['id']) : 0;
    if ($id <= 0) {
        echo json_encode(['status' => 'error', 'message' => '无效的ID']);
        return;
    }

    $stmt = $pdo->prepare("SELECT nodes_data, config_data, project_name FROM graph_data WHERE id = ?");
    $stmt->execute([$id]);
    $row = $stmt->fetch();

    if ($row) {
        echo json_encode([
            'status' => 'success',
            'project_name' => $row['project_name'],
            'data' => json_decode($row['nodes_data']),
            'config' => json_decode($row['config_data'])
        ]);
    } else {
        echo json_encode(['status' => 'empty']);
    }
}

function handleCreateGraph($pdo) {
    $input = json_decode(file_get_contents('php://input'), true);
    $name = $input['name'] ?? '新关系图';

    $stmt = $pdo->prepare("INSERT INTO graph_data (project_name, nodes_data, config_data, created_at, updated_at) VALUES (?, '[]', '{}', NOW(), NOW())");
    $stmt->execute([$name]);
    
    echo json_encode(['status' => 'success', 'id' => $pdo->lastInsertId()]);
}

function handleSaveData($pdo) {
    $input = json_decode(file_get_contents('php://input'), true);

    if (!$input || !isset($input['id'])) {
        echo json_encode(['status' => 'error', 'message' => '缺少参数']);
        return;
    }

    $id = intval($input['id']);
    // [修改] 增加 JSON_INVALID_UTF8_SUBSTITUTE (PHP 7.2+) 或 IGNORE
    // 这会把无法识别的字节序列自动替换或忽略，防止数据库报错或存入乱码
    $nodesJson = json_encode($input['data'], JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE);
    $configJson = json_encode($input['config'], JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE);
    
    // [新增] 获取缩略图数据
    $thumbnail = $input['thumbnail'] ?? null;
    
    // [修改] 更新 SQL 包含 thumbnail
    $stmt = $pdo->prepare("UPDATE graph_data SET nodes_data = ?, config_data = ?, thumbnail = ?, updated_at = NOW() WHERE id = ?");
    $stmt->execute([$nodesJson, $configJson, $thumbnail, $id]);

    echo json_encode(['status' => 'success']);
}

function handleDeleteGraph($pdo) {
    $input = json_decode(file_get_contents('php://input'), true);
    $id = $input['id'] ?? 0;

    if($id == 0) {
        echo json_encode(['status'=>'error', 'message' => 'ID无效']);
        return;
    }

    $stmt = $pdo->prepare("DELETE FROM graph_data WHERE id = ?");
    $stmt->execute([$id]);
    echo json_encode(['status' => 'success']);
}

// [新增] 重命名处理函数
function handleRenameGraph($pdo) {
    $input = json_decode(file_get_contents('php://input'), true);
    $id = $input['id'] ?? 0;
    $name = $input['name'] ?? '';

    if ($id == 0 || empty($name)) {
        echo json_encode(['status' => 'error', 'message' => '参数缺失']);
        return;
    }

    $stmt = $pdo->prepare("UPDATE graph_data SET project_name = ?, updated_at = NOW() WHERE id = ?");
    $stmt->execute([$name, $id]);
    echo json_encode(['status' => 'success']);
}

function handleDebug($host, $db, $user, $pass, $charset) {
    ini_set('display_errors', 1);
    ini_set('display_startup_errors', 1);
    error_reporting(E_ALL);
    header('Content-Type: text/html; charset=utf-8');

    echo "<h2>🔌 数据库连接诊断工具 (合并版)</h2><hr>";
    // ... (保持原有的 Debug 输出逻辑) ...
    echo "<strong>1. 检查 PHP 扩展...</strong><br>";
    if (!extension_loaded('pdo_mysql')) { die("<span style='color:red'>❌ 错误：未加载 pdo_mysql 扩展。</span>"); }
    echo "<span style='color:green'>✅ PDO_MySQL 扩展已加载</span><br><br>";

    echo "尝试连接数据库: <b>$db</b> (Host: $host)<br>";
    try {
        $dsn_test = "mysql:host=$host;dbname=$db;charset=$charset";
        $pdo_test = new PDO($dsn_test, $user, $pass, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_TIMEOUT => 5]);
        echo "<span style='color:green'>✅ 数据库连接成功！</span><br><br>";
    } catch (PDOException $e) {
        echo "<span style='color:red'>❌ 连接失败！</span><br>错误: " . $e->getMessage();
        exit;
    }
    
    echo "<strong>3. 检查数据表...</strong><br>";
    try {
        $stmt = $pdo_test->query("SHOW TABLES LIKE 'graph_data'");
        if ($stmt->rowCount() > 0) echo "<span style='color:green'>✅ 数据表 'graph_data' 存在。</span><br>";
        else echo "<span style='color:red'>❌ 错误：表 'graph_data' 不存在。</span>";
    } catch (Exception $e) { echo "查询错误: " . $e->getMessage(); }
}

// [新增] 复制功能
function handleDuplicateGraph($pdo) {
    $input = json_decode(file_get_contents('php://input'), true);
    $id = $input['id'] ?? 0;
    
    if ($id <= 0) {
        echo json_encode(['status' => 'error', 'message' => 'ID无效']);
        return;
    }

    // 1. 读取原数据
    $stmt = $pdo->prepare("SELECT project_name, nodes_data, config_data, thumbnail, sort_order FROM graph_data WHERE id = ?");
    $stmt->execute([$id]);
    $row = $stmt->fetch();

    if (!$row) {
        echo json_encode(['status' => 'error', 'message' => '原图不存在']);
        return;
    }

    // 2. 构建新名称和数据
    $newName = $row['project_name'] . " (副本)";
    // 插入到原图后面 (sort_order + 1) 或者直接放在最后
    $newOrder = $row['sort_order'] + 1;

    // 3. 插入新记录
    $insert = $pdo->prepare("INSERT INTO graph_data (project_name, nodes_data, config_data, thumbnail, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, NOW(), NOW())");
    $insert->execute([
        $newName, 
        $row['nodes_data'], 
        $row['config_data'], 
        $row['thumbnail'],
        $newOrder
    ]);

    echo json_encode(['status' => 'success', 'id' => $pdo->lastInsertId()]);
}

// [新增] 排序功能
function handleReorderGraphs($pdo) {
    $input = json_decode(file_get_contents('php://input'), true);
    $ids = $input['ids'] ?? []; // 前端传来的 ID 数组，按顺序排列

    if (empty($ids)) {
        echo json_encode(['status' => 'error']);
        return;
    }

    // 开启事务，批量更新
    $pdo->beginTransaction();
    try {
        $sql = "UPDATE graph_data SET sort_order = ? WHERE id = ?";
        $stmt = $pdo->prepare($sql);
        
        foreach ($ids as $index => $id) {
            // 索引即为顺序 (0, 1, 2...)
            $stmt->execute([$index, $id]);
        }
        
        $pdo->commit();
        echo json_encode(['status' => 'success']);
    } catch (Exception $e) {
        $pdo->rollBack();
        echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
    }
}

?>