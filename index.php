<?php
require_once __DIR__ . '/includes/functions.php';
require_once __DIR__ . '/includes/auth.php';
$pageTitle = t('nav_home');
$roots = getRootMembers($pdo);
$totalMembers = (int) $pdo->query('SELECT COUNT(*) c FROM members')->fetch()['c'];
require __DIR__ . '/includes/header.php';
?>
<section class="hero">
    <span class="eyebrow"><?= htmlspecialchars(t('home_eyebrow')) ?></span>
    <h1><?= htmlspecialchars(t('home_title')) ?> <span class="accent"><?= htmlspecialchars(t('home_title_accent')) ?></span></h1>
    <p class="hero-sub"><?= htmlspecialchars(t('home_subtitle', $totalMembers)) ?></p>
    <a class="btn" href="tree.php"><?= htmlspecialchars(t('home_view_tree')) ?></a>
</section>

<section>
    <span class="eyebrow"><?= htmlspecialchars(t('home_lineage_eyebrow')) ?></span>
    <h2><?= htmlspecialchars(t('home_founding_ancestors')) ?></h2>
    <?php if (empty($roots)): ?>
        <p><?= htmlspecialchars(t('home_no_members')) ?> <a href="admin/login.php"><?= htmlspecialchars(t('home_login_to_start')) ?></a></p>
    <?php else: ?>
        <div class="member-grid">
            <?php foreach ($roots as $m): ?>
                <a class="member-card" href="member.php?id=<?= (int) $m['id'] ?>">
                    <img src="<?= htmlspecialchars(photoUrl($m['photo'])) ?>" alt="">
                    <div><?= htmlspecialchars(displayName($m)) ?></div>
                </a>
            <?php endforeach; ?>
        </div>
    <?php endif; ?>
</section>
<?php require __DIR__ . '/includes/footer.php'; ?>
