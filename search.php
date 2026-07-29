<?php
require_once __DIR__ . '/includes/functions.php';
require_once __DIR__ . '/includes/auth.php';
$pageTitle = t('nav_search');
$q = trim($_GET['q'] ?? '');
$results = [];

if ($q !== '') {
    $stmt = $pdo->prepare('SELECT * FROM members WHERE name LIKE ? OR name_ur LIKE ? ORDER BY name LIMIT 50');
    $stmt->execute(['%' . $q . '%', '%' . $q . '%']);
    $results = $stmt->fetchAll();
}

require __DIR__ . '/includes/header.php';
?>
<h1><?= htmlspecialchars(t('search_title')) ?></h1>
<form method="get" class="search-form">
    <input type="text" name="q" placeholder="<?= htmlspecialchars(t('search_placeholder')) ?>" value="<?= htmlspecialchars($q) ?>">
    <button type="submit" class="btn"><?= htmlspecialchars(t('search_btn')) ?></button>
</form>

<?php if ($q !== ''): ?>
    <p><?= htmlspecialchars(t('search_results', count($results), $q)) ?></p>
    <div class="member-grid">
        <?php foreach ($results as $m): ?>
            <a class="member-card" href="member.php?id=<?= (int) $m['id'] ?>">
                <img src="<?= htmlspecialchars(photoUrl($m['photo'])) ?>" alt="">
                <div><?= htmlspecialchars(displayName($m)) ?></div>
            </a>
        <?php endforeach; ?>
    </div>
<?php endif; ?>
<?php require __DIR__ . '/includes/footer.php'; ?>
