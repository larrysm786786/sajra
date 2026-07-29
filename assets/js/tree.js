(function () {
    const container = document.getElementById('tree-container');
    const width = container.clientWidth || 1000;
    const height = 700;

    const CARD_W_MIN = 110;
    const CARD_W_MAX = 190;
    const CARD_H = 132;
    const PHOTO_R = 26;
    const PHOTO_CY = -CARD_H / 2 + 12 + PHOTO_R;
    const NAME_Y = PHOTO_CY + PHOTO_R + 16;
    const DOB_Y = NAME_Y + 15;
    const ADDS_Y = DOB_Y + 13;
    const ROOT_COLOR = '#dc2626';
    const BRANCH_COLORS = [
        '#16a34a', '#2563eb', '#d97706', '#0f766e', '#7c3aed',
        '#a16207', '#ec4899', '#0891b2', '#65a30d', '#9333ea',
    ];

    const LAYOUTS = {
        horizontal: { dx: 40, dy: 180 },
        vertical: { dx: 110, dy: 90 },
        boxes: { dx: 220, dy: 190 },
    };
    let viewMode = 'horizontal';

    const svg = d3.select('#tree-container')
        .append('svg')
        .attr('width', '100%')
        .attr('height', height)
        .attr('viewBox', [0, 0, width, height]);

    const g = svg.append('g');

    const zoomBehavior = d3.zoom().scaleExtent([0.2, 2]).on('zoom', (event) => {
        g.attr('transform', event.transform);
    });
    svg.call(zoomBehavior);

    function initialTransform() {
        return viewMode === 'horizontal'
            ? d3.zoomIdentity.translate(80, height / 2)
            : d3.zoomIdentity.translate(width / 2, 60);
    }
    svg.call(zoomBehavior.transform, initialTransform());

    let root = null;
    let allNodes = [];
    let highlightedNodeId = null;
    let highlightedAncestorIds = new Set();

    fetch('api/tree_data.php')
        .then((res) => res.json())
        .then((data) => {
            root = d3.hierarchy(data);
            root.x0 = 0;
            root.y0 = 0;

            assignBranchColors(root);

            allNodes = root.descendants();
            allNodes.forEach((d, i) => {
                d.id = i;
                d._children = d.children;
            });

            setupSearch(allNodes);
            update(root);
        })
        .catch(() => {
            container.innerHTML = `<p>${(window.SAJRA_I18N && window.SAJRA_I18N.noData) || 'Could not load tree data.'}</p>`;
        });

    function assignBranchColors(node) {
        node.data._branchColor = ROOT_COLOR;
        (node.children || []).forEach((child, i) => {
            paintBranch(child, BRANCH_COLORS[i % BRANCH_COLORS.length]);
        });
    }

    function paintBranch(node, color) {
        node.data._branchColor = color;
        (node.children || []).forEach((child) => paintBranch(child, color));
    }

    function dobLineFor(d) {
        return (d.data.age !== null && d.data.age !== undefined) ? `DOB: ${d.data.age}` : '';
    }

    function addsLineFor(d) {
        return d.data.location ? `Adds: ${d.data.location}` : '';
    }

    function truncateToWidth(text, maxWidth, charWidth = 6.2) {
        const maxChars = Math.max(1, Math.floor((maxWidth - 16) / charWidth));
        if (text.length <= maxChars) return text;
        return text.slice(0, Math.max(1, maxChars - 1)) + '…';
    }

    function cardWidthFor(d) {
        const lines = [d.data.name || '', dobLineFor(d), addsLineFor(d)];
        const longest = Math.max(...lines.map((l) => l.length));
        const estimated = Math.ceil(longest * 6.2) + 24;
        return Math.min(CARD_W_MAX, Math.max(CARD_W_MIN, estimated));
    }

    function toScreen(x, y) {
        return viewMode === 'horizontal' ? [y, x] : [x, y];
    }

    function transformFor(x, y) {
        const [sx, sy] = toScreen(x, y);
        return `translate(${sx},${sy})`;
    }

    function elbowPath(d) {
        const [sx, sy] = toScreen(d.source.x, d.source.y);
        const [tx, ty] = toScreen(d.target.x, d.target.y);
        const syEdge = sy + CARD_H / 2;
        const tyEdge = ty - CARD_H / 2;
        const midY = (syEdge + tyEdge) / 2;
        return `M${sx},${syEdge}V${midY}H${tx}V${tyEdge}`;
    }

    function makeLinkGenerator() {
        if (viewMode === 'boxes') return elbowPath;
        const gen = viewMode === 'horizontal' ? d3.linkHorizontal() : d3.linkVertical();
        return gen.x((d) => toScreen(d.x, d.y)[0]).y((d) => toScreen(d.x, d.y)[1]);
    }

    function update(source) {
        const { dx, dy } = LAYOUTS[viewMode];
        d3.tree().nodeSize([dx, dy])(root);

        const nodes = root.descendants();
        const links = root.links();
        const linkGen = makeLinkGenerator();
        const isBoxes = viewMode === 'boxes';

        const node = g.selectAll('g.node').data(nodes, (d) => d.id);

        const nodeEnter = node.enter().append('g')
            .attr('class', 'node')
            .attr('transform', () => transformFor(source.x0 ?? 0, source.y0 ?? 0))
            .on('click', (event, d) => {
                d.children = d.children ? null : d._children;
                update(d);
            });

        if (isBoxes) {
            nodeEnter.append('rect')
                .attr('class', 'org-card')
                .attr('x', (d) => -cardWidthFor(d) / 2)
                .attr('y', -CARD_H / 2)
                .attr('width', (d) => cardWidthFor(d))
                .attr('height', CARD_H)
                .attr('rx', 14)
                .attr('fill', (d) => d.data._branchColor || '#334155');

            nodeEnter.append('circle')
                .attr('class', 'org-card-ring')
                .attr('cx', 0)
                .attr('cy', PHOTO_CY)
                .attr('r', PHOTO_R + 3)
                .attr('fill', '#ffffff');

            nodeEnter.append('clipPath')
                .attr('id', (d) => `photo-clip-${d.id}`)
                .append('circle')
                .attr('cx', 0)
                .attr('cy', PHOTO_CY)
                .attr('r', PHOTO_R);

            nodeEnter.append('image')
                .attr('class', 'org-card-photo')
                .attr('x', -PHOTO_R)
                .attr('y', PHOTO_CY - PHOTO_R)
                .attr('width', PHOTO_R * 2)
                .attr('height', PHOTO_R * 2)
                .attr('clip-path', (d) => `url(#photo-clip-${d.id})`)
                .attr('href', (d) => d.data.photo)
                .attr('xlink:href', (d) => d.data.photo);

            nodeEnter.append('text')
                .attr('class', 'org-card-name')
                .attr('text-anchor', 'middle')
                .attr('y', NAME_Y)
                .attr('dy', '0.32em')
                .text((d) => truncateToWidth(d.data.name || '', cardWidthFor(d)));

            nodeEnter.append('text')
                .attr('class', 'org-card-detail')
                .attr('text-anchor', 'middle')
                .attr('y', DOB_Y)
                .attr('dy', '0.32em')
                .text((d) => truncateToWidth(dobLineFor(d), cardWidthFor(d)));

            nodeEnter.append('text')
                .attr('class', 'org-card-detail')
                .attr('text-anchor', 'middle')
                .attr('y', ADDS_Y)
                .attr('dy', '0.32em')
                .text((d) => truncateToWidth(addsLineFor(d), cardWidthFor(d)));
        } else {
            nodeEnter.append('circle').attr('r', 6);

            nodeEnter.append('text')
                .attr('dy', '0.31em')
                .attr('x', (d) => (viewMode === 'horizontal' ? (d._children ? -10 : 10) : 0))
                .attr('y', (d) => (viewMode === 'vertical' ? (d._children ? -14 : 14) : 0))
                .attr('text-anchor', (d) => (viewMode === 'horizontal' ? (d._children ? 'end' : 'start') : 'middle'))
                .text((d) => d.data.name)
                .clone(true).lower()
                .attr('stroke', 'white')
                .attr('stroke-width', 3);
        }

        const nodeMerge = node.merge(nodeEnter);

        nodeMerge.transition().duration(400)
            .attr('transform', (d) => transformFor(d.x, d.y));

        if (isBoxes) {
            nodeMerge.select('rect.org-card')
                .classed('highlighted', (d) => d.id === highlightedNodeId);
        } else {
            nodeMerge.select('circle')
                .attr('class', (d) => 'gender-' + (d.data.gender || 'root'))
                .classed('highlighted', (d) => d.id === highlightedNodeId)
                .attr('r', (d) => (d.id === highlightedNodeId ? 9 : 6));
        }

        node.exit().transition().duration(400)
            .attr('transform', () => transformFor(source.x, source.y))
            .remove();

        const link = g.selectAll('path.link').data(links, (d) => d.target.id);

        const linkEnter = link.enter().append('path')
            .attr('class', 'link')
            .attr('d', () => {
                const o = { x: source.x0 ?? 0, y: source.y0 ?? 0 };
                return linkGen({ source: o, target: o });
            });

        link.merge(linkEnter)
            .attr('class', (d) => (highlightedAncestorIds.has(d.target.id) ? 'link highlighted-link' : 'link'))
            .transition().duration(400)
            .attr('d', linkGen);

        link.exit().remove();

        root.descendants().forEach((d) => {
            d.x0 = d.x;
            d.y0 = d.y;
        });
    }

    function setOrientation(mode) {
        if (mode === viewMode || !root) return;
        viewMode = mode;
        g.selectAll('*').remove();
        svg.call(zoomBehavior.transform, initialTransform());
        update(root);
    }

    document.querySelectorAll('.view-toggle-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.view-toggle-btn').forEach((b) => b.classList.remove('active'));
            btn.classList.add('active');
            setOrientation(btn.dataset.orientation);
        });
    });

    function setupSearch(nodes) {
        const datalist = document.getElementById('member-list');
        const seen = new Set();
        nodes.forEach((d) => {
            if (d.data.name && d.data.id !== undefined && !seen.has(d.data.name)) {
                seen.add(d.data.name);
                const opt = document.createElement('option');
                opt.value = d.data.name;
                datalist.appendChild(opt);
            }
        });

        const form = document.getElementById('findForm');
        const input = document.getElementById('findMember');
        const msg = document.getElementById('findMsg');

        form.addEventListener('submit', (event) => {
            event.preventDefault();
            findAndHighlight(input.value, nodes, msg);
        });
    }

    function findAndHighlight(query, nodes, msg) {
        const q = query.trim().toLowerCase();
        if (!q) return;

        const match = nodes.find((d) => d.data.name && d.data.name.toLowerCase() === q)
            || nodes.find((d) => d.data.name && d.data.name.toLowerCase().includes(q));

        if (!match) {
            msg.classList.remove('is-hidden');
            const noMatchTpl = (window.SAJRA_I18N && window.SAJRA_I18N.noMatch) || 'No member found with the name "%1$s".';
            msg.textContent = noMatchTpl.replace('%1$s', query);
            return;
        }
        msg.classList.add('is-hidden');

        const chain = [];
        let ancestor = match.parent;
        while (ancestor) {
            chain.push(ancestor);
            ancestor = ancestor.parent;
        }
        chain.forEach((a) => {
            if (a._children) a.children = a._children;
        });

        highlightedNodeId = match.id;
        highlightedAncestorIds = new Set([match.id, ...chain.map((a) => a.id)]);

        update(match);
        centerOnNode(match);
    }

    function centerOnNode(node) {
        const [sx, sy] = toScreen(node.x, node.y);
        const scale = 1;
        const x = width / 2 - sx * scale;
        const y = height / 2 - sy * scale;
        svg.transition().duration(600)
            .call(zoomBehavior.transform, d3.zoomIdentity.translate(x, y).scale(scale));
    }
})();
