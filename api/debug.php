<?php
// api/debug.php
// 开启所有错误显示
ini_set('display_errors', 1);
ini_set('display_startup_errors', 1);
error_reporting(E_ALL);
header('Content-Type: text/html; charset=utf-8');

echo "<h2>🔌 数据库连接诊断工具</h2>";
echo "<hr>";

// 1. 检查扩展
echo "<strong>1. 检查 PHP 扩展...</strong><br>";
if (!extension_loaded('pdo_mysql')) {
    die("<span style='color:red'>❌ 错误：未加载 pdo_mysql 扩展。请修改 php.ini 启用该扩展。</span>");
}
echo "<span style='color:green'>✅ PDO_MySQL 扩展已加载</span><br><br>";

// 2. 尝试引入配置文件
echo "<strong>2. 读取配置...</strong><br>";
if (!file_exists('db.php')) {
    die("<span style='color:red'>❌ 错误：找不到 api/db.php 文件。</span>");
}
// 临时覆盖 db.php 里的 exit 行为，以便我们可以捕获错误
ob_start(); 
include 'db.php'; 
ob_end_clean();

echo "尝试连接数据库: <b>$db</b> (Host: $host, User: $user)<br>";

// 3. 单独测试连接（不依赖 db.php 的 try-catch）
echo "<strong>3. 建立连接...</strong><br>";
try {
    $dsn_test = "mysql:host=$host;dbname=$db;charset=$charset";
    $pdo_test = new PDO($dsn_test, $user, $pass, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_TIMEOUT => 5 // 设置5秒超时
    ]);
    echo "<span style='color:green'>✅ 数据库连接成功！</span><br><br>";
} catch (PDOException $e) {
    echo "<span style='color:red'>❌ 连接失败！</span><br>";
    echo "错误代码: " . $e->getCode() . "<br>";
    echo "错误信息: " . $e->getMessage() . "<br>";
    echo "<br><strong>常见原因排查：</strong><ul>";
    echo "<li>如果是 <code>Access denied</code>：用户名或密码错了。</li>";
    echo "<li>如果是 <code>Unknown database</code>：数据库名写错了，或者还没在 MySQL 里建库。</li>";
    echo "<li>如果是 <code>Connection refused</code>：MySQL 服务没启动，或者端口不是 3306。</li>";
    echo "</ul>";
    exit;
}

// 4. 检查表是否存在
echo "<strong>4. 检查数据表...</strong><br>";
try {
    $stmt = $pdo_test->query("SHOW TABLES LIKE 'graph_data'");
    if ($stmt->rowCount() > 0) {
        echo "<span style='color:green'>✅ 数据表 'graph_data' 存在。</span><br><br>";
        
        // 5. 检查数据
        $stmt = $pdo_test->query("SELECT id, project_name, updated_at FROM graph_data WHERE id = 1");
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        if ($row) {
            echo "<span style='color:green'>✅ 成功读取到 ID=1 的数据。</span><br>";
            echo "最后更新时间: " . $row['updated_at'];
        } else {
            echo "<span style='color:orange'>⚠️ 表存在，但 ID=1 的数据不存在。请执行初始化 SQL。</span>";
        }
        
    } else {
        echo "<span style='color:red'>❌ 错误：表 'graph_data' 不存在。请执行建表 SQL。</span>";
    }
} catch (Exception $e) {
    echo "查询错误: " . $e->getMessage();
}

echo "<hr><h3>🎉 如果以上全绿，请重新刷新网页测试。</h3>";
?>