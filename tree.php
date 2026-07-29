<?php
require_once __DIR__ . '/includes/functions.php';
require_once __DIR__ . '/includes/auth.php';
$pageTitle = t('nav_family_tree');
require __DIR__ . '/includes/header.php';
?>
<span class="eyebrow"><?= htmlspecialchars(t('tree_eyebrow')) ?></span>
<h1><?= htmlspecialchars(t('tree_title')) ?></h1>
<p class="hint"><?= htmlspecialchars(t('tree_hint')) ?></p>

<div class="view-toggle">
    <button type="button" class="view-toggle-btn active" data-orientation="horizontal"><?= t('tree_view_horizontal') ?></button>
    <button type="button" class="view-toggle-btn" data-orientation="vertical"><?= t('tree_view_vertical') ?></button>
    <button type="button" class="view-toggle-btn" data-orientation="boxes"><?= htmlspecialchars(t('tree_view_boxes')) ?></button>
</div>

<form id="findForm" class="tree-search">
    <input type="text" id="findMember" list="member-list" placeholder="<?= htmlspecialchars(t('tree_search_placeholder')) ?>" autocomplete="off">
    <datalist id="member-list"></datalist>
    <button type="submit" class="btn secondary"><?= htmlspecialchars(t('tree_search_btn')) ?></button>
</form>
<p id="findMsg" class="hint is-hidden"></p>

<div id="tree-container"></div>
<script>
    window.SAJRA_I18N = {
        noData: <?= json_encode(t('tree_no_data')) ?>,
        noMatch: <?= json_encode(t('tree_no_match')) ?>
    };
</script>
<script src="https://d3js.org/d3.v7.min.js"></script>
<script src="assets/js/tree.js"></script>
<?php require __DIR__ . '/includes/footer.php'; ?>
