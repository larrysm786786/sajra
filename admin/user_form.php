<?php
require_once __DIR__ . '/../includes/functions.php';
require_once __DIR__ . '/../includes/auth.php';
requireAdminRole();

$id = (int) ($_GET['id'] ?? 0);
$user = null;
if ($id) {
    $stmt = $pdo->prepare('SELECT * FROM users WHERE id = ?');
    $stmt->execute([$id]);
    $user = $stmt->fetch();
}

$errors = [];

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $name = trim($_POST['name'] ?? '');
    $username = trim($_POST['username'] ?? '');
    $email = trim($_POST['email'] ?? '');
    $role = $_POST['role'] ?? 'editor';
    $password = $_POST['password'] ?? '';

    if ($username === '') $errors[] = t('uform_err_username');
    if (!in_array($role, ['admin', 'editor'], true)) $errors[] = 'Invalid role.';
    if ($email !== '' && !filter_var($email, FILTER_VALIDATE_EMAIL)) $errors[] = t('uform_err_email');
    if (!$user && strlen($password) < 6) $errors[] = t('uform_err_password_required');
    if ($password !== '' && strlen($password) < 6) $errors[] = t('uform_err_password_length');

    if (empty($errors)) {
        $dupStmt = $user
            ? $pdo->prepare('SELECT id FROM users WHERE username = ? AND id != ?')
            : $pdo->prepare('SELECT id FROM users WHERE username = ?');
        $user ? $dupStmt->execute([$username, $id]) : $dupStmt->execute([$username]);
        if ($dupStmt->fetch()) {
            $errors[] = t('uform_err_dup_username');
        }
    }

    if (empty($errors) && $user && $user['role'] === 'admin' && $role !== 'admin') {
        $adminCount = (int) $pdo->query("SELECT COUNT(*) c FROM users WHERE role = 'admin'")->fetch()['c'];
        if ($adminCount <= 1) {
            $errors[] = t('uform_err_last_admin');
        }
    }

    if (empty($errors)) {
        if ($user) {
            if ($password !== '') {
                $hash = password_hash($password, PASSWORD_DEFAULT);
                $pdo->prepare('UPDATE users SET name=?, username=?, email=?, role=?, password=? WHERE id=?')
                    ->execute([$name, $username, $email, $role, $hash, $id]);
            } else {
                $pdo->prepare('UPDATE users SET name=?, username=?, email=?, role=? WHERE id=?')
                    ->execute([$name, $username, $email, $role, $id]);
            }
        } else {
            $hash = password_hash($password, PASSWORD_DEFAULT);
            $pdo->prepare('INSERT INTO users (name, username, email, role, password) VALUES (?,?,?,?,?)')
                ->execute([$name, $username, $email, $role, $hash]);
        }
        header('Location: users.php');
        exit;
    }

    $user = ['id' => $id, 'name' => $name, 'username' => $username, 'email' => $email, 'role' => $role];
}

$pageTitle = $user ? t('uform_title_edit') : t('uform_title_new');
require __DIR__ . '/includes/layout_top.php';
?>
<?php foreach ($errors as $e): ?><p class="error"><?= htmlspecialchars($e) ?></p><?php endforeach; ?>

<form method="post" class="form">
    <label><?= htmlspecialchars(t('uform_full_name')) ?>
        <input type="text" name="name" value="<?= htmlspecialchars($user['name'] ?? '') ?>">
    </label>
    <label><?= htmlspecialchars(t('uform_username')) ?>
        <input type="text" name="username" required value="<?= htmlspecialchars($user['username'] ?? '') ?>">
    </label>
    <label><?= htmlspecialchars(t('uform_email')) ?>
        <input type="email" name="email" value="<?= htmlspecialchars($user['email'] ?? '') ?>">
    </label>
    <label><?= htmlspecialchars(t('uform_role')) ?>
        <select name="role" required>
            <option value="editor" <?= ($user['role'] ?? 'editor') === 'editor' ? 'selected' : '' ?>><?= htmlspecialchars(t('uform_role_editor')) ?></option>
            <option value="admin" <?= ($user['role'] ?? '') === 'admin' ? 'selected' : '' ?>><?= htmlspecialchars(t('uform_role_admin')) ?></option>
        </select>
    </label>
    <label><?= $user ? htmlspecialchars(t('uform_new_password')) : htmlspecialchars(t('uform_password')) ?> <span class="field-hint">(<?= $user ? htmlspecialchars(t('uform_password_hint_edit')) : htmlspecialchars(t('uform_password_hint_new')) ?>)</span>
        <input type="password" name="password" <?= $user ? '' : 'required' ?> minlength="6">
    </label>
    <button type="submit" class="btn"><?= $user ? htmlspecialchars(t('uform_update_btn')) : htmlspecialchars(t('uform_add_btn')) ?></button>
    <a class="btn secondary" href="users.php"><?= htmlspecialchars(t('uform_cancel')) ?></a>
</form>
<?php require __DIR__ . '/includes/layout_bottom.php'; ?>
