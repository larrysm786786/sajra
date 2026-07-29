<?php
if (session_status() === PHP_SESSION_NONE) {
    session_start();
}
require_once __DIR__ . '/i18n.php';

function isLoggedIn(): bool
{
    return !empty($_SESSION['admin_id']);
}

function requireLogin(): void
{
    if (!isLoggedIn()) {
        header('Location: login.php');
        exit;
    }
}

function currentRole(): ?string
{
    return $_SESSION['admin_role'] ?? null;
}

function isAdminRole(): bool
{
    return currentRole() === 'admin';
}

function requireAdminRole(): void
{
    requireLogin();
    if (!isAdminRole()) {
        header('Location: dashboard.php?error=forbidden');
        exit;
    }
}
