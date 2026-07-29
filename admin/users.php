<?php
require_once __DIR__ . '/../includes/functions.php';
require_once __DIR__ . '/../includes/auth.php';
requireAdminRole();

$pageTitle = t('users_title');
$users = $pdo->query('SELECT * FROM users ORDER BY name, username')->fetchAll();
require __DIR__ . '/includes/layout_top.php';
?>
<p class="admin-actions"><a class="btn" href="user_form.php"><?= htmlspecialchars(t('users_new')) ?></a></p>
<table class="admin-table">
    <thead>
        <tr><th><?= htmlspecialchars(t('users_th_name')) ?></th><th><?= htmlspecialchars(t('users_th_username')) ?></th><th><?= htmlspecialchars(t('users_th_email')) ?></th><th><?= htmlspecialchars(t('users_th_role')) ?></th><th><?= htmlspecialchars(t('users_th_actions')) ?></th></tr>
    </thead>
    <tbody>
    <?php foreach ($users as $u): ?>
        <tr>
            <td><?= htmlspecialchars($u['name'] ?: '-') ?></td>
            <td><?= htmlspecialchars($u['username']) ?></td>
            <td><?= htmlspecialchars($u['email'] ?: '-') ?></td>
            <td><span class="role-badge role-<?= htmlspecialchars($u['role']) ?>"><?= htmlspecialchars(ucfirst($u['role'])) ?></span></td>
            <td>
                <a href="user_form.php?id=<?= (int) $u['id'] ?>"><?= htmlspecialchars(t('members_edit')) ?></a>
                <?php if ((int) $u['id'] !== (int) $_SESSION['admin_id']): ?>
                    &middot;
                    <a href="user_delete.php?id=<?= (int) $u['id'] ?>" onclick="return confirm('<?= htmlspecialchars(t('users_delete_confirm'), ENT_QUOTES) ?>');"><?= htmlspecialchars(t('members_delete')) ?></a>
                <?php endif; ?>
            </td>
        </tr>
    <?php endforeach; ?>
    </tbody>
</table>
<?php require __DIR__ . '/includes/layout_bottom.php'; ?>
