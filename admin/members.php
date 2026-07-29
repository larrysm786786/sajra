<?php
require_once __DIR__ . '/../includes/functions.php';
require_once __DIR__ . '/../includes/auth.php';
requireLogin();

$perPage = 10;
$search = trim($_GET['search'] ?? '');
$where = $search !== '' ? 'WHERE name LIKE :search' : '';

$countStmt = $pdo->prepare("SELECT COUNT(*) c FROM members $where");
if ($search !== '') $countStmt->bindValue(':search', '%' . $search . '%');
$countStmt->execute();
$totalMembers = (int) $countStmt->fetch()['c'];

$totalPages = max(1, (int) ceil($totalMembers / $perPage));
$page = min(max(1, (int) ($_GET['page'] ?? 1)), $totalPages);
$offset = ($page - 1) * $perPage;

$stmt = $pdo->prepare("SELECT * FROM members $where ORDER BY name LIMIT :limit OFFSET :offset");
if ($search !== '') $stmt->bindValue(':search', '%' . $search . '%');
$stmt->bindValue(':limit', $perPage, PDO::PARAM_INT);
$stmt->bindValue(':offset', $offset, PDO::PARAM_INT);
$stmt->execute();
$members = $stmt->fetchAll();

$queryTail = $search !== '' ? '&search=' . urlencode($search) : '';

$pageTitle = t('members_title');
require __DIR__ . '/includes/layout_top.php';
?>
<?php if (!empty($_GET['saved'])): ?>
    <p class="success"><?= htmlspecialchars(t('members_saved', $_GET['saved'])) ?></p>
<?php endif; ?>
<div class="admin-actions">
    <button type="button" class="btn" onclick="openMemberModal('member_form.php?modal=1')"><?= htmlspecialchars(t('members_new')) ?></button>
</div>

<form method="get" class="search-form">
    <input type="text" name="search" placeholder="<?= htmlspecialchars(t('members_search_placeholder')) ?>" value="<?= htmlspecialchars($search) ?>">
    <button type="submit" class="btn secondary"><?= htmlspecialchars(t('members_search_btn')) ?></button>
    <?php if ($search !== ''): ?><a class="btn secondary" href="members.php"><?= htmlspecialchars(t('members_clear')) ?></a><?php endif; ?>
</form>

