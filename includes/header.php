<?php require_once __DIR__ . '/auth.php'; ?>
<!DOCTYPE html>
<html lang="<?= currentLang() ?>" dir="<?= isRtl() ? 'rtl' : 'ltr' ?>">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title><?= isset($pageTitle) ? htmlspecialchars($pageTitle) . ' - ' : '' ?>Sajra | Family Tree</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600;700&family=Inter:wght@400;500;600;700&family=Noto+Nastaliq+Urdu:wght@400;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="<?= isset($inAdmin) ? '../' : '' ?>assets/css/style.css">
</head>
<body class="<?= isRtl() ? 'lang-ur' : 'lang-en' ?>">
<header class="site-header">
    <div class="container header-inner">
        <a href="<?= isset($inAdmin) ? '../' : '' ?>index.php" class="brand">
            <svg class="brand-mark" viewBox="0 0 24 24" width="26" height="26" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M12 2v20M12 6c-3 0-5 2-5 4.5S9 14 12 14s5-1.5 5-3.5S15 6 12 6ZM12 14c-3.5 0-6 2-6 4.5V20h12v-1.5c0-2.5-2.5-4.5-6-4.5Z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/>
            </svg>
            <span><?= htmlspecialchars(t('site_name')) ?></span>
        </a>
        <button class="nav-toggle" aria-label="Menu" onclick="document.querySelector('.site-header nav').classList.toggle('open')">&#9776;</button>
        <nav>
            <a href="<?= isset($inAdmin) ? '../' : '' ?>index.php"><?= htmlspecialchars(t('nav_home')) ?></a>
            <a href="<?= isset($inAdmin) ? '../' : '' ?>tree.php"><?= htmlspecialchars(t('nav_family_tree')) ?></a>
            <a href="<?= isset($inAdmin) ? '../' : '' ?>sajra-map.php"><?= htmlspecialchars(t('nav_sajra_map')) ?></a>
            <a href="<?= isset($inAdmin) ? '../' : '' ?>search.php"><?= htmlspecialchars(t('nav_search')) ?></a>
            <?php if (isLoggedIn()): ?>
                <a href="<?= isset($inAdmin) ? '' : 'admin/' ?>dashboard.php"><?= htmlspecialchars(t('nav_admin')) ?></a>
                <a class="nav-cta" href="<?= isset($inAdmin) ? '' : 'admin/' ?>logout.php"><?= htmlspecialchars(t('nav_logout')) ?></a>
            <?php else: ?>
                <a class="nav-cta" href="<?= isset($inAdmin) ? '' : 'admin/' ?>login.php"><?= htmlspecialchars(t('nav_admin_login')) ?></a>
            <?php endif; ?>
            <span class="lang-switch">
                <a href="<?= htmlspecialchars(langSwitchUrl('en')) ?>" class="<?= currentLang() === 'en' ? 'active' : '' ?>">EN</a>
                <a href="<?= htmlspecialchars(langSwitchUrl('ur')) ?>" class="<?= currentLang() === 'ur' ? 'active' : '' ?>">اردو</a>
            </span>
        </nav>
    </div>
</header>
<main class="container">
