<?php
require_once __DIR__ . '/includes/functions.php';
require_once __DIR__ . '/includes/auth.php';

$id = (int) ($_GET['id'] ?? 0);
$member = $id ? getMember($pdo, $id) : null;

if (!$member) {
    $pageTitle = t('member_not_found');
    require __DIR__ . '/includes/header.php';
    echo '<p>' . htmlspecialchars(t('member_not_found')) . '</p>';
    require __DIR__ . '/includes/footer.php';
    exit;
}

$pageTitle = displayName($member);
$parents = getParents($pdo, $member);
$spouses = getSpouses($pdo, $id);
$children = getChildren($pdo, $id);

require __DIR__ . '/includes/header.php';
?>
<div class="profile">
    <img class="profile-photo" src="<?= htmlspecialchars(photoUrl($member['photo'])) ?>" alt="">
    <div>
        <h1><?= htmlspecialchars(displayName($member)) ?></h1>
        <p>
            <?= $member['gender'] === 'male' ? htmlspecialchars(t('member_male')) : htmlspecialchars(t('member_female')) ?>
            <?php if ($member['dob']): ?> &middot; <?= htmlspecialchars(t('member_born')) ?>: <?= htmlspecialchars($member['dob']) ?><?php endif; ?>
            <?php if ($member['dod']): ?> &middot; <?= htmlspecialchars(t('member_died')) ?>: <?= htmlspecialchars($member['dod']) ?><?php endif; ?>
        </p>
        <?php if ($member['birthplace']): ?><p><?= htmlspecialchars(t('member_place')) ?>: <?= htmlspecialchars($member['birthplace']) ?></p><?php endif; ?>
        <?php if ($member['bio']): ?><p><?= nl2br(htmlspecialchars($member['bio'])) ?></p><?php endif; ?>
    </div>
</div>

<?php if ($parents): ?>
<section>
    <h2><?= htmlspecialchars(t('member_parents')) ?></h2>
    <div class="member-grid">
        <?php foreach ($parents as $p): if (!$p) continue; ?>
            <a class="member-card" href="member.php?id=<?= (int) $p['id'] ?>">
                <img src="<?= htmlspecialchars(photoUrl($p['photo'])) ?>" alt="">
                <div><?= htmlspecialchars(displayName($p)) ?></div>
            </a>
        <?php endforeach; ?>
    </div>
</section>
<?php endif; ?>

<?php if ($spouses): ?>
<section>
    <h2><?= htmlspecialchars(t('member_spouses')) ?></h2>
    <div class="member-grid">
        <?php foreach ($spouses as $s): ?>
            <a class="member-card" href="member.php?id=<?= (int) $s['id'] ?>">
                <img src="<?= htmlspecialchars(photoUrl($s['photo'])) ?>" alt="">
                <div><?= htmlspecialchars(displayName($s)) ?></div>
            </a>
        <?php endforeach; ?>
    </div>
</section>
<?php endif; ?>

<?php if ($children): ?>
<section>
    <h2><?= htmlspecialchars(t('member_children')) ?></h2>
    <div class="member-grid">
        <?php foreach ($children as $c): ?>
            <a class="member-card" href="member.php?id=<?= (int) $c['id'] ?>">
                <img src="<?= htmlspecialchars(photoUrl($c['photo'])) ?>" alt="">
                <div><?= htmlspecialchars(displayName($c)) ?></div>
            </a>
        <?php endforeach; ?>
    </div>
</section>
<?php endif; ?>

<?php require __DIR__ . '/includes/footer.php'; ?>
