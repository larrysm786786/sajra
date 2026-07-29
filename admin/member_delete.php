<?php
require_once __DIR__ . '/../includes/functions.php';
require_once __DIR__ . '/../includes/auth.php';
requireLogin();

$id = (int) ($_GET['id'] ?? 0);
if ($id) {
    $member = getMember($pdo, $id);
    if ($member) {
        $pdo->prepare('DELETE FROM spouses WHERE member_id = ? OR spouse_id = ?')->execute([$id, $id]);
        $pdo->prepare('DELETE FROM members WHERE id = ?')->execute([$id]);
        if (!empty($member['photo']) && file_exists(__DIR__ . '/../uploads/photos/' . $member['photo'])) {
            unlink(__DIR__ . '/../uploads/photos/' . $member['photo']);
        }
    }
}

header('Location: members.php');
exit;
