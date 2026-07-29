<?php
require_once __DIR__ . '/../includes/functions.php';
require_once __DIR__ . '/../includes/auth.php';

if (isLoggedIn()) {
    header('Location: dashboard.php');
    exit;
}

$error = '';

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $username = trim($_POST['username'] ?? '');
    $password = $_POST['password'] ?? '';

    $stmt = $pdo->prepare('SELECT * FROM users WHERE username = ?');
    $stmt->execute([$username]);
    $user = $stmt->fetch();

    if ($user && password_verify($password, $user['password'])) {
        session_regenerate_id(true);
        $_SESSION['admin_id'] = $user['id'];
        $_SESSION['admin_username'] = $user['username'];
        $_SESSION['admin_name'] = $user['name'];
        $_SESSION['admin_role'] = $user['role'];
        header('Location: dashboard.php');
        exit;
    }
    $error = t('login_error');
}
?>
<!DOCTYPE html>
<html lang="<?= currentLang() ?>" dir="<?= isRtl() ? 'rtl' : 'ltr' ?>">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Admin Login - Sajra</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600;700&family=Inter:wght@400;500;600;700&family=Noto+Nastaliq+Urdu:wght@400;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="../assets/css/style.css">
</head>
<body class="login-body <?= isRtl() ? 'lang-ur' : 'lang-en' ?>">
<div class="login-shell">
    <div class="login-card">
        <div class="login-brand">
            <svg class="brand-mark" viewBox="0 0 24 24" width="30" height="30" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M12 2v20M12 6c-3 0-5 2-5 4.5S9 14 12 14s5-1.5 5-3.5S15 6 12 6ZM12 14c-3.5 0-6 2-6 4.5V20h12v-1.5c0-2.5-2.5-4.5-6-4.5Z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/>
            </svg>
            <span><?= htmlspecialchars(t('site_name')) ?></span>
        </div>
        <p class="login-sub"><?= htmlspecialchars(t('login_subtitle')) ?></p>
        <?php if ($error): ?><p class="error"><?= htmlspecialchars($error) ?></p><?php endif; ?>
        <form method="post" class="form login-form">
            <label><?= htmlspecialchars(t('login_username')) ?><input type="text" name="username" required autofocus></label>
            <label><?= htmlspecialchars(t('login_password')) ?><input type="password" name="password" required></label>
            <button type="submit" class="btn login-btn"><?= htmlspecialchars(t('login_btn')) ?></button>
        </form>
        <a class="login-back" href="../index.php"><?= t('login_back') ?></a>
        <div class="lang-switch login-lang-switch">
            <a href="<?= htmlspecialchars(langSwitchUrl('en')) ?>" class="<?= currentLang() === 'en' ? 'active' : '' ?>">EN</a>
            <a href="<?= htmlspecialchars(langSwitchUrl('ur')) ?>" class="<?= currentLang() === 'ur' ? 'active' : '' ?>">اردو</a>
        </div>
    </div>
</div>
</body>
</html>
