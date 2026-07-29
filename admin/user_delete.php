<?php
require_once __DIR__ . '/../includes/functions.php';
require_once __DIR__ . '/../includes/auth.php';
requireAdminRole();

$id = (int) ($_GET['id'] ?? 0);

if ($id && $id !== (int) $_SESSION['admin_id']) {
    $stmt = $pdo->prepare('SELECT role FROM users WHERE id = ?');
    $stmt->execute([$id]);
    $target = $stmt->fetch();

    if ($target) {
        $proceed = true;
        if ($target['role'] === 'admin') {
            $adminCount = (int) $pdo->query("SELECT COUNT(*) c FROM users WHERE role = 'admin'")->fetch()['c'];
            $proceed = $adminCount > 1;
        }
        if ($proceed) {
            $pdo->prepare('DELETE FROM users WHERE id = ?')->execute([$id]);
        }
    }
}

header('Location: users.php');
exit;
