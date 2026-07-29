<?php
$localConfig = __DIR__ . '/db.local.php';

function buildPgsqlConfigFromUrl(string $databaseUrl): array
{
    $parts = parse_url($databaseUrl);
    if ($parts === false || empty($parts['host'])) {
        die('Database connection failed. DATABASE_URL is not a valid Postgres connection string.');
    }

    $query = [];
    if (!empty($parts['query'])) {
        parse_str($parts['query'], $query);
    }

    return [
        'DB_DRIVER' => 'pgsql',
        'DB_HOST' => $parts['host'],
        'DB_PORT' => $parts['port'] ?? '5432',
        'DB_NAME' => ltrim($parts['path'] ?? '/postgres', '/'),
        'DB_USER' => isset($parts['user']) ? rawurldecode($parts['user']) : 'postgres',
        'DB_PASS' => isset($parts['pass']) ? rawurldecode($parts['pass']) : '',
        'DB_SSLMODE' => $query['sslmode'] ?? 'require',
    ];
}

if (file_exists($localConfig)) {
    require $localConfig;
} else {
    $databaseUrl = getenv('DATABASE_URL') ?: getenv('SUPABASE_DB_URL');

    if ($databaseUrl) {
        extract(buildPgsqlConfigFromUrl($databaseUrl));
    } else {
        $DB_DRIVER = getenv('DB_DRIVER') ?: 'mysql';
        $DB_HOST = getenv('DB_HOST') ?: 'localhost';
        $DB_PORT = getenv('DB_PORT') ?: ($DB_DRIVER === 'pgsql' ? '5432' : '3306');
        $DB_NAME = getenv('DB_NAME') ?: 'sajra';
        $DB_USER = getenv('DB_USER') ?: 'root';
        $DB_PASS = getenv('DB_PASS') ?: '';
        $DB_SSLMODE = getenv('DB_SSLMODE') ?: ($DB_DRIVER === 'pgsql' ? 'prefer' : null);
    }
}

$dsn = $DB_DRIVER === 'pgsql'
    ? "pgsql:host=$DB_HOST;port=$DB_PORT;dbname=$DB_NAME" . ($DB_SSLMODE ? ";sslmode=$DB_SSLMODE" : '')
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
