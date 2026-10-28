(function () {
  'use strict';
  const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const sections = [
    { key: 'products', imageKey: 'pcParts', name: 'PC PARTS', href: '/?view=products', icon: 'fas fa-microchip' },
    { key: 'gift-cards', imageKey: 'giftCards', name: 'Gift Card', href: '/gift-cards', icon: 'fas fa-gift' },
    { key: 'minecraft', imageKey: 'minecraft', name: 'Minecraft', href: '/minecraft', icon: 'fas fa-cube' },
    { key: 'subscriptions', imageKey: 'subscriptions', name: 'الاشتراكات', href: '/subscriptions', icon: 'fas fa-layer-group' },
  ];
  function active() {
    const path = location.pathname;
    if (/^\/(gift-cards|checkout)(\/|$)/.test(path)) return 'gift-cards';
    if (/^\/minecraft(\/|$)/.test(path)) return 'minecraft';
    if (/^\/subscriptions(\/|$)/.test(path)) return 'subscriptions';
    return 'products';
  }
  function imageUrl(value) {
    try { const url = new URL(value, location.origin); return value && ['http:', 'https:'].includes(url.protocol) ? value : ''; } catch { return ''; }
  }
  function render(visuals = {}, fallbackImages = {}) {
    return `<nav class="store-mode-switch section-navigation" aria-label="أقسام المتجر">${sections.filter(section=>{
      const rows=window.SwitchesCatalogSections;
      if(!Array.isArray(rows))return true;
      const slug=section.key==='products'?'pc-parts':section.key;
      return rows.some(row=>row.slug===slug&&row.showInNavbar!==false);
    }).map(section => {
      const saved=(window.SwitchesCatalogSections||[]).find(row=>row.slug===(section.key==='products'?'pc-parts':section.key));
      const image = imageUrl(saved?.image || visuals.sections?.[section.imageKey] || fallbackImages[section.key]);
      const selected = active() === section.key;
      return `<a href="${section.href}" class="store-mode-card store-mode-${section.key} ${selected ? 'active' : ''}" data-section-route="${section.key}" ${selected ? 'aria-current="page"' : ''}>
        ${image ? `<img class="section-navigation-image" src="${escape(image)}" alt="" loading="lazy" decoding="async">` : ''}
        <span class="store-mode-icon"><i class="${section.icon}" aria-hidden="true"></i></span><span class="store-mode-label">${escape(saved?.nameAr || saved?.name || section.name)}</span>
      </a>`;
    }).join('')}</nav>`;
  }
  function sync() {
    const rows=window.SwitchesCatalogSections;
    if(Array.isArray(rows))document.querySelectorAll('[data-section-route]').forEach(link=>{const slug=link.dataset.sectionRoute==='products'?'pc-parts':link.dataset.sectionRoute;const saved=rows.find(row=>row.slug===slug&&row.showInNavbar!==false);link.hidden=!saved;if(saved){const label=link.querySelector('.store-mode-label');if(label)label.textContent=saved.nameAr||saved.name;const image=link.querySelector('.section-navigation-image');if(image&&saved.image)image.src=saved.image;}});
    document.querySelectorAll('[data-section-route]').forEach(link => {
      const selected = link.dataset.sectionRoute === active();
      link.classList.toggle('active', selected);
      if (selected) link.setAttribute('aria-current', 'page'); else link.removeAttribute('aria-current');
    });
  }
  document.addEventListener('click', event => {
    const link = event.target.closest('[data-section-route]');
    if (!link || event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    const key = link.dataset.sectionRoute;
    if (key === 'products' && window.showAllProducts) { event.preventDefault(); window.showAllProducts(); }
    if (key === 'gift-cards' && window.showGiftCards) { event.preventDefault(); window.SwitchesDigitalStore?.hide(); window.showGiftCards(); }
    if (['minecraft', 'subscriptions'].includes(key) && window.SwitchesDigitalStore) { event.preventDefault(); window.SwitchesDigitalStore.navigate(link.getAttribute('href')); }
    sync();
  });
  window.addEventListener('switches:sections-changed',sync);
  window.SwitchesSectionNavigation = Object.freeze({ render, sync, active, imageUrl });
})();
