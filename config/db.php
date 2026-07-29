<?php
$localConfig = __DIR__ . '/db.local.php';

if (file_exists($localConfig)) {
    require $localConfig;
} else {
    $DB_DRIVER = getenv('DB_DRIVER') ?: 'mysql';
    $DB_HOST = getenv('DB_HOST') ?: 'localhost';
    $DB_PORT = getenv('DB_PORT') ?: ($DB_DRIVER === 'pgsql' ? '5432' : '3306');
    $DB_NAME = getenv('DB_NAME') ?: 'sajra';
    $DB_USER = getenv('DB_USER') ?: 'root';
    $DB_PASS = getenv('DB_PASS') ?: '';
}

$dsn = $DB_DRIVER === 'pgsql'
    ? "pgsql:host=$DB_HOST;port=$DB_PORT;dbname=$DB_NAME"
    : "mysql:host=$DB_HOST;port=$DB_PORT;dbname=$DB_NAME;charset=utf8mb4";

try {
    $pdo = new PDO(
        $dsn,
        $DB_USER,
        $DB_PASS,
        [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        ]
    );
} catch (PDOException $e) {
    die('Database connection failed. Check config/db.local.php (copy from db.example.php) or your DB_* environment variables.');
}
