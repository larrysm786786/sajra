<?php
require_once __DIR__ . '/../includes/functions.php';
require_once __DIR__ . '/../includes/auth.php';
requireLogin();

$id = (int) ($_GET['id'] ?? 0);
$member = $id ? getMember($pdo, $id) : null;
$currentSpouseIds = $id ? array_column(getSpouses($pdo, $id), 'id') : [];
$wasAlreadyRoot = $member && empty($member['father_id']);
$errors = [];

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $name = trim($_POST['name'] ?? '');
    $nameUr = trim($_POST['name_ur'] ?? '');
    $gender = $_POST['gender'] ?? '';
    $dob = ($_POST['dob'] ?? '') !== '' ? $_POST['dob'] : null;
    $dod = ($_POST['dod'] ?? '') !== '' ? $_POST['dod'] : null;
    $birthplace = trim($_POST['birthplace'] ?? '');
    $bio = trim($_POST['bio'] ?? '');
    $fatherId = ($_POST['father_id'] ?? '') !== '' ? (int) $_POST['father_id'] : null;
    $motherId = ($_POST['mother_id'] ?? '') !== '' ? (int) $_POST['mother_id'] : null;
    $spouseIds = array_map('intval', $_POST['spouse_ids'] ?? []);

    if ($name === '') $errors[] = t('mform_err_name');
    if (!in_array($gender, ['male', 'female'], true)) $errors[] = t('mform_err_gender');
    if (!$fatherId && !$wasAlreadyRoot) $errors[] = t('mform_err_father');
    if ($fatherId && $fatherId === $id) $errors[] = t('mform_err_self_father');
    if ($motherId && $motherId === $id) $errors[] = t('mform_err_self_mother');

    $photoName = $member['photo'] ?? null;
    if (!empty($_FILES['photo']['name'])) {
        $file = $_FILES['photo'];
        $allowed = ['jpg' => 'image/jpeg', 'jpeg' => 'image/jpeg', 'png' => 'image/png', 'webp' => 'image/webp'];
        $ext = strtolower(pathinfo($file['name'], PATHINFO_EXTENSION));

        if ($file['error'] !== UPLOAD_ERR_OK) {
            $errors[] = t('mform_err_upload');
        } elseif (!isset($allowed[$ext])) {
            $errors[] = t('mform_err_filetype');
        } elseif ($file['size'] > 3 * 1024 * 1024) {
            $errors[] = t('mform_err_filesize');
        } else {
            $finfo = finfo_open(FILEINFO_MIME_TYPE);
            $mime = finfo_file($finfo, $file['tmp_name']);
            finfo_close($finfo);
            if ($mime !== $allowed[$ext]) {
                $errors[] = t('mform_err_corrupt');
            } else {
                $newName = bin2hex(random_bytes(16)) . '.' . $ext;
                $dest = __DIR__ . '/../uploads/photos/' . $newName;
                if (move_uploaded_file($file['tmp_name'], $dest)) {
                    if ($photoName && file_exists(__DIR__ . '/../uploads/photos/' . $photoName)) {
                        unlink(__DIR__ . '/../uploads/photos/' . $photoName);
                    }
                    $photoName = $newName;
                } else {
                    $errors[] = t('mform_err_savefail');
                }
            }
        }
    }

    if (empty($errors)) {
        $name = assignUniqueName($pdo, $name, $id ?: null);

        if ($member) {
            $stmt = $pdo->prepare(
                'UPDATE members SET name=?, name_ur=?, gender=?, dob=?, dod=?, birthplace=?, bio=?, photo=?, father_id=?, mother_id=? WHERE id=?'
            );
            $stmt->execute([$name, $nameUr ?: null, $gender, $dob, $dod, $birthplace, $bio, $photoName, $fatherId, $motherId, $id]);
        } else {
            $stmt = $pdo->prepare(
                'INSERT INTO members (name, name_ur, gender, dob, dod, birthplace, bio, photo, father_id, mother_id) VALUES (?,?,?,?,?,?,?,?,?,?)'
            );
            $stmt->execute([$name, $nameUr ?: null, $gender, $dob, $dod, $birthplace, $bio, $photoName, $fatherId, $motherId]);
            $id = (int) $pdo->lastInsertId();
        }

        $pdo->prepare('DELETE FROM spouses WHERE member_id = ? OR spouse_id = ?')->execute([$id, $id]);
        $insertSpouse = $pdo->prepare('INSERT IGNORE INTO spouses (member_id, spouse_id) VALUES (?, ?)');
        foreach ($spouseIds as $sid) {
            if ($sid && $sid !== $id) {
                $insertSpouse->execute([$id, $sid]);
            }
        }

        header('Location: members.php?saved=' . urlencode($name));
        exit;
    }

    $member = [
        'id' => $id, 'name' => $name, 'name_ur' => $nameUr, 'gender' => $gender, 'dob' => $dob, 'dod' => $dod,
        'birthplace' => $birthplace, 'bio' => $bio, 'photo' => $photoName,
        'father_id' => $fatherId, 'mother_id' => $motherId,
    ];
    $currentSpouseIds = $spouseIds;
}

