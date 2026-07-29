<?php
require_once __DIR__ . '/../includes/functions.php';
require_once __DIR__ . '/../includes/auth.php';
requireLogin();

$userId = (int) $_SESSION['admin_id'];
$stmt = $pdo->prepare('SELECT * FROM users WHERE id = ?');
$stmt->execute([$userId]);
$user = $stmt->fetch();

$errors = [];
$success = '';

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $name = trim($_POST['name'] ?? '');
    $email = trim($_POST['email'] ?? '');
    $username = trim($_POST['username'] ?? '');

    if ($username === '') $errors[] = t('profile_err_username');
    if ($email !== '' && !filter_var($email, FILTER_VALIDATE_EMAIL)) $errors[] = t('profile_err_email');

    if (empty($errors)) {
        $dup = $pdo->prepare('SELECT id FROM users WHERE username = ? AND id != ?');
        $dup->execute([$username, $userId]);
        if ($dup->fetch()) {
            $errors[] = t('profile_err_dup_username');
        }
    }

    if (empty($errors)) {
        $stmt = $pdo->prepare('UPDATE users SET name=?, email=?, username=? WHERE id=?');
        $stmt->execute([$name, $email, $username, $userId]);
        $_SESSION['admin_username'] = $username;
        $_SESSION['admin_name'] = $name;
        $user['name'] = $name;
        $user['email'] = $email;
        $user['username'] = $username;
        $success = t('profile_success');
    }
}

$pageTitle = t('profile_title');
require __DIR__ . '/includes/layout_top.php';
?>
<?php foreach ($errors as $e): ?><p class="error"><?= htmlspecialchars($e) ?></p><?php endforeach; ?>
<?php if ($success): ?><p class="success"><?= htmlspecialchars($success) ?></p><?php endif; ?>

<form method="post" class="form">
    <label><?= htmlspecialchars(t('profile_full_name')) ?>
        <input type="text" name="name" value="<?= htmlspecialchars($user['name'] ?? '') ?>">
    </label>
    <label><?= htmlspecialchars(t('profile_username')) ?>
        <input type="text" name="username" required value="<?= htmlspecialchars($user['username']) ?>">
    </label>
    <label><?= htmlspecialchars(t('profile_email')) ?>
        <input type="email" name="email" value="<?= htmlspecialchars($user['email'] ?? '') ?>">
    </label>
    <label><?= htmlspecialchars(t('profile_role')) ?>
        <input type="text" value="<?= htmlspecialchars(ucfirst($user['role'])) ?>" disabled>
    </label>
    <button type="submit" class="btn"><?= htmlspecialchars(t('profile_update_btn')) ?></button>
    <a class="btn secondary" href="change_password.php"><?= htmlspecialchars(t('profile_change_password_btn')) ?></a>
</form>
<?php require __DIR__ . '/includes/layout_bottom.php'; ?>
