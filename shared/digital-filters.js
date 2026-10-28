(function (scope) {
  'use strict';
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const values = (product, facet) => [...new Set([facet.value(product)].flat().filter(value => value != null && String(value).trim()).map(String))];
  function matches(product, facets, selected, skip) {
    return facets.every(facet => facet.key === skip || !selected[facet.key]?.size || values(product,facet).some(value => selected[facet.key].has(value)));
  }
  const saved = new Map();
  function create(root, { id, products, facets, searchText, render, afterRender = () => {} }) {
    const abort = new AbortController(), signal = abort.signal;
    const mobile = matchMedia('(max-width:900px)');
    const state = saved.get(id) || { selected:{}, searches:{}, expanded:{}, term:'' };
    saved.set(id,state);
    let opened = false, previousOverflow = '';
    facets = facets.filter(facet => products.some(product => values(product,facet).length));
    facets.forEach(facet => { state.selected[facet.key] ||= new Set(); });
    // Selections whose data was removed must never invisibly hide the catalog.
    facets.forEach(facet => { const available = new Set(products.flatMap(product => values(product,facet))); state.selected[facet.key] = new Set([...state.selected[facet.key]].filter(value => available.has(value))); });
    root.innerHTML = `<div class="digital-filter-toolbar"><button type="button" class="digital-filter-toggle" aria-controls="${id}-sidebar" aria-expanded="false"><i class="fas fa-sliders" aria-hidden="true"></i> الفلاتر <span data-filter-total></span></button><p class="digital-filter-count" role="status"></p><button type="button" class="digital-filter-reset" data-filter-reset hidden>مسح الفلاتر</button></div><div class="digital-catalog-layout"><button type="button" class="digital-filter-backdrop" aria-label="إغلاق الفلاتر" hidden></button><aside class="digital-catalog-sidebar" id="${id}-sidebar" aria-label="فلاتر المنتجات"><div class="digital-sidebar-heading"><h2>تصفية المنتجات</h2><button type="button" class="digital-filter-close" aria-label="إغلاق الفلاتر"><i class="fas fa-xmark" aria-hidden="true"></i></button></div>${facets.map(facet => `<section class="digital-filter-group" data-facet="${facet.key}"><h3>${esc(facet.label)}</h3>${facet.search || new Set(products.flatMap(product => values(product,facet))).size > 6 ? `<label class="digital-facet-search"><i class="fas fa-magnifying-glass" aria-hidden="true"></i><input type="search" data-facet-search="${facet.key}" aria-label="بحث في ${esc(facet.label)}" placeholder="بحث في ${esc(facet.label)}" value="${esc(state.searches[facet.key] || '')}"></label>` : ''}<div class="digital-facet-options"></div><button type="button" class="digital-facet-more" data-facet-more="${facet.key}"></button></section>`).join('')}<button type="button" class="digital-filter-apply">عرض النتائج</button></aside><div class="digital-catalog-results"><div class="digital-filter-selection" aria-label="الفلاتر المختارة"></div><div class="digital-filter-products" aria-live="polite"></div></div></div>`;
    const sidebar = root.querySelector('.digital-catalog-sidebar'), results = root.querySelector('.digital-catalog-results'), toggle = root.querySelector('.digital-filter-toggle');
    function searched(product) { return !state.term || searchText(product).toLocaleLowerCase().includes(state.term.toLocaleLowerCase()); }
    function optionsHtml(facet) {
      const group = root.querySelector(`[data-facet="${facet.key}"]`);
      const counts = new Map(products.flatMap(product => values(product,facet)).map(value => [value,0]));
      products.filter(product => searched(product) && matches(product,facets,state.selected,facet.key)).forEach(product => values(product,facet).forEach(value => counts.set(value,counts.get(value)+1)));
      const options = [...counts].sort(([a],[b]) => a.localeCompare(b,'ar')).filter(([value]) => (facet.optionLabel?.(value) || value).toLocaleLowerCase().includes((state.searches[facet.key] || '').toLocaleLowerCase()));
      const shown = state.expanded[facet.key] || state.searches[facet.key] ? options : options.slice(0,5);
      group.querySelector('.digital-facet-options').innerHTML = shown.map(([value,count]) => `<label class="digital-facet-option"><input type="checkbox" data-facet-key="${facet.key}" value="${esc(value)}" ${state.selected[facet.key].has(value) ? 'checked' : ''}><bdi>${esc(facet.optionLabel?.(value) || value)}</bdi><span>${count}</span></label>`).join('') || '<p class="digital-facet-empty">لا توجد خيارات مطابقة</p>';
      const more = group.querySelector('[data-facet-more]'); more.hidden = options.length <= 5 || Boolean(state.searches[facet.key]); more.textContent = state.expanded[facet.key] ? 'عرض أقل' : `عرض ${options.length-5} خيارات أخرى`;
      more.setAttribute('aria-expanded',String(Boolean(state.expanded[facet.key])));
    }
    function update() {
      facets.forEach(optionsHtml);
      const chips = facets.flatMap(facet => [...state.selected[facet.key]].map(value => ({facet,value})));
      root.querySelector('.digital-filter-selection').innerHTML = chips.map(({facet,value}) => `<button type="button" data-remove-facet="${facet.key}" data-value="${esc(value)}" aria-label="إزالة ${esc(value)}">${esc(facet.optionLabel?.(value) || value)} <i class="fas fa-xmark" aria-hidden="true"></i></button>`).join('');
      root.querySelector('[data-filter-reset]').hidden = !chips.length && !state.term;
      root.querySelector('[data-filter-total]').textContent = chips.length || '';
      const filtered = products.filter(product => searched(product) && matches(product,facets,state.selected));
      root.querySelector('.digital-filter-count').textContent = `${filtered.length} منتج`;
      root.querySelector('.digital-filter-products').innerHTML = render(filtered,Boolean(chips.length || state.term));
      afterRender();
    }
    function sync() {
      sidebar.inert = mobile.matches && !opened;
      if (mobile.matches) { sidebar.setAttribute('role','dialog'); sidebar.setAttribute('aria-modal','true'); }
      else { sidebar.removeAttribute('role'); sidebar.removeAttribute('aria-modal'); }
    }
    function close(focus = false) {
      if (opened) document.body.style.overflow = previousOverflow;
      opened = false; root.classList.remove('digital-filters-open'); results.inert = false;
      root.querySelector('.digital-filter-backdrop').hidden = true; toggle.setAttribute('aria-expanded','false'); sync();
      if (focus) toggle.focus();
    }
    root.addEventListener('click',event => {
      if (event.target.closest('.digital-filter-toggle')) { previousOverflow = document.body.style.overflow; opened = true; root.classList.add('digital-filters-open'); document.body.style.overflow = 'hidden'; results.inert = true; root.querySelector('.digital-filter-backdrop').hidden = false; toggle.setAttribute('aria-expanded','true'); sync(); root.querySelector('.digital-filter-close').focus(); }
      if (event.target.closest('.digital-filter-close,.digital-filter-apply,.digital-filter-backdrop')) close(true);
      const more = event.target.closest('[data-facet-more]'); if (more) { state.expanded[more.dataset.facetMore] = !state.expanded[more.dataset.facetMore]; optionsHtml(facets.find(facet => facet.key === more.dataset.facetMore)); }
      const chip = event.target.closest('[data-remove-facet]'); if (chip) { state.selected[chip.dataset.removeFacet].delete(chip.dataset.value); update(); }
      if (event.target.closest('[data-filter-reset]')) { Object.values(state.selected).forEach(set => set.clear()); state.term = ''; root.dispatchEvent(new CustomEvent('digital:search-reset',{bubbles:true})); update(); sidebar.scrollTop = 0; }
    },{signal});
    root.addEventListener('input',event => { const key = event.target.dataset.facetSearch; if (key) { state.searches[key] = event.target.value; optionsHtml(facets.find(facet => facet.key === key)); } },{signal});
    root.addEventListener('change',event => {
      const input = event.target, key = input.dataset.facetKey;
      if (!key) return;
      if (input.checked) state.selected[key].add(input.value); else state.selected[key].delete(input.value);
      const value = input.value; update();
      [...root.querySelectorAll('[data-facet-key]')].find(element => element.dataset.facetKey === key && element.value === value)?.focus({preventScroll:true});
    },{signal});
    document.addEventListener('keydown',event => {
      if (!opened) return;
      if (event.key === 'Escape') { event.preventDefault(); close(true); }
      if (event.key !== 'Tab') return;
      const controls = [...sidebar.querySelectorAll('button,input')].filter(el => !el.disabled && el.getClientRects().length);
      if (event.shiftKey && document.activeElement === controls[0]) { event.preventDefault(); controls.at(-1).focus(); }
      else if (!event.shiftKey && document.activeElement === controls.at(-1)) { event.preventDefault(); controls[0].focus(); }
    },{signal});
    mobile.addEventListener('change',() => { if (!mobile.matches) close(); sync(); },{signal});
    update(); sync();
    return { setSearch(value) { state.term = value.trim(); update(); }, close, destroy() { close(); abort.abort(); }, get search() { return state.term; } };
  }
  const api = Object.freeze({ create, matches, values });
  if (typeof module === 'object' && module.exports) module.exports = api;
  else scope.SwitchesDigitalFilters = api;
})(typeof window === 'object' ? window : globalThis);
