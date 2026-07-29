<?php
require_once __DIR__ . '/../../includes/auth.php';
requireLogin();
?>
<!DOCTYPE html>
<html lang="<?= currentLang() ?>" dir="<?= isRtl() ? 'rtl' : 'ltr' ?>">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title><?= htmlspecialchars($pageTitle ?? 'Sajra') ?></title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600;700&family=Inter:wght@400;500;600;700&family=Noto+Nastaliq+Urdu:wght@400;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="../assets/css/style.css">
</head>
<body class="modal-body <?= isRtl() ? 'lang-ur' : 'lang-en' ?>">
<h1 class="modal-form-title"><?= htmlspecialchars($pageTitle ?? '') ?></h1>