$pageTitle = $member ? t('mform_title_edit') : t('mform_title_new');
$allMembers = getAllMembers($pdo);
$fathers = array_filter($allMembers, fn($m) => $m['gender'] === 'male' && (int) $m['id'] !== $id);
$mothers = array_filter($allMembers, fn($m) => $m['gender'] === 'female' && (int) $m['id'] !== $id);
$others = array_filter($allMembers, fn($m) => (int) $m['id'] !== $id);

$isModal = isset($_GET['modal']);
require __DIR__ . ($isModal ? '/includes/modal_top.php' : '/includes/layout_top.php');
?>
<?php foreach ($errors as $e): ?><p class="error"><?= htmlspecialchars($e) ?></p><?php endforeach; ?>

<form method="post" enctype="multipart/form-data" class="form">
    <label><?= htmlspecialchars(t('mform_name')) ?>
        <input type="text" name="name" required value="<?= htmlspecialchars($member['name'] ?? '') ?>">
    </label>

    <label><?= htmlspecialchars(t('mform_name_ur')) ?> <span class="field-hint"><?= htmlspecialchars(t('mform_name_ur_hint')) ?></span>
        <input type="text" name="name_ur" dir="rtl" class="urdu-text" value="<?= htmlspecialchars($member['name_ur'] ?? '') ?>">
    </label>

    <label><?= htmlspecialchars(t('mform_gender')) ?>
        <select name="gender" required>
            <option value=""><?= htmlspecialchars(t('mform_gender_select')) ?></option>
            <option value="male" <?= ($member['gender'] ?? '') === 'male' ? 'selected' : '' ?>><?= htmlspecialchars(t('member_male')) ?></option>
            <option value="female" <?= ($member['gender'] ?? '') === 'female' ? 'selected' : '' ?>><?= htmlspecialchars(t('member_female')) ?></option>
        </select>
    </label>

    <label><?= htmlspecialchars(t('mform_dob')) ?>
        <input type="date" name="dob" value="<?= htmlspecialchars($member['dob'] ?? '') ?>">
    </label>

    <label><?= htmlspecialchars(t('mform_dod')) ?>
        <input type="date" name="dod" value="<?= htmlspecialchars($member['dod'] ?? '') ?>">
    </label>

    <label><?= htmlspecialchars(t('mform_place')) ?>
        <input type="text" name="birthplace" value="<?= htmlspecialchars($member['birthplace'] ?? '') ?>">
    </label>

    <label><?= htmlspecialchars(t('mform_bio')) ?>
        <textarea name="bio" rows="4"><?= htmlspecialchars($member['bio'] ?? '') ?></textarea>
    </label>

    <label><?= htmlspecialchars(t('mform_photo')) ?>
        <input type="file" name="photo" accept=".jpg,.jpeg,.png,.webp">
    </label>
    <?php if (!empty($member['photo'])): ?>
        <img class="thumb" src="../<?= htmlspecialchars(photoUrl($member['photo'])) ?>" alt="">
    <?php endif; ?>

    <label><?= htmlspecialchars(t('mform_father')) ?><?= $wasAlreadyRoot ? '' : '*' ?>
        <select name="father_id" <?= $wasAlreadyRoot ? '' : 'required' ?>>
            <option value="" <?= $wasAlreadyRoot ? '' : 'disabled' ?> <?= empty($member['father_id']) ? 'selected' : '' ?>><?= $wasAlreadyRoot ? htmlspecialchars(t('mform_father_root')) : htmlspecialchars(t('mform_father_select')) ?></option>
            <?php foreach ($fathers as $f): ?>
                <option value="<?= (int) $f['id'] ?>" <?= (int) ($member['father_id'] ?? 0) === (int) $f['id'] ? 'selected' : '' ?>>
                    <?= htmlspecialchars(displayName($f)) ?>
                </option>
            <?php endforeach; ?>
        </select>
    </label>

    <label><?= htmlspecialchars(t('mform_mother')) ?>
        <select name="mother_id">
            <option value=""><?= htmlspecialchars(t('mform_mother_none')) ?></option>
            <?php foreach ($mothers as $m2): ?>
                <option value="<?= (int) $m2['id'] ?>" <?= (int) ($member['mother_id'] ?? 0) === (int) $m2['id'] ? 'selected' : '' ?>>
                    <?= htmlspecialchars(displayName($m2)) ?>
                </option>
            <?php endforeach; ?>
        </select>
    </label>

    <label><?= htmlspecialchars(t('mform_spouses')) ?>
        <div class="tag-picker" id="spousePicker"></div>
    </label>

    <button type="submit" class="btn"><?= $member ? htmlspecialchars(t('mform_update_btn')) : htmlspecialchars(t('mform_add_btn')) ?></button>
    <a class="btn secondary" href="members.php"><?= htmlspecialchars(t('mform_cancel')) ?></a>
</form>
<script src="../assets/js/tag-picker.js"></script>
<script>
initTagPicker({
    containerId: 'spousePicker',
    items: <?= json_encode(array_map(fn($o) => ['id' => (int) $o['id'], 'name' => displayName($o)], array_values($others)), JSON_UNESCAPED_UNICODE) ?>,
    selectedIds: <?= json_encode(array_values($currentSpouseIds)) ?>,
    inputName: 'spouse_ids[]',
    placeholder: <?= json_encode(t('mform_spouse_placeholder')) ?>
});
</script>
<?php require __DIR__ . ($isModal ? '/includes/modal_bottom.php' : '/includes/layout_bottom.php'); ?>
