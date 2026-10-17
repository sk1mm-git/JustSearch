// ===== КОНФИГУРАЦИЯ =====
const SOURCES = {
    actions: 'https://raw.githubusercontent.com/realDosed/justmc-assets/refs/heads/master/data/actions.json',
    events: 'https://raw.githubusercontent.com/realDosed/justmc-assets/refs/heads/master/data/events.json',
    values: 'https://raw.githubusercontent.com/realDosed/justmc-assets/refs/heads/master/data/game_values.json'
};

const PROXY_BASE = 'http://localhost:3000/proxy?url=';
const LOCALE_URL_RAW = 'https://gitlab.com/justmc/justmc-localization/-/raw/master/creative_plus/ru_RU.properties?ref_type=heads';
const LOCALE_URL = PROXY_BASE + encodeURIComponent(LOCALE_URL_RAW);

// ===== ИКОНКИ =====
const ICON_BASE = {
    actions: 'https://raw.githubusercontent.com/realDosed/justmc-assets/master/icons/actions/',
    events: 'https://raw.githubusercontent.com/realDosed/justmc-assets/master/icons/events/',
    values: 'https://raw.githubusercontent.com/realDosed/justmc-assets/master/icons/game_values/'
};

function getIconCandidates(id) {
    if (!id) return [];
    const clean = String(id).trim();
    const parts = clean.split('.').filter(Boolean);
    const last = parts[parts.length - 1] || clean;

    const names = new Set();
    names.add(last);
    names.add(last.replace(/_/g, '-'));
    names.add(clean);
    names.add(clean.replace(/\./g, '_'));

    return Array.from(names).filter(Boolean);
}

window.__iconFallback = function (img) {
    const candidates = (img.dataset.candidates || '').split('|').filter(Boolean);
    const current = img.dataset.currentName || '';
    const idx = candidates.indexOf(current);

    if (idx >= 0 && idx < candidates.length - 1) {
        const nextName = candidates[idx + 1];
        img.dataset.currentName = nextName;
        img.src = img.dataset.base + nextName;
        return;
    }

    const wrap = img.closest('.item-icon-wrap') || img.closest('.modal-icon-wrap');
    if (wrap) {
        wrap.classList.add('no-icon');
        const letter = (img.alt || img.dataset.letter || '?').charAt(0).toUpperCase();
        if (wrap.classList.contains('modal-icon-wrap')) {
            const letterEl = document.getElementById('modalIconLetter');
            if (letterEl) {
                letterEl.textContent = letter;
                letterEl.classList.remove('hidden');
            }
            img.classList.add('hidden');
        } else {
            wrap.dataset.letter = letter;
            img.remove();
        }
    }
};

// ===== ЗВУКИ =====
const Sound = (() => {
    let ctx = null;
    let enabled = true;

    function ensureCtx() {
        if (!ctx) {
            try { ctx = new (window.AudioContext || window.webkitAudioContext)(); }
            catch { enabled = false; }
        }
        if (ctx && ctx.state === 'suspended') ctx.resume();
        return ctx;
    }

    function tone(freq, duration, type = 'sine', gainValue = 0.06) {
        if (!enabled) return;
        const c = ensureCtx();
        if (!c) return;
        const osc = c.createOscillator();
        const gain = c.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, c.currentTime);
        gain.gain.setValueAtTime(0, c.currentTime);
        gain.gain.linearRampToValueAtTime(gainValue, c.currentTime + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + duration);
        osc.connect(gain);
        gain.connect(c.destination);
        osc.start();
        osc.stop(c.currentTime + duration);
    }

    return {
        click() { tone(660, 0.08, 'triangle', 0.05); },
        hover() { tone(880, 0.05, 'sine', 0.02); },
        open() { tone(520, 0.08, 'sine', 0.05); setTimeout(() => tone(780, 0.1, 'sine', 0.05), 60); },
        back() { tone(600, 0.08, 'sine', 0.05); setTimeout(() => tone(420, 0.1, 'sine', 0.05), 60); },
        success() { [523, 659, 784].forEach((f, i) => setTimeout(() => tone(f, 0.15, 'sine', 0.05), i * 80)); },
        error() { tone(180, 0.3, 'sawtooth', 0.05); },
        type() { tone(1200, 0.03, 'square', 0.015); },
        toggle() { enabled = !enabled; return enabled; }
    };
})();

// ===== СОСТОЯНИЕ =====
let state = {
    currentTab: 'actions',
    data: { actions: [], events: [], values: [] },
    categories: { actions: {}, events: {}, values: {} },
    locale: {},
    localeKeys: [],
    activeCategory: null,
    activeSubcategory: null,
    searchQuery: ''
};

let els = {};

