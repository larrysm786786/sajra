<?php
function currentLang(): string
{
    return $_SESSION['lang'] ?? 'en';
}

function isRtl(): bool
{
    return currentLang() === 'ur';
}

function switchLanguageIfRequested(): void
{
    if (isset($_GET['lang']) && in_array($_GET['lang'], ['en', 'ur'], true)) {
        $_SESSION['lang'] = $_GET['lang'];
        $path = strtok($_SERVER['REQUEST_URI'], '?');
        $params = $_GET;
        unset($params['lang']);
        $qs = http_build_query($params);
        header('Location: ' . $path . ($qs !== '' ? '?' . $qs : ''));
        exit;
    }
}
switchLanguageIfRequested();

$GLOBALS['__i18n'] = require __DIR__ . '/lang/' . currentLang() . '.php';

function t(string $key, ...$args): string
{
    $str = $GLOBALS['__i18n'][$key] ?? $key;
    return $args ? vsprintf($str, $args) : $str;
}

/** Builds a language-switch URL that preserves the current query string. */
function langSwitchUrl(string $lang): string
{
    $params = $_GET;
    $params['lang'] = $lang;
    return '?' . http_build_query($params);
}
