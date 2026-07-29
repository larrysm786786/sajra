<?php
require_once __DIR__ . '/../includes/functions.php';
require_once __DIR__ . '/../includes/auth.php';
requireLogin();

$userId = (int) $_SESSION['admin_id'];
$errors = [];
$success = '';

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $current = $_POST['current_password'] ?? '';
    $new = $_POST['new_password'] ?? '';
    $confirm = $_POST['confirm_password'] ?? '';

    $stmt = $pdo->prepare('SELECT * FROM users WHERE id = ?');
    $stmt->execute([$userId]);
    $user = $stmt->fetch();

    if (!$user || !password_verify($current, $user['password'])) {
        $errors[] = t('pwd_err_current');
    }
    if (strlen($new) < 6) {
        $errors[] = t('pwd_err_length');
    }
    if ($new !== $confirm) {
        $errors[] = t('pwd_err_match');
    }

    if (empty($errors)) {
        $hash = password_hash($new, PASSWORD_DEFAULT);
        $pdo->prepare('UPDATE users SET password = ? WHERE id = ?')->execute([$hash, $userId]);
        $success = t('pwd_success');
    }
}

$pageTitle = t('pwd_title');
require __DIR__ . '/includes/layout_top.php';
?>
<?php foreach ($errors as $e): ?><p class="error"><?= htmlspecialchars($e) ?></p><?php endforeach; ?>
<?php if ($success): ?><p class="success"><?= htmlspecialchars($success) ?></p><?php endif; ?>

<form method="post" class="form">
    <label><?= htmlspecialchars(t('pwd_current')) ?>
        <input type="password" name="current_password" required>
    </label>
    <label><?= htmlspecialchars(t('pwd_new')) ?> <span class="field-hint"><?= htmlspecialchars(t('pwd_new_hint')) ?></span>
        <input type="password" name="new_password" required minlength="6">
    </label>
    <label><?= htmlspecialchars(t('pwd_confirm')) ?>
        <input type="password" name="confirm_password" required minlength="6">
    </label>
    <button type="submit" class="btn"><?= htmlspecialchars(t('pwd_update_btn')) ?></button>
</form>
<?php require __DIR__ . '/includes/layout_bottom.php'; ?>
