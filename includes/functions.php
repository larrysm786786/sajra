<?php
require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/auth.php';

function getMember(PDO $pdo, int $id): ?array
{
    $stmt = $pdo->prepare('SELECT * FROM members WHERE id = ?');
    $stmt->execute([$id]);
    $member = $stmt->fetch();
    return $member ?: null;
}

function getAllMembers(PDO $pdo): array
{
    return $pdo->query('SELECT * FROM members ORDER BY name')->fetchAll();
}

function getSpouses(PDO $pdo, int $memberId): array
{
    $stmt = $pdo->prepare(
        'SELECT m.* FROM spouses s
         JOIN members m ON m.id = s.spouse_id
         WHERE s.member_id = ?
         UNION
         SELECT m.* FROM spouses s
         JOIN members m ON m.id = s.member_id
         WHERE s.spouse_id = ?'
    );
    $stmt->execute([$memberId, $memberId]);
    return $stmt->fetchAll();
}

function getChildren(PDO $pdo, int $memberId): array
{
    $stmt = $pdo->prepare('SELECT * FROM members WHERE father_id = ? OR mother_id = ? ORDER BY dob');
    $stmt->execute([$memberId, $memberId]);
    return $stmt->fetchAll();
}

function getParents(PDO $pdo, array $member): array
{
    $parents = [];
    if (!empty($member['father_id'])) {
        $parents['father'] = getMember($pdo, (int) $member['father_id']);
    }
    if (!empty($member['mother_id'])) {
        $parents['mother'] = getMember($pdo, (int) $member['mother_id']);
    }
    return $parents;
}

/** Shows the Urdu name when the site is in Urdu mode and one is on record, else the primary name. */
function displayName(array $member): string
{
    if (isRtl() && !empty($member['name_ur'])) {
        return $member['name_ur'];
    }
    return $member['name'];
}

/** Age in years at death (dod set) or as of today (still living). Null if dob unknown. */
function calculateAge(?string $dob, ?string $dod = null): ?int
{
    if (!$dob) {
        return null;
    }
    try {
        $birth = new DateTime($dob);
        $end = $dod ? new DateTime($dod) : new DateTime();
        return $birth->diff($end)->y;
    } catch (Exception $e) {
        return null;
    }
}

function photoUrl(?string $photo): string
{
    if ($photo) {
        return 'uploads/photos/' . rawurlencode($photo);
    }
    return 'assets/img/placeholder.svg';
}

/**
 * Builds a nested tree node for D3 rendering.
 * A child is placed under its father; if it has no father on record,
 * it is placed under its mother instead (avoids duplicate branches).
 */
function buildTreeNode(PDO $pdo, array $member, array &$visited): array
{
    if (isset($visited[$member['id']])) {
        return ['name' => displayName($member), 'id' => $member['id'], 'circular' => true, 'children' => []];
    }
    $visited[$member['id']] = true;

    $stmt = $pdo->prepare(
        'SELECT * FROM members WHERE father_id = ? OR (father_id IS NULL AND mother_id = ?) ORDER BY dob'
    );
    $stmt->execute([$member['id'], $member['id']]);
    $childRows = $stmt->fetchAll();

    $children = [];
    foreach ($childRows as $child) {
        $children[] = buildTreeNode($pdo, $child, $visited);
    }

    $spouses = array_map(fn($s) => ['id' => $s['id'], 'name' => displayName($s)], getSpouses($pdo, (int) $member['id']));

    return [
        'id' => $member['id'],
        'name' => displayName($member),
        'gender' => $member['gender'],
        'photo' => photoUrl($member['photo']),
        'age' => calculateAge($member['dob'], $member['dod']),
        'location' => $member['birthplace'],
        'spouses' => $spouses,
        'children' => $children,
    ];
}

function getRootMembers(PDO $pdo): array
{
    return $pdo->query('SELECT * FROM members WHERE father_id IS NULL AND mother_id IS NULL ORDER BY name')->fetchAll();
}

/**
 * If $name already exists among members, appends the next free Roman numeral
 * (II, III, IV, ...) so genealogically-repeated names stay distinct instead
 * of being blocked or silently colliding.
 */
function assignUniqueName(PDO $pdo, string $name, ?int $excludeId = null): string
{
    $base = preg_replace('/\s+(II|III|IV|V|VI|VII|VIII|IX|X)$/', '', trim($name));
    $suffixes = ['', ' II', ' III', ' IV', ' V', ' VI', ' VII', ' VIII', ' IX', ' X'];

    foreach ($suffixes as $suffix) {
        $candidate = $base . $suffix;
        $sql = 'SELECT COUNT(*) c FROM members WHERE name = ?';
        $params = [$candidate];
        if ($excludeId !== null) {
            $sql .= ' AND id != ?';
            $params[] = $excludeId;
        }
        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);
        if ((int) $stmt->fetch()['c'] === 0) {
            return $candidate;
        }
    }

    return $base . ' ' . (count($suffixes) + 1);
}
