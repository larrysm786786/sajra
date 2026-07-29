<?php
require_once __DIR__ . '/../includes/functions.php';
header('Content-Type: application/json; charset=utf-8');

[$roots, $childrenByParent, $spousesById] = loadTreeLookups($pdo);
$visited = [];

if (empty($roots)) {
    echo json_encode(['name' => t('site_name'), 'children' => []], JSON_UNESCAPED_UNICODE);
    exit;
}

if (count($roots) === 1) {
    echo json_encode(buildTreeNodeFast($roots[0], $childrenByParent, $spousesById, $visited), JSON_UNESCAPED_UNICODE);
    exit;
}

$children = [];
foreach ($roots as $root) {
    $children[] = buildTreeNodeFast($root, $childrenByParent, $spousesById, $visited);
}

echo json_encode(['name' => t('site_name'), 'children' => $children], JSON_UNESCAPED_UNICODE);
