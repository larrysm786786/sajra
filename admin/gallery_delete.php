<?php
require_once __DIR__ . '/../includes/functions.php';
require_once __DIR__ . '/../includes/auth.php';
requireLogin();

$id = (int) ($_GET['id'] ?? 0);
if ($id) {
    $stmt = $pdo->prepare('SELECT * FROM gallery_images WHERE id = ?');
    $stmt->execute([$id]);
    $image = $stmt->fetch();

    if ($image) {
        $pdo->prepare('DELETE FROM gallery_images WHERE id = ?')->execute([$id]);
        $path = __DIR__ . '/../uploads/gallery/' . $image['filename'];
        if (file_exists($path)) {
            unlink($path);
        }
    }
}

header('Location: gallery.php');
exit;