function initEls() {
    els = {
        tabs: document.querySelectorAll('.tab-btn'),
        search: document.getElementById('searchInput'),
        loading: document.getElementById('loadingState'),
        error: document.getElementById('errorState'),
        categoriesSection: document.getElementById('categoriesSection'),
        subcategoriesSection: document.getElementById('subcategoriesSection'),
        itemsSection: document.getElementById('itemsSection'),
        categoriesView: document.getElementById('categoriesView'),
        subcategoriesView: document.getElementById('subcategoriesView'),
        itemsList: document.getElementById('itemsList'),
        itemsTitle: document.getElementById('itemsTitle'),
        itemsSubtitle: document.getElementById('itemsSubtitle'),
        subcategoriesTitle: document.getElementById('subcategoriesTitle'),
        itemsCount: document.getElementById('itemsCount'),
        backBtn: document.getElementById('backBtn'),
        statusActions: document.getElementById('statusActions'),
        statusEvents: document.getElementById('statusEvents'),
        statusValues: document.getElementById('statusValues'),
        breadcrumbs: document.getElementById('breadcrumbs'),
        soundToggle: document.getElementById('soundToggle'),
        scrollTop: document.getElementById('scrollTop'),
        bgParallax: document.getElementById('bgParallax'),
        modalOverlay: document.getElementById('modalOverlay'),
        modal: document.getElementById('modal'),
        modalClose: document.getElementById('modalClose'),
        modalIconWrap: document.getElementById('modalIconWrap'),
        modalIcon: document.getElementById('modalIcon'),
        modalIconLetter: document.getElementById('modalIconLetter'),
        modalTitle: document.getElementById('modalTitle'),
        modalId: document.getElementById('modalId'),
        modalInfo: document.getElementById('modalInfo'),
        modalLocale: document.getElementById('modalLocale'),
        modalJson: document.getElementById('modalJson'),
        modalTabs: document.querySelectorAll('.modal-tab')
    };
}

// ===== УТИЛИТЫ =====
function setStatus(el, status) {
    if (!el) return;
    const dot = el.querySelector('.status-dot');
    if (dot) dot.className = 'status-dot ' + status;
}

function parseProperties(text) {
    const result = {};
    const lines = text.split(/\r?\n/);
    for (let line of lines) {
        line = line.trim();
        if (!line || line.startsWith('#') || line.startsWith('!')) continue;
        const match = line.match(/^([^=:]+)[=:](.*)$/);
        if (match) {
            const key = match[1].trim();
            let value = match[2].trim();
            value = value.replace(/\\:/g, ':').replace(/\\=/g, '=')
                .replace(/\\ /g, ' ').replace(/\\n/g, '\n').replace(/\\t/g, '\t');
            result[key] = value;
        }
    }
    return result;
}

