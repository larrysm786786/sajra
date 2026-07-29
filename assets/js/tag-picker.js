function initTagPicker({ containerId, items, selectedIds, inputName, placeholder }) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const selected = new Set((selectedIds || []).map(String));

    const chipsEl = document.createElement('div');
    chipsEl.className = 'tag-chips';

    const searchEl = document.createElement('input');
    searchEl.type = 'text';
    searchEl.className = 'tag-search';
    searchEl.placeholder = placeholder || 'Type a name to search...';
    searchEl.autocomplete = 'off';

    const suggestionsEl = document.createElement('div');
    suggestionsEl.className = 'tag-suggestions';
    suggestionsEl.style.display = 'none';

    container.appendChild(chipsEl);
    container.appendChild(searchEl);
    container.appendChild(suggestionsEl);

    function renderChips() {
        chipsEl.innerHTML = '';
        selected.forEach((id) => {
            const item = items.find((i) => String(i.id) === id);
            if (!item) return;

            const chip = document.createElement('span');
            chip.className = 'tag-chip';

            const label = document.createElement('span');
            label.textContent = item.name;
            chip.appendChild(label);

            const hidden = document.createElement('input');
            hidden.type = 'hidden';
            hidden.name = inputName;
            hidden.value = item.id;
            chip.appendChild(hidden);

            const removeBtn = document.createElement('button');
            removeBtn.type = 'button';
            removeBtn.setAttribute('aria-label', 'Remove');
            removeBtn.textContent = '×';
            removeBtn.addEventListener('click', () => {
                selected.delete(id);
                renderChips();
            });
            chip.appendChild(removeBtn);

            chipsEl.appendChild(chip);
        });
    }

    function renderSuggestions(query) {
        const q = query.trim().toLowerCase();
        if (q === '') {
            suggestionsEl.style.display = 'none';
            suggestionsEl.innerHTML = '';
            return;
        }

        const matches = items.filter(
            (i) => !selected.has(String(i.id)) && i.name.toLowerCase().includes(q)
        );

        suggestionsEl.innerHTML = '';
        if (matches.length === 0) {
            suggestionsEl.style.display = 'none';
            return;
        }

        matches.slice(0, 8).forEach((item) => {
            const opt = document.createElement('div');
            opt.className = 'tag-suggestion';
            opt.textContent = item.name;
            opt.addEventListener('mousedown', (event) => {
                event.preventDefault();
                selected.add(String(item.id));
                searchEl.value = '';
                suggestionsEl.style.display = 'none';
                renderChips();
            });
            suggestionsEl.appendChild(opt);
        });
        suggestionsEl.style.display = 'block';
    }

    searchEl.addEventListener('input', () => renderSuggestions(searchEl.value));
    searchEl.addEventListener('focus', () => {
        if (searchEl.value) renderSuggestions(searchEl.value);
    });
    searchEl.addEventListener('blur', () => {
        setTimeout(() => { suggestionsEl.style.display = 'none'; }, 150);
    });

    renderChips();
}