<table class="admin-table">
    <thead>
        <tr><th><?= htmlspecialchars(t('members_th_photo')) ?></th><th><?= htmlspecialchars(t('members_th_name')) ?></th><th><?= htmlspecialchars(t('members_th_gender')) ?></th><th><?= htmlspecialchars(t('members_th_actions')) ?></th></tr>
    </thead>
    <tbody>
    <?php if (empty($members)): ?>
        <tr><td colspan="4"><?= htmlspecialchars(t('members_no_results')) ?></td></tr>
    <?php endif; ?>
    <?php foreach ($members as $m): ?>
        <tr>
            <td><img class="thumb" src="../<?= htmlspecialchars(photoUrl($m['photo'])) ?>" alt=""></td>
            <td>
                <?= htmlspecialchars($m['name']) ?>
                <?php if (!empty($m['name_ur'])): ?><br><span class="hint urdu-text" dir="rtl"><?= htmlspecialchars($m['name_ur']) ?></span><?php endif; ?>
            </td>
            <td><?= $m['gender'] === 'male' ? htmlspecialchars(t('member_male')) : htmlspecialchars(t('member_female')) ?></td>
            <td>
                <a href="#" onclick="openMemberModal('member_form.php?id=<?= (int) $m['id'] ?>&modal=1'); return false;"><?= htmlspecialchars(t('members_edit')) ?></a>
                &middot;
                <a href="member_delete.php?id=<?= (int) $m['id'] ?>" onclick="return confirm('<?= htmlspecialchars(t('members_delete_confirm'), ENT_QUOTES) ?>');"><?= htmlspecialchars(t('members_delete')) ?></a>
                &middot;
                <a href="../member.php?id=<?= (int) $m['id'] ?>" target="_blank"><?= htmlspecialchars(t('members_view')) ?></a>
            </td>
        </tr>
        <?php if ($search !== ''): ?>
            <?php foreach (getChildren($pdo, (int) $m['id']) as $child): ?>
                <tr class="child-row">
                    <td><img class="thumb" src="../<?= htmlspecialchars(photoUrl($child['photo'])) ?>" alt=""></td>
                    <td>
                        &ndash; <?= htmlspecialchars($child['name']) ?>
                        <?php if (!empty($child['name_ur'])): ?><br><span class="hint urdu-text" dir="rtl">&ndash; <?= htmlspecialchars($child['name_ur']) ?></span><?php endif; ?>
                    </td>
                    <td><?= $child['gender'] === 'male' ? htmlspecialchars(t('member_male')) : htmlspecialchars(t('member_female')) ?></td>
                    <td>
                        <a href="#" onclick="openMemberModal('member_form.php?id=<?= (int) $child['id'] ?>&modal=1'); return false;"><?= htmlspecialchars(t('members_edit')) ?></a>
                        &middot;
                        <a href="member_delete.php?id=<?= (int) $child['id'] ?>" onclick="return confirm('<?= htmlspecialchars(t('members_delete_confirm'), ENT_QUOTES) ?>');"><?= htmlspecialchars(t('members_delete')) ?></a>
                        &middot;
                        <a href="../member.php?id=<?= (int) $child['id'] ?>" target="_blank"><?= htmlspecialchars(t('members_view')) ?></a>
                    </td>
                </tr>
            <?php endforeach; ?>
        <?php endif; ?>
    <?php endforeach; ?>
    </tbody>
</table>

<?php if ($totalPages > 1): ?>
    <div class="pagination">
        <a href="?page=<?= max(1, $page - 1) ?><?= $queryTail ?>" class="<?= $page === 1 ? 'disabled' : '' ?>"><?= t('members_prev') ?></a>
        <?php for ($p = 1; $p <= $totalPages; $p++): ?>
            <a href="?page=<?= $p ?><?= $queryTail ?>" class="<?= $p === $page ? 'active' : '' ?>"><?= $p ?></a>
        <?php endfor; ?>
        <a href="?page=<?= min($totalPages, $page + 1) ?><?= $queryTail ?>" class="<?= $page === $totalPages ? 'disabled' : '' ?>"><?= t('members_next') ?></a>
    </div>
<?php endif; ?>
<?php if ($totalMembers > 0): ?>
    <p class="hint text-center"><?= htmlspecialchars(t('members_showing', $offset + 1, min($offset + $perPage, $totalMembers), $totalMembers)) ?></p>
<?php endif; ?>

<div id="memberModal" class="modal-overlay" onclick="if (event.target === this) closeMemberModal();">
    <div class="modal-box">
        <div class="modal-header">
            <button type="button" class="modal-close" onclick="closeMemberModal()" aria-label="Close">&times;</button>
        </div>
        <iframe id="memberModalFrame" src="about:blank"></iframe>
    </div>
</div>
<script>
    const memberModal = document.getElementById('memberModal');
    const memberModalFrame = document.getElementById('memberModalFrame');

    function openMemberModal(url) {
        memberModalFrame.src = url;
        memberModal.classList.add('open');
    }

    function closeMemberModal() {
        memberModal.classList.remove('open');
        memberModalFrame.src = 'about:blank';
    }

    memberModalFrame.addEventListener('load', function () {
        try {
            const path = this.contentWindow.location.pathname;
            if (path.endsWith('/admin/members.php')) {
                window.location.reload();
            }
        } catch (e) {
            // ignore cross-origin access issues
        }
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && memberModal.classList.contains('open')) closeMemberModal();
    });
</script>
<?php require __DIR__ . '/includes/layout_bottom.php'; ?>
