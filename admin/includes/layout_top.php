<?php
require_once __DIR__ . '/../../includes/auth.php';
requireLogin();

$currentPage = basename($_SERVER['SCRIPT_NAME']);
function navActive(string $page, string $current): string
{
    return $page === $current ? ' active' : '';
}
?>
<!DOCTYPE html>
<html lang="<?= currentLang() ?>" dir="<?= isRtl() ? 'rtl' : 'ltr' ?>">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title><?= isset($pageTitle) ? htmlspecialchars($pageTitle) . ' - ' : '' ?>Admin - Sajra</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600;700&family=Inter:wght@400;500;600;700&family=Noto+Nastaliq+Urdu:wght@400;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="../assets/css/style.css">
</head>
<body class="admin-body <?= isRtl() ? 'lang-ur' : 'lang-en' ?>">
<div class="admin-shell">
    <aside class="admin-sidebar">
        <a href="dashboard.php" class="admin-brand">
            <svg class="brand-mark" viewBox="0 0 24 24" width="24" height="24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M12 2v20M12 6c-3 0-5 2-5 4.5S9 14 12 14s5-1.5 5-3.5S15 6 12 6ZM12 14c-3.5 0-6 2-6 4.5V20h12v-1.5c0-2.5-2.5-4.5-6-4.5Z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/>
            </svg>
            <span><?= htmlspecialchars(t('site_name')) ?> <small>Admin</small></span>
        </a>
        <nav class="admin-nav">
            <a class="<?= navActive('dashboard.php', $currentPage) ?>" href="dashboard.php"><?= htmlspecialchars(t('sidebar_dashboard')) ?></a>
            <a class="<?= navActive('members.php', $currentPage) . navActive('member_form.php', $currentPage) ?>" href="members.php"><?= htmlspecialchars(t('sidebar_members')) ?></a>
            <a class="<?= navActive('gallery.php', $currentPage) ?>" href="gallery.php"><?= htmlspecialchars(t('sidebar_sajra_map')) ?></a>
            <?php if (isAdminRole()): ?>
                <a class="<?= navActive('users.php', $currentPage) . navActive('user_form.php', $currentPage) ?>" href="users.php"><?= htmlspecialchars(t('sidebar_users')) ?></a>
            <?php endif; ?>
            <a class="<?= navActive('profile.php', $currentPage) ?>" href="profile.php"><?= htmlspecialchars(t('sidebar_profile')) ?></a>
            <a class="<?= navActive('change_password.php', $currentPage) ?>" href="change_password.php"><?= htmlspecialchars(t('sidebar_password')) ?></a>
        </nav>
        <div class="admin-sidebar-footer">
            <span class="lang-switch">
                <a href="<?= htmlspecialchars(langSwitchUrl('en')) ?>" class="<?= currentLang() === 'en' ? 'active' : '' ?>">EN</a>
                <a href="<?= htmlspecialchars(langSwitchUrl('ur')) ?>" class="<?= currentLang() === 'ur' ? 'active' : '' ?>">اردو</a>
            </span>
            <a href="../index.php" target="_blank"><?= t('sidebar_view_site') ?></a>
            <a href="logout.php" class="admin-logout"><?= htmlspecialchars(t('sidebar_logout')) ?></a>
        </div>
    </aside>

    <div class="admin-main">
        <header class="admin-topbar">
            <button class="admin-nav-toggle" aria-label="Menu" onclick="document.querySelector('.admin-sidebar').classList.toggle('open')">&#9776;</button>
            <h1 class="admin-page-title"><?= htmlspecialchars($pageTitle ?? 'Admin') ?></h1>
            <div class="admin-user-chip">
                <span class="role-badge role-<?= htmlspecialchars(currentRole() ?? 'editor') ?>"><?= htmlspecialchars(ucfirst(currentRole() ?? '')) ?></span>
                <span><?= htmlspecialchars($_SESSION['admin_name'] ?: $_SESSION['admin_username']) ?></span>
            </div>
        </header>
        <main class="admin-content">
            <?php if (($_GET['error'] ?? '') === 'forbidden'): ?>
                <p class="error"><?= htmlspecialchars(t('forbidden')) ?></p>
            <?php endif; ?>
