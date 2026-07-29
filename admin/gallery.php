<?php
require_once __DIR__ . '/../includes/functions.php';
require_once __DIR__ . '/../includes/auth.php';
requireLogin();

$errors = [];
$success = '';
$allowed = ['jpg' => 'image/jpeg', 'jpeg' => 'image/jpeg', 'png' => 'image/png', 'webp' => 'image/webp'];

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $caption = trim($_POST['caption'] ?? '');
    $files = $_FILES['images'] ?? null;
    $uploadedCount = 0;

    if (!$files || empty($files['name'][0])) {
        $errors[] = t('gallery_err_none_selected');
    } else {
        foreach ($files['name'] as $i => $origName) {
            $tmpName = $files['tmp_name'][$i];
            $error = $files['error'][$i];
            $size = $files['size'][$i];
            $ext = strtolower(pathinfo($origName, PATHINFO_EXTENSION));

            if ($error !== UPLOAD_ERR_OK) {
                $errors[] = t('gallery_err_upload', $origName);
                continue;
            }
            if (!isset($allowed[$ext])) {
                $errors[] = t('gallery_err_filetype', $origName);
                continue;
            }
            if ($size > 8 * 1024 * 1024) {
                $errors[] = t('gallery_err_filesize', $origName);
                continue;
            }

            $finfo = finfo_open(FILEINFO_MIME_TYPE);
            $mime = finfo_file($finfo, $tmpName);
            finfo_close($finfo);
            if ($mime !== $allowed[$ext]) {
                $errors[] = t('gallery_err_corrupt', $origName);
                continue;
            }

            $newName = bin2hex(random_bytes(16)) . '.' . $ext;
            $dest = __DIR__ . '/../uploads/gallery/' . $newName;
            if (move_uploaded_file($tmpName, $dest)) {
                $pdo->prepare('INSERT INTO gallery_images (filename, caption) VALUES (?, ?)')
                    ->execute([$newName, $caption !== '' ? $caption : null]);
                $uploadedCount++;
            } else {
                $errors[] = t('gallery_err_savefail', $origName);
            }
        }
    }

    if ($uploadedCount > 0 && empty($errors)) {
        $success = t('gallery_success', $uploadedCount);
    } elseif ($uploadedCount > 0) {
        $success = t('gallery_success_partial', $uploadedCount);
    }
}

$pageTitle = t('gallery_title');
$images = $pdo->query('SELECT * FROM gallery_images ORDER BY uploaded_at DESC')->fetchAll();
require __DIR__ . '/includes/layout_top.php';
?>
<?php foreach ($errors as $e): ?><p class="error"><?= htmlspecialchars($e) ?></p><?php endforeach; ?>
<?php if ($success): ?><p class="success"><?= htmlspecialchars($success) ?></p><?php endif; ?>

<form method="post" enctype="multipart/form-data" class="form">
    <label><?= htmlspecialchars(t('gallery_photos_label')) ?>
        <input type="file" name="images[]" accept=".jpg,.jpeg,.png,.webp" multiple required>
    </label>
    <label><?= htmlspecialchars(t('gallery_caption_label')) ?> <span class="field-hint"><?= htmlspecialchars(t('gallery_caption_hint')) ?></span>
        <input type="text" name="caption">
    </label>
    <button type="submit" class="btn"><?= htmlspecialchars(t('gallery_upload_btn')) ?></button>
</form>

<h2 class="section-heading-spaced"><?= htmlspecialchars(t('gallery_uploaded_heading')) ?></h2>
<?php if (empty($images)): ?>
    <p class="hint"><?= htmlspecialchars(t('gallery_none_yet')) ?></p>
<?php else: ?>
    <div class="gallery-grid">
        <?php foreach ($images as $img): ?>
            <div class="gallery-item">
                <img src="../uploads/gallery/<?= htmlspecialchars($img['filename']) ?>" alt="<?= htmlspecialchars($img['caption'] ?? '') ?>">
                <?php if ($img['caption']): ?><div class="gallery-caption"><?= htmlspecialchars($img['caption']) ?></div><?php endif; ?>
                <a class="gallery-delete" href="gallery_delete.php?id=<?= (int) $img['id'] ?>" onclick="return confirm('<?= htmlspecialchars(t('gallery_delete_confirm'), ENT_QUOTES) ?>');"><?= htmlspecialchars(t('gallery_delete')) ?></a>
            </div>
        <?php endforeach; ?>
    </div>
<?php endif; ?>
<?php require __DIR__ . '/includes/layout_bottom.php'; ?>
