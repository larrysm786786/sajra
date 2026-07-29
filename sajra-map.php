<?php
require_once __DIR__ . '/includes/functions.php';
require_once __DIR__ . '/includes/auth.php';
$pageTitle = t('nav_sajra_map');
$images = $pdo->query('SELECT * FROM gallery_images ORDER BY uploaded_at DESC')->fetchAll();
require __DIR__ . '/includes/header.php';
?>
<span class="eyebrow"><?= htmlspecialchars(t('map_eyebrow')) ?></span>
<h1><?= htmlspecialchars(t('map_title')) ?></h1>
<p class="hint"><?= htmlspecialchars(t('map_hint')) ?></p>

<?php if (empty($images)): ?>
    <p><?= htmlspecialchars(t('map_no_photos')) ?> <a href="admin/login.php"><?= htmlspecialchars(t('map_login_to_upload')) ?></a></p>
<?php else: ?>
    <div class="gallery-grid">
        <?php foreach ($images as $i => $img): ?>
            <a class="gallery-item" href="#" data-index="<?= $i ?>" onclick="openLightbox(event, <?= $i ?>)">
                <img src="uploads/gallery/<?= htmlspecialchars($img['filename']) ?>" alt="<?= htmlspecialchars($img['caption'] ?? 'Sajra Map') ?>">
                <?php if ($img['caption']): ?><div class="gallery-caption"><?= htmlspecialchars($img['caption']) ?></div><?php endif; ?>
            </a>
        <?php endforeach; ?>
    </div>

    <div id="lightbox" class="lightbox">
        <button class="lightbox-close" onclick="closeLightbox()" aria-label="Close">&times;</button>
        <button class="lightbox-nav lightbox-prev" onclick="navLightbox(-1)" aria-label="Previous">&#10094;</button>

        <div id="lightboxImageWrap" class="lightbox-image-wrap">
            <img id="lightboxImg" src="" alt="">
        </div>

        <button class="lightbox-nav lightbox-next" onclick="navLightbox(1)" aria-label="Next">&#10095;</button>
        <div id="lightboxCaption" class="lightbox-caption"></div>

        <div class="lightbox-zoom-controls">
            <button type="button" onclick="zoomBy(-0.5)" aria-label="Zoom out">&minus;</button>
            <button type="button" onclick="resetZoom()" aria-label="Reset zoom"><span id="zoomLevel">100%</span></button>
            <button type="button" onclick="zoomBy(0.5)" aria-label="Zoom in">+</button>
        </div>
    </div>

    <script>
        const galleryImages = <?= json_encode(array_map(fn($img) => [
            'src' => 'uploads/gallery/' . $img['filename'],
            'caption' => $img['caption'] ?? '',
        ], $images)) ?>;
        let currentIndex = 0;
        let scale = 1, translateX = 0, translateY = 0;
        let isDragging = false, dragStartX = 0, dragStartY = 0;
        let pinchStartDist = 0, pinchStartScale = 1;
        let lastTouchX = 0, lastTouchY = 0;

        const lightbox = document.getElementById('lightbox');
        const wrapEl = document.getElementById('lightboxImageWrap');
        const imgEl = document.getElementById('lightboxImg');
        const zoomLevelEl = document.getElementById('zoomLevel');

        function openLightbox(event, index) {
            event.preventDefault();
            currentIndex = index;
            showLightboxImage();
            lightbox.classList.add('open');
        }

        function closeLightbox() {
            lightbox.classList.remove('open');
        }

        function navLightbox(direction) {
            currentIndex = (currentIndex + direction + galleryImages.length) % galleryImages.length;
            showLightboxImage();
        }

        function showLightboxImage() {
            const item = galleryImages[currentIndex];
            imgEl.src = item.src;
            document.getElementById('lightboxCaption').textContent = item.caption;
            resetZoom();
        }

        function applyTransform() {
            imgEl.style.transform = `translate(${translateX}px, ${translateY}px) scale(${scale})`;
            wrapEl.classList.toggle('zoomed', scale > 1);
            zoomLevelEl.textContent = Math.round(scale * 100) + '%';
        }

        function resetZoom() {
            scale = 1;
            translateX = 0;
            translateY = 0;
            applyTransform();
        }

        function zoomBy(delta) {
            scale = Math.min(5, Math.max(1, scale + delta));
            if (scale === 1) { translateX = 0; translateY = 0; }
            applyTransform();
        }

        wrapEl.addEventListener('wheel', (e) => {
            e.preventDefault();
            zoomBy(e.deltaY < 0 ? 0.35 : -0.35);
        }, { passive: false });

        imgEl.addEventListener('dblclick', () => {
            if (scale > 1) {
                resetZoom();
            } else {
                scale = 2.5;
                applyTransform();
            }
        });

        wrapEl.addEventListener('mousedown', (e) => {
            if (scale === 1) return;
            isDragging = true;
            dragStartX = e.clientX - translateX;
            dragStartY = e.clientY - translateY;
            wrapEl.classList.add('dragging');
        });
        window.addEventListener('mousemove', (e) => {
            if (!isDragging) return;
            translateX = e.clientX - dragStartX;
            translateY = e.clientY - dragStartY;
            applyTransform();
        });
        window.addEventListener('mouseup', () => {
            isDragging = false;
            wrapEl.classList.remove('dragging');
        });

        function touchDistance(touches) {
            const dx = touches[0].clientX - touches[1].clientX;
            const dy = touches[0].clientY - touches[1].clientY;
            return Math.sqrt(dx * dx + dy * dy);
        }

        wrapEl.addEventListener('touchstart', (e) => {
            if (e.touches.length === 2) {
                pinchStartDist = touchDistance(e.touches);
                pinchStartScale = scale;
            } else if (e.touches.length === 1 && scale > 1) {
                lastTouchX = e.touches[0].clientX - translateX;
                lastTouchY = e.touches[0].clientY - translateY;
            }
        });
        wrapEl.addEventListener('touchmove', (e) => {
            e.preventDefault();
            if (e.touches.length === 2) {
                const dist = touchDistance(e.touches);
                scale = Math.min(5, Math.max(1, pinchStartScale * (dist / pinchStartDist)));
                applyTransform();
            } else if (e.touches.length === 1 && scale > 1) {
                translateX = e.touches[0].clientX - lastTouchX;
                translateY = e.touches[0].clientY - lastTouchY;
                applyTransform();
            }
        }, { passive: false });

        document.addEventListener('keydown', (e) => {
            if (!lightbox.classList.contains('open')) return;
            if (e.key === 'Escape') closeLightbox();
            if (e.key === 'ArrowLeft') navLightbox(-1);
            if (e.key === 'ArrowRight') navLightbox(1);
            if (e.key === '+' || e.key === '=') zoomBy(0.5);
            if (e.key === '-' || e.key === '_') zoomBy(-0.5);
        });
    </script>
<?php endif; ?>
<?php require __DIR__ . '/includes/footer.php'; ?>
