<?php
// api/db.php

// === 1. 允许跨域 ===
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: GET, POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type");

if ($_SERVER['REQUEST_METHOD'] == 'OPTIONS') {
    exit(0);
}

// === 2. 数据库配置 ===
$host = '...'; // 数据库主机
$db   = '...'; // 数据库名称
$user = '...'; // 数据库用户名
$pass = '...'; // 数据库密码
$charset = 'utf8mb4'; // 关键：必须是 utf8mb4

$dsn = "mysql:host=$host;dbname=$db;charset=$charset";
$options = [
    PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    PDO::ATTR_EMULATE_PREPARES   => false,
    // [新增] 强制 MySQL 连接使用 utf8mb4，防止手机端 Emoji 乱码
    PDO::MYSQL_ATTR_INIT_COMMAND => "SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci"
];

try {
    $pdo = new PDO($dsn, $user, $pass, $options);
} catch (\PDOException $e) {
    http_response_code(500);
    echo json_encode([
        'status' => 'error',
        'message' => '数据库连接失败',
        'debug_info' => $e->getMessage()
    ]);
    exit;
}
?>