function normalizeName(raw) {
    if (!raw) return 'Без названия';
    return raw.replace(/^action_/i, '').replace(/^event_/i, '')
        .replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function extractId(obj, index) {
    return obj.id || obj.name || obj.key || obj.identifier || `item_${index}`;
}

function extractRawName(obj, id) {
    if (obj.displayName) return obj.displayName;
    if (obj.name && obj.name !== id) return obj.name;
    if (obj.title) return obj.title;
    if (obj.ru) return obj.ru;
    return id;
}

function isEmptyStub(item, id) {
    if (!id) return false;
    const lower = String(id).toLowerCase().trim();
    if (lower === 'empty') return true;
    if (lower.endsWith('.empty') || lower.endsWith('_empty')) return true;
    if (/(^|[._])empty([._]|$)/.test(lower)) return true;
    if (item && typeof item.name === 'string' && item.name.toLowerCase().trim() === 'empty') return true;
    return false;
}

// ===== ПЕРЕВОД БЛОКОВ =====
function translateBlockName(obj, id) {
    if (!id) return normalizeName(extractRawName(obj, id));

    const candidates = [];
    candidates.push(id + '.name');
    const rawName = obj.name || obj.key || obj.displayName;
    if (rawName && rawName !== id) candidates.push(rawName + '.name');
    candidates.push(id);
    candidates.push(id.replace(/\./g, '_') + '.name');
    candidates.push(id.replace(/\./g, '_'));

    const lastPart = id.split('.').pop();
    if (lastPart && lastPart !== id) {
        candidates.push(lastPart + '.name');
        candidates.push(lastPart);
    }

    const parts = id.split('.').filter(Boolean);
    for (let i = 1; i < parts.length; i++) {
        const tail = parts.slice(i).join('.');
        candidates.push(tail + '.name');
        candidates.push(tail);
    }

    for (const key of candidates) {
        if (state.locale[key]) return state.locale[key];
        const lower = key.toLowerCase();
        if (state.locale[lower]) return state.locale[lower];
    }

    if (state.localeKeys.length) {
        for (const key of state.localeKeys) {
            const k = key.toLowerCase();
            for (const cand of candidates) {
                const c = cand.toLowerCase();
                if (k.endsWith('.' + c) || k === c) return state.locale[key];
            }
        }
    }

    return normalizeName(extractRawName(obj, id));
}

function translateGroupName(name, kind) {
    if (!name) return name;
    const raw = String(name);

    const variants = [
        `${kind}.${raw}.name`,
        `${kind}.${raw.toLowerCase()}.name`,
        `${kind}.${raw}.name`.replace(/\s+/g, '_'),
        `${kind}.${raw.toLowerCase()}.name`.replace(/\s+/g, '_')
    ];

    for (const key of variants) {
        if (state.locale[key]) return state.locale[key];
    }

    if (state.localeKeys.length) {
        const prefix = kind.toLowerCase() + '.';
        const suffix = '.name';
        const target1 = raw.toLowerCase();
        const target2 = target1.replace(/\s+/g, '_');
        for (const key of state.localeKeys) {
            const k = key.toLowerCase();
            if (!k.startsWith(prefix) || !k.endsWith(suffix)) continue;
            const middle = k.slice(prefix.length, -suffix.length);
            if (middle === target1 || middle === target2) return state.locale[key];
        }
    }
    return raw;
}

// ===== ЦВЕТ / КАТЕГОРИИ =====
function getEntityTypeColor(obj, id) {
    const combined = (id + ' ' + (obj.name || '') + ' ' + (obj.description || '')).toLowerCase();
    if (combined.includes('world') || combined.includes('мир') || combined.includes('block_')) return 'entity-world';
    if (combined.includes('player') || combined.includes('игрок') || combined.includes('chat')) return 'entity-player';
    if (combined.includes('entity') || combined.includes('сущност') || combined.includes('mob')) return 'entity-entity';
    return 'entity-default';
}

function getMainCategory(obj, id, rawName) {
    if (obj.category) return String(obj.category);
    if (obj.group) return String(obj.group);
    if (obj.type) return String(obj.type);

    const lower = (id + ' ' + rawName).toLowerCase();
    if (lower.includes('player') || lower.includes('игрок')) return 'Игрок';
    if (lower.includes('world') || lower.includes('мир') || lower.includes('game')) return 'Мир';
    if (lower.includes('entity') || lower.includes('сущност')) return 'Сущности';
    return 'Разное';
}

function getSubcategory(obj) {
    if (obj.subcategory === null || obj.subcategory === undefined) return null;
    const s = String(obj.subcategory).trim();
    return s || null;
}

// ===== ЗАГРУЗКА =====
async function loadLocale() {
    try {
        const resp = await fetch(LOCALE_URL);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const text = await resp.text();
        if (text.includes('<html') || text.includes('<!DOCTYPE')) throw new Error('HTML вместо properties');
        state.locale = parseProperties(text);
        state.localeKeys = Object.keys(state.locale);
        console.log(`✅ Локаль загружена, ключей: ${state.localeKeys.length}`);
    } catch (err) {
        console.warn(`⚠️ Локаль не загружена: ${err.message}`);
    }
}

async function loadAll() {
    if (!els.loading) return;
    els.loading.classList.remove('hidden');
    if (els.error) els.error.classList.add('hidden');
    [els.categoriesSection, els.subcategoriesSection, els.itemsSection].forEach(v => v && v.classList.add('hidden'));

    try {
        const localePromise = loadLocale();
        const dataPromises = Object.entries(SOURCES).map(async ([key, url]) => {
            const resp = await fetch(url);
            if (!resp.ok) throw new Error(`HTTP ${resp.status} для ${key}`);
            const json = await resp.json();
            let arr = Array.isArray(json) ? json : (json.data || json.items || Object.entries(json).map(([id, val]) => ({ id, ...val })));
            return [key, arr];
        });

        const [dataResults] = await Promise.all([Promise.all(dataPromises), localePromise]);

        dataResults.forEach(([key, arr]) => {
            const cleaned = arr.filter((item, idx) => !isEmptyStub(item, extractId(item, idx)));
            state.data[key] = cleaned;

            const catsRaw = {};
            cleaned.forEach((item, idx) => {
                const id = extractId(item, idx);
                const rawName = extractRawName(item, id);
                const name = translateBlockName(item, id);
                const mainRaw = getMainCategory(item, id, rawName);
                const subRaw = getSubcategory(item);

                const iconBase = ICON_BASE[key] || '';
                const iconNames = getIconCandidates(id);
                const _iconCandidates = iconNames.map(n => encodeURIComponent(n) + '.png');

                const entry = {
                    ...item,
                    _id: id,
                    _name: name,
                    _rawName: rawName,
                    _entityColor: getEntityTypeColor(item, id),
                    _iconBase: iconBase,
                    _iconCandidates
                };

                if (!catsRaw[mainRaw]) catsRaw[mainRaw] = { hasSubs: false, subcats: {}, flat: [] };
                if (subRaw !== null) {
                    catsRaw[mainRaw].hasSubs = true;
                    if (!catsRaw[mainRaw].subcats[subRaw]) catsRaw[mainRaw].subcats[subRaw] = [];
                    catsRaw[mainRaw].subcats[subRaw].push(entry);
                } else {
                    catsRaw[mainRaw].flat.push(entry);
                }
            });

            Object.values(catsRaw).forEach(c => {
                if (c.hasSubs && c.flat.length) {
                    if (!c.subcats['Без подкатегории']) c.subcats['Без подкатегории'] = [];
                    c.subcats['Без подкатегории'].push(...c.flat);
                    c.flat = [];
                }
            });

            const cats = {};
            Object.entries(catsRaw).forEach(([mainRaw, c]) => {
                const mainDisplay = translateGroupName(mainRaw, 'category');
                if (!cats[mainDisplay]) cats[mainDisplay] = { hasSubs: false, subcats: {}, flat: c.flat };
                cats[mainDisplay].hasSubs = cats[mainDisplay].hasSubs || c.hasSubs;
                Object.entries(c.subcats).forEach(([subRaw, items]) => {
                    const subDisplay = translateGroupName(subRaw, 'subcategory');
                    if (!cats[mainDisplay].subcats[subDisplay]) cats[mainDisplay].subcats[subDisplay] = [];
                    cats[mainDisplay].subcats[subDisplay].push(...items);
                });
            });

            state.categories[key] = cats;
            const statusEl = key === 'actions' ? els.statusActions : key === 'events' ? els.statusEvents : els.statusValues;
            setStatus(statusEl, 'ok');
        });

        els.loading.classList.add('hidden');
        Sound.success();
        renderCategories();
    } catch (err) {
        console.error(err);
        if (els.loading) els.loading.classList.add('hidden');
        if (els.error) {
            els.error.classList.remove('hidden');
            els.error.textContent = `❌ Ошибка загрузки: ${err.message}. Проверь, запущен ли прокси.`;
        }
        setStatus(els.statusActions, 'err');
        setStatus(els.statusEvents, 'err');
        setStatus(els.statusValues, 'err');
        Sound.error();
    }
}

// ===== НАВИГАЦИЯ =====
function showLevel(level) {
    [els.categoriesSection, els.subcategoriesSection, els.itemsSection].forEach(v => v && v.classList.add('hidden'));
    if (level === 'categories' && els.categoriesSection) els.categoriesSection.classList.remove('hidden');
    if (level === 'subcategories' && els.subcategoriesSection) els.subcategoriesSection.classList.remove('hidden');
    if (level === 'items' && els.itemsSection) els.itemsSection.classList.remove('hidden');
}

function updateBreadcrumbs(level, cat, subcat) {
    if (!els.breadcrumbs) return;

    if (!level) {
        els.breadcrumbs.classList.add('hidden');
        els.breadcrumbs.innerHTML = '';
        if (els.backBtn) els.backBtn.classList.add('hidden');
        return;
    }

    els.breadcrumbs.classList.remove('hidden');
    if (els.backBtn) els.backBtn.classList.remove('hidden');

    if (level === 1) {
        els.breadcrumbs.innerHTML = `
            <span class="crumb-link" data-crumb="root">Все категории</span>
            <span class="crumb-sep">›</span>
            <span class="crumb-current">${escapeHtml(cat)}</span>
        `;
    } else if (level === 2) {
        els.breadcrumbs.innerHTML = `
            <span class="crumb-link" data-crumb="root">Все категории</span>
            <span class="crumb-sep">›</span>
            <span class="crumb-link" data-crumb="cat">${escapeHtml(cat)}</span>
            <span class="crumb-sep">›</span>
            <span class="crumb-current">${escapeHtml(subcat)}</span>
        `;
    }

    els.breadcrumbs.querySelectorAll('[data-crumb]').forEach(el => {
        el.addEventListener('click', () => {
            Sound.back();
            if (el.dataset.crumb === 'root') {
                state.activeCategory = null;
                state.activeSubcategory = null;
                state.searchQuery = '';
                if (els.search) els.search.value = '';
                renderCategories();
            } else if (el.dataset.crumb === 'cat') {
                state.activeSubcategory = null;
                state.searchQuery = '';
                if (els.search) els.search.value = '';
                openCategory(state.activeCategory);
            }
        });
    });
}

// ===== РЕНДЕР КАТЕГОРИЙ =====
function renderCategories() {
    if (!els.categoriesView) return;
    const cats = state.categories[state.currentTab];

    showLevel('categories');
    updateBreadcrumbs(null);

    const catNames = Object.keys(cats).sort();
    if (!catNames.length) {
        els.categoriesView.innerHTML = '<div class="error-msg">Нет данных</div>';
        return;
    }

    els.categoriesView.innerHTML = catNames.map((cat, i) => {
        const c = cats[cat];
        let count = c.flat.length;
        Object.values(c.subcats).forEach(arr => count += arr.length);
        return `
            <div class="category-card" data-category="${escapeHtml(cat)}" style="animation-delay:${i * 0.03}s">
                <h3>${escapeHtml(cat)}</h3>
                <div class="count">Блоков: <span>${count}</span></div>
            </div>
        `;
    }).join('');

    els.categoriesView.querySelectorAll('.category-card').forEach(card => {
        attachCardFx(card, () => openCategory(card.dataset.category));
    });
}

function openCategory(cat) {
    state.activeCategory = cat;
    state.activeSubcategory = null;
    state.searchQuery = '';
    if (els.search) els.search.value = '';
    Sound.open();

    const c = state.categories[state.currentTab][cat];
    if (!c) return;

    if (!c.hasSubs) {
        state.activeSubcategory = '__flat__';
        renderItems();
        return;
    }

    const subNames = Object.keys(c.subcats);
    if (subNames.length === 1) {
        state.activeSubcategory = subNames[0];
        renderItems();
        return;
    }

    renderSubcategories();
}

// ===== РЕНДЕР СУБКАТЕГОРИЙ =====
function renderSubcategories() {
    if (!els.subcategoriesView) return;
    const cat = state.activeCategory;
    const c = state.categories[state.currentTab][cat];
    if (!c) return;

    const subNames = Object.keys(c.subcats).sort();
    if (els.subcategoriesTitle) els.subcategoriesTitle.textContent = `Субкатегории · ${cat}`;

    showLevel('subcategories');
    updateBreadcrumbs(1, cat);

    els.subcategoriesView.innerHTML = subNames.map((sub, i) => {
        const count = c.subcats[sub].length;
        return `
            <div class="subcategory-card" data-sub="${escapeHtml(sub)}" style="animation-delay:${i * 0.03}s">
                <h4>${escapeHtml(sub)}</h4>
                <div class="sub-count">${count}</div>
                <span class="sub-arrow">›</span>
            </div>
        `;
    }).join('');

    els.subcategoriesView.querySelectorAll('.subcategory-card').forEach(card => {
        attachCardFx(card, () => {
            state.activeSubcategory = card.dataset.sub;
            Sound.open();
            renderItems();
        });
    });
}

// ===== РЕНДЕР ЭЛЕМЕНТОВ =====
function renderItemRow(it, index = 0) {
    const desc = it.description || it.desc || it.comment || '';
    const colorClass = it._entityColor || 'entity-default';
    const firstIcon = it._iconCandidates && it._iconCandidates[0] ? it._iconCandidates[0] : '';
    const src = firstIcon ? (it._iconBase + firstIcon) : '';
    
    const isCancellable = it.cancellable === true;
    const cancellableBadge = isCancellable 
        ? `<span class="cancellable-badge" title="Можно отменить">ø</span>` 
        : '';

    return `
        <div class="item-row ${colorClass}" style="animation-delay:${Math.min(index, 20) * 0.02}s">
            <div class="item-name">
                <div class="item-icon-wrap">
                    ${src ? `<img class="item-icon" src="${escapeHtml(src)}" alt="${escapeHtml(it._name)}" loading="lazy" data-base="${escapeHtml(it._iconBase)}" data-candidates="${escapeHtml((it._iconCandidates || []).join('|'))}" data-current-name="${escapeHtml(firstIcon)}" onerror="window.__iconFallback(this)">` : ''}
                </div>
                <span>${escapeHtml(it._name)}</span>
                ${cancellableBadge}
                <span class="item-id">${escapeHtml(it._id)}</span>
            </div>
            ${desc ? `<div class="item-desc">${escapeHtml(desc.substring(0, 100))}${desc.length > 100 ? '…' : ''}</div>` : ''}
        </div>
    `;
}

function renderItems() {
    if (!els.itemsList) return;
    const cat = state.activeCategory;
    const sub = state.activeSubcategory;
    if (!cat) return;

    const c = state.categories[state.currentTab][cat];
    if (!c) return;

    let items = [];
    let titleSub = null;
    if (sub === '__flat__') items = c.flat;
    else if (sub) { items = c.subcats[sub] || []; titleSub = sub; }

    const query = state.searchQuery.toLowerCase().trim();
    let filtered = items;
    if (query) {
        filtered = items.filter(it =>
            it._name.toLowerCase().includes(query) ||
            it._id.toLowerCase().includes(query) ||
            (it._rawName && it._rawName.toLowerCase().includes(query))
        );
    }

    if (titleSub) updateBreadcrumbs(2, cat, titleSub);
    else updateBreadcrumbs(1, cat);

    showLevel('items');
    if (els.itemsTitle) els.itemsTitle.textContent = titleSub ? `${cat} › ${titleSub}` : cat;
    if (els.itemsSubtitle) els.itemsSubtitle.textContent = titleSub ? `Блоки подкатегории «${titleSub}»` : `Блоки категории «${cat}»`;
    if (els.itemsCount) els.itemsCount.textContent = `${filtered.length} шт.`;

    if (!filtered.length) {
        els.itemsList.innerHTML = '<div class="error-msg">Ничего не найдено</div>';
        return;
    }

    els.itemsList.innerHTML = filtered.map((it, i) => renderItemRow(it, i)).join('');

    els.itemsList.querySelectorAll('.item-row').forEach((row, idx) => {
        row.addEventListener('click', () => {
            const item = filtered[idx];
            if (item) openModal(item);
        });
    });
}

// ===== ПОИСК =====
function renderSearchResults() {
    if (!els.itemsList) return;
    const cats = state.categories[state.currentTab];
    const query = state.searchQuery.toLowerCase().trim();

    let all = [];
    Object.entries(cats).forEach(([cat, c]) => {
        c.flat.forEach(it => all.push({ ...it, _cat: cat, _sub: null }));
        Object.entries(c.subcats).forEach(([sub, arr]) => {
            arr.forEach(it => all.push({ ...it, _cat: cat, _sub: sub }));
        });
    });

    const filtered = all.filter(it =>
        it._name.toLowerCase().includes(query) ||
        it._id.toLowerCase().includes(query) ||
        (it._rawName && it._rawName.toLowerCase().includes(query))
    );

    showLevel('items');
    if (els.breadcrumbs) { els.breadcrumbs.classList.add('hidden'); els.breadcrumbs.innerHTML = ''; }
    if (els.backBtn) els.backBtn.classList.add('hidden');

    if (els.itemsTitle) els.itemsTitle.textContent = `Поиск: «${state.searchQuery}»`;
    if (els.itemsSubtitle) els.itemsSubtitle.textContent = 'Результаты поиска по всем разделам';
    if (els.itemsCount) els.itemsCount.textContent = `${filtered.length} шт.`;

    if (!filtered.length) {
        els.itemsList.innerHTML = '<div class="error-msg">Ничего не найдено</div>';
        return;
    }

    const sliced = filtered.slice(0, 300);
    els.itemsList.innerHTML = sliced.map((it, i) => {
        const row = renderItemRow(it, i);
        return row.replace('<div class="item-desc">', `<div class="item-desc">${escapeHtml(it._cat)} › ${escapeHtml(it._sub || 'Общее')} · `);
    }).join('');

    els.itemsList.querySelectorAll('.item-row').forEach((row, idx) => {
        row.addEventListener('click', () => {
            const item = sliced[idx];
            if (item) openModal(item);
        });
    });
}

// ===== МОДАЛКА ДЕТАЛЕЙ =====
function openModal(item) {
    if (!els.modalOverlay) return;

    els.modalIcon.classList.add('hidden');
    els.modalIconLetter.classList.add('hidden');
    els.modalIconWrap.classList.remove('no-icon');

    if (item._iconCandidates && item._iconCandidates[0] && item._iconBase) {
        const src = item._iconBase + item._iconCandidates[0];
        els.modalIcon.src = src;
        els.modalIcon.alt = item._name;
        els.modalIcon.classList.remove('hidden');
        els.modalIcon.onerror = () => {
            els.modalIcon.classList.add('hidden');
            els.modalIconLetter.textContent = (item._name || '?').charAt(0).toUpperCase();
            els.modalIconLetter.classList.remove('hidden');
        };
    } else {
        els.modalIconLetter.textContent = (item._name || '?').charAt(0).toUpperCase();
        els.modalIconLetter.classList.remove('hidden');
    }

    els.modalTitle.textContent = item._name || 'Без названия';
    els.modalId.textContent = item._id || '';

    els.modalTabs.forEach(t => t.classList.toggle('active', t.dataset.tab === 'info'));
    els.modalInfo.classList.remove('hidden');
    els.modalLocale.classList.add('hidden');
    els.modalJson.classList.add('hidden');

    renderModalInfo(item);
    renderModalLocale(item);
    renderModalJson(item);

    els.modalOverlay.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
    Sound.open();
}

function closeModal() {
    if (!els.modalOverlay) return;
    els.modalOverlay.classList.add('hidden');
    document.body.style.overflow = '';
    Sound.back();
}

function renderModalInfo(item) {
    if (!els.modalInfo) return;
    const parts = [];

    const desc = item.description || item.desc || item.comment || '';
    if (desc) {
        parts.push(`
            <div class="detail-section">
                <h4>Описание</h4>
                <p>${escapeHtml(desc)}</p>
            </div>
        `);
    }

    const tags = [];
    if (item.category) tags.push(`<span class="detail-tag">Категория: ${escapeHtml(item.category)}</span>`);
    if (item.subcategory) tags.push(`<span class="detail-tag teal">Субкатегория: ${escapeHtml(item.subcategory)}</span>`);
    if (item.type) tags.push(`<span class="detail-tag gold">Тип: ${escapeHtml(item.type)}</span>`);
    if (item.group) tags.push(`<span class="detail-tag">Группа: ${escapeHtml(item.group)}</span>`);
    if (item.cancellable === true) {
        tags.push(`<span class="detail-tag" style="background: rgba(237, 30, 30, 0.15); color: #ED1E1E; border-color: rgba(237, 30, 30, 0.3);">Можно отменить (cancellable)</span>`);
    }

    if (tags.length) {
        parts.push(`
            <div class="detail-section">
                <h4>Классификация</h4>
                <div class="detail-tags">${tags.join('')}</div>
            </div>
        `);
    }

    if (Array.isArray(item.arguments) && item.arguments.length) {
        const argsHtml = item.arguments.map(arg => {
            const argName = arg.name || arg.id || arg.key || '?';
            const argDesc = arg.description || arg.desc || '';
            const argType = arg.type || '';
            return `
                <tr>
                    <td>${escapeHtml(argName)}</td>
                    <td>${escapeHtml(argDesc)}${argType ? ` <span class="detail-tag gold" style="margin-left:6px">${escapeHtml(argType)}</span>` : ''}</td>
                </tr>
            `;
        }).join('');
        parts.push(`
            <div class="detail-section">
                <h4>Аргументы (${item.arguments.length})</h4>
                <table class="locale-table">${argsHtml}</table>
            </div>
        `);
    }

    if (!parts.length) {
        parts.push(`<div class="detail-section"><p>Нет дополнительной информации. Смотрите вкладки «Локализация» и «JSON».</p></div>`);
    }

    els.modalInfo.innerHTML = parts.join('');
}

function renderModalLocale(item) {
    if (!els.modalLocale) return;
    const id = item._id || '';
    if (!id) {
        els.modalLocale.innerHTML = '<div class="detail-section"><p>Нет ID.</p></div>';
        return;
    }

    const idLower = id.toLowerCase();
    const lastPart = id.split('.').pop().toLowerCase();
    const matches = [];

    for (const [key, value] of Object.entries(state.locale)) {
        const kLower = key.toLowerCase();
        if (kLower === idLower || kLower.startsWith(idLower + '.')) {
            matches.push([key, value]);
            continue;
        }
        if (kLower.includes('.' + idLower + '.')) {
            matches.push([key, value]);
            continue;
        }
        if (lastPart && (kLower.startsWith(lastPart + '.') || kLower.includes('.' + lastPart + '.'))) {
            matches.push([key, value]);
        }
    }

    const seen = new Set();
    const unique = matches.filter(([k]) => {
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
    });

    if (!unique.length) {
        els.modalLocale.innerHTML = `<div class="detail-section"><p>Для этого блока не найдено ключей локализации.</p></div>`;
        return;
    }

    unique.sort((a, b) => {
        const score = k => k.endsWith('.name') ? 0 : k.endsWith('.description') ? 1 : 2;
        return score(a[0]) - score(b[0]) || a[0].localeCompare(b[0]);
    });

    const rows = unique.map(([k, v]) => `
        <tr>
            <td>${escapeHtml(k)}</td>
            <td>${escapeHtml(v)}</td>
        </tr>
    `).join('');

    els.modalLocale.innerHTML = `
        <div class="detail-section">
            <h4>Найдено ключей: ${unique.length}</h4>
            <table class="locale-table">${rows}</table>
        </div>
    `;
}

function renderModalJson(item) {
    if (!els.modalJson) return;
    const clean = {};
    for (const [k, v] of Object.entries(item)) {
        if (!k.startsWith('_')) clean[k] = v;
    }
    const json = JSON.stringify(clean, null, 2);
    els.modalJson.innerHTML = `<pre class="json-code">${escapeHtml(json)}</pre>`;
}

// ===== ВСПОМОГАТЕЛЬНЫЕ =====
function attachCardFx(card, onClick) {
    card.addEventListener('mouseenter', () => Sound.hover());
    card.addEventListener('mousemove', (e) => {
        const rect = card.getBoundingClientRect();
        card.style.setProperty('--mx', ((e.clientX - rect.left) / rect.width * 100) + '%');
        card.style.setProperty('--my', ((e.clientY - rect.top) / rect.height * 100) + '%');
    });
    card.addEventListener('click', (e) => {
        const rect = card.getBoundingClientRect();
        const ripple = document.createElement('span');
        ripple.className = 'ripple';
        const size = Math.max(rect.width, rect.height);
        ripple.style.width = ripple.style.height = size + 'px';
        ripple.style.left = (e.clientX - rect.left - size / 2) + 'px';
        ripple.style.top = (e.clientY - rect.top - size / 2) + 'px';
        card.appendChild(ripple);
        setTimeout(() => ripple.remove(), 600);
        Sound.click();
        onClick();
    });
}

function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ===== ИНИЦИАЛИЗАЦИЯ =====
function init() {
    initEls();
    if (!els.loading) return console.error('❌ #loadingState не найден');

    if (els.soundToggle) {
        els.soundToggle.addEventListener('click', () => {
            const enabled = Sound.toggle();
            els.soundToggle.classList.toggle('muted', !enabled);
            els.soundToggle.querySelector('.sound-icon').textContent = enabled ? '🔊' : '🔇';
            if (enabled) Sound.click();
        });
    }

    els.tabs.forEach(btn => {
        btn.addEventListener('click', () => {
            if (btn.classList.contains('active')) return;
            Sound.click();
            els.tabs.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            state.currentTab = btn.dataset.tab;
            state.activeCategory = null;
            state.activeSubcategory = null;
            state.searchQuery = '';
            if (els.search) els.search.value = '';
            renderCategories();
        });
    });

    if (els.search) {
        let typeTimer = null;
        els.search.addEventListener('input', (e) => {
            state.searchQuery = e.target.value;
            clearTimeout(typeTimer);
            typeTimer = setTimeout(() => { if (state.searchQuery.trim()) Sound.type(); }, 200);
            if (state.searchQuery.trim()) renderSearchResults();
            else if (state.activeSubcategory) renderItems();
            else if (state.activeCategory) renderSubcategories();
            else renderCategories();
        });
    }

    if (els.backBtn) {
        els.backBtn.addEventListener('click', () => {
            Sound.back();
            if (state.activeSubcategory && state.activeSubcategory !== '__flat__') {
                state.activeSubcategory = null;
                state.searchQuery = '';
                if (els.search) els.search.value = '';
                renderSubcategories();
            } else if (state.activeCategory) {
                state.activeCategory = null;
                state.activeSubcategory = null;
                state.searchQuery = '';
                if (els.search) els.search.value = '';
                renderCategories();
            }
        });
    }

    if (els.modalClose) els.modalClose.addEventListener('click', closeModal);
    if (els.modalOverlay) {
        els.modalOverlay.addEventListener('click', (e) => {
            if (e.target === els.modalOverlay) closeModal();
        });
    }

    if (els.modalTabs) {
        els.modalTabs.forEach(tab => {
            tab.addEventListener('click', () => {
                els.modalTabs.forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                const target = tab.dataset.tab;
                els.modalInfo.classList.toggle('hidden', target !== 'info');
                els.modalLocale.classList.toggle('hidden', target !== 'locale');
                els.modalJson.classList.toggle('hidden', target !== 'json');
            });
        });
    }

    document.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
            e.preventDefault();
            els.search.focus();
            Sound.click();
        }
        if (e.key === 'Escape') {
            if (els.modalOverlay && !els.modalOverlay.classList.contains('hidden')) {
                closeModal();
                return;
            }
            if (els.search && els.search.value) {
                els.search.value = '';
                state.searchQuery = '';
                if (state.activeSubcategory) renderItems();
                else if (state.activeCategory) renderSubcategories();
                else renderCategories();
            } else if (state.activeSubcategory && state.activeSubcategory !== '__flat__') {
                Sound.back();
                state.activeSubcategory = null;
                renderSubcategories();
            } else if (state.activeCategory) {
                Sound.back();
                state.activeCategory = null;
                state.activeSubcategory = null;
                renderCategories();
            }
        }
    });

    if (els.scrollTop) {
        window.addEventListener('scroll', () => {
            els.scrollTop.classList.toggle('hidden', window.scrollY < 400);
        });
        els.scrollTop.addEventListener('click', () => {
            Sound.click();
            window.scrollTo({ top: 0, behavior: 'smooth' });
        });
    }

    if (els.bgParallax) {
        document.addEventListener('mousemove', (e) => {
            const x = (e.clientX / window.innerWidth - 0.5) * 20;
            const y = (e.clientY / window.innerHeight - 0.5) * 20;
            els.bgParallax.style.transform = `translate(${x}px, ${y}px)`;
        });
    }

    loadAll();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();