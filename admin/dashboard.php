<?php
require_once __DIR__ . '/../includes/functions.php';
require_once __DIR__ . '/../includes/auth.php';
requireLogin();

$pageTitle = t('sidebar_dashboard');
$totalMembers = (int) $pdo->query('SELECT COUNT(*) c FROM members')->fetch()['c'];
$totalMale = (int) $pdo->query("SELECT COUNT(*) c FROM members WHERE gender='male'")->fetch()['c'];
$totalFemale = (int) $pdo->query("SELECT COUNT(*) c FROM members WHERE gender='female'")->fetch()['c'];
$totalUsers = isAdminRole() ? (int) $pdo->query('SELECT COUNT(*) c FROM users')->fetch()['c'] : null;

require __DIR__ . '/includes/layout_top.php';

$displayName = htmlspecialchars($_SESSION['admin_name'] ?: $_SESSION['admin_username']);
?>
<p class="admin-welcome"><?= str_replace('%1$s', "<strong>$displayName</strong>", t('dash_welcome')) ?></p>

<div class="stat-grid">
    <div class="stat-card">
        <span class="stat-value"><?= $totalMembers ?></span>
        <span class="stat-label"><?= htmlspecialchars(t('dash_total_members')) ?></span>
    </div>
    <div class="stat-card">
        <span class="stat-value"><?= $totalMale ?></span>
        <span class="stat-label"><?= htmlspecialchars(t('dash_male')) ?></span>
    </div>
    <div class="stat-card">
        <span class="stat-value"><?= $totalFemale ?></span>
        <span class="stat-label"><?= htmlspecialchars(t('dash_female')) ?></span>
    </div>
    <?php if ($totalUsers !== null): ?>
    <div class="stat-card">
        <span class="stat-value"><?= $totalUsers ?></span>
        <span class="stat-label"><?= htmlspecialchars(t('dash_admin_users')) ?></span>
    </div>
    <?php endif; ?>
</div>

<div class="admin-actions">
    <a class="btn" href="member_form.php"><?= htmlspecialchars(t('dash_add_member')) ?></a>
    <a class="btn secondary" href="members.php"><?= htmlspecialchars(t('dash_manage_members')) ?></a>
    <?php if (isAdminRole()): ?>
        <a class="btn secondary" href="users.php"><?= htmlspecialchars(t('dash_manage_users')) ?></a>
    <?php endif; ?>
</div>
<?php require __DIR__ . '/includes/layout_bottom.php'; ?>
