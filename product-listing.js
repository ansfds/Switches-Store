(function () {
  const page = document.getElementById('allProductsPage');
  const detail = document.getElementById('productDetailView');
  const sidebar = document.getElementById('catalogFilters');
  const search = document.getElementById('allProductsSearchInput');
  const selected = { category: new Set(), brand: new Set(), condition: new Set() };
  const filterRoots = Object.fromEntries([...sidebar.querySelectorAll('[data-filter]')].map(root => [root.dataset.filter, root]));
  const mobile = window.matchMedia('(max-width: 900px)');
  let productRef = null;
  let drawerOpen = false;
  let previousOverflow = '';

  function productsReady() {
    return !isProductBootstrapPending() && !hasProductBootstrapFailed();
  }

  function productValue(product, key) {
    return key === 'condition' ? SwitchesProductCardData.conditionLabel(product.condition) : String(product[key] || '').trim();
  }

  function renderFilters() {
    for (const [key, root] of Object.entries(filterRoots)) {
      if (!productsReady()) {
        root.innerHTML = '<span class="skeleton-block catalog-filter-skeleton" aria-hidden="true"></span>';
        continue;
      }
      const counts = new Map();
      allProducts.filter(SwitchesProductSections.isPcPart).forEach(product => {
        const value = productValue(product, key);
        if (value) counts.set(value, (counts.get(value) || 0) + 1);
      });
      root.innerHTML = [...counts].sort(([a], [b]) => a.localeCompare(b, 'ar')).map(([value, count]) => `
        <label class="catalog-filter-option">
          <input type="checkbox" value="${escapeHtml(value)}" ${selected[key].has(value) ? 'checked' : ''}>
          <bdi>${escapeHtml(value)}</bdi><span class="catalog-filter-count">${count}</span>
        </label>`).join('');
    }
  }

  function listingUrl() {
    const query = new URLSearchParams({ view: 'products' });
    if (search.value.trim()) query.set('q', search.value.trim());
    for (const [key, values] of Object.entries(selected)) values.forEach(value => query.append(key, value));
    return `/?${query}`;
  }

  function navigate(url, push) {
    if (push && `${location.pathname}${location.search}` !== url) history.pushState({ page: 'products' }, '', url);
  }

  function renderSelectedFilters() {
    const root = document.getElementById('catalogSelectedFilters');
    const values = Object.entries(selected).flatMap(([key, options]) => [...options].map(value => ({ key, value })));
    if (search.value.trim()) values.unshift({ key: 'q', value: search.value.trim() });
    root.hidden = values.length === 0;
    root.innerHTML = values.length ? `<span>الفلاتر المختارة:</span>${values.map(({ key, value }) => `
      <button class="catalog-filter-chip" type="button" data-remove-filter="${key}" data-value="${escapeHtml(value)}" aria-label="إزالة فلتر ${escapeHtml(value)}">
        <bdi>${escapeHtml(value)}</bdi><i class="fas fa-xmark" aria-hidden="true"></i>
      </button>`).join('')}<button class="catalog-reset" type="button" data-reset-filters><i class="fas fa-rotate-left" aria-hidden="true"></i> إعادة ضبط</button>` : '';
  }

  function filter({ updateUrl = true, readControls = true } = {}) {
    if (page.classList.contains('is-detail')) return;
    if (productsReady() && readControls) {
      for (const [key, root] of Object.entries(filterRoots)) selected[key] = new Set([...root.querySelectorAll('input:checked')].map(input => input.value));
    }
    const term = search.value.trim().toLocaleLowerCase();
    const products = productsReady() ? allProducts.filter(product => {
      if (!SwitchesProductSections.isPcPart(product)) return false;
      if (term && ![product.name, product.description, product.brand].join(' ').toLocaleLowerCase().includes(term)) return false;
      return Object.entries(selected).every(([key, options]) => !options.size || options.has(productValue(product, key)));
    }) : [];
    renderAllProductsGrid(products);
    document.getElementById('catalogResultCount').textContent = isProductBootstrapPending() ? 'جارٍ تحميل المنتجات' : hasProductBootstrapFailed() ? '' : `${products.length} منتج`;
    document.getElementById('allProductsGrid').setAttribute('aria-busy', String(isProductBootstrapPending()));
    renderSelectedFilters();
    if (updateUrl && page.classList.contains('active') && productsReady()) history.replaceState({ page: 'products' }, '', listingUrl());
  }

  function activate() {
    window.SwitchesDigitalStore?.hide();
    closeFilters();
    closePromoPopup();
    document.querySelector('.main-content').style.display = 'none';
    ['favoritesPage', 'giftCardsPage', 'accountPage'].forEach(id => document.getElementById(id)?.classList.remove('active'));
    page.classList.add('active');
  }

  function showListing(title = 'جميع المنتجات', { push = true, scroll = true } = {}) {
    activate();
    productRef = null;
    page.classList.remove('is-detail');
    detail.hidden = true;
    document.getElementById('allProductsTitle').textContent = title;
    renderFilters();
    filter({ updateUrl: false, readControls: false });
    navigate(listingUrl(), push);
    if (scroll) window.scrollTo({ top: 0, behavior: 'instant' });
  }

  function findProduct(ref) {
    return allProducts.find(product => String(product.id) === String(ref) || (product.slug && product.slug === String(ref)));
  }

  function relatedProducts(product) {
    return allProducts.filter(item => item.id !== product.id && SwitchesProductSections.isPcPart(item)).sort((a, b) => {
      const category = Number(b.category === product.category) - Number(a.category === product.category);
      const brand = Number(b.brand === product.brand) - Number(a.brand === product.brand);
      return category || brand || Math.abs(Number(a.price) - Number(product.price)) - Math.abs(Number(b.price) - Number(product.price));
    }).slice(0, 6);
  }

  function renderDetail() {
    detail.setAttribute('aria-busy', String(isProductBootstrapPending()));
    if (isProductBootstrapPending()) {
      detail.innerHTML = `<div class="detail-layout detail-loading" aria-hidden="true"><div class="skeleton-block detail-image-skeleton"></div><div>${renderProductSkeletonCards(1)}</div></div>`;
      return;
    }
    if (hasProductBootstrapFailed()) {
      detail.innerHTML = renderProductLoadErrorState();
      return;
    }
    const product = findProduct(productRef);
    if (product && SwitchesProductSections.isDigital(product) && window.SwitchesDigitalStore) {
      history.replaceState({ page: 'digital-product' }, '', SwitchesProductSections.route(product));
      window.SwitchesDigitalStore.readRoute();
      return;
    }
    if (!product) {
      detail.innerHTML = '<div class="catalog-not-found"><h1>المنتج غير موجود</h1><a href="/?view=products" data-catalog-listing>جميع المنتجات</a></div>';
      return;
    }
    const related = relatedProducts(product);
    const facts = SwitchesProductOptions.specs(product).slice(0,4);
    const detailOptions = { category:product.category, factsHtml:facts.length ? `<dl class="store-product-specs">${facts.map(([key,value]) => `<div><dt>${escapeHtml(key)}</dt><dd><bdi>${escapeHtml(value)}</bdi></dd></div>`).join('')}</dl>` : '' };
    detail.innerHTML = `
      <nav class="catalog-breadcrumb" aria-label="مسار المنتج"><a href="/?view=products" data-catalog-listing><i class="fas fa-arrow-right" aria-hidden="true"></i> جميع المنتجات</a>${product.category ? `<span>/</span><span>${escapeHtml(product.category)}</span>` : ''}</nav>
      ${SwitchesProductDetail.html(product,detailOptions)}
      ${related.length ? '<section class="related-products"><h2>منتجات أخرى قد تعجبك</h2><div id="relatedProductsGrid" class="catalog-grid" aria-label="منتجات مشابهة"></div></section>' : ''}`;
    SwitchesProductDetail.mount(detail.querySelector('[data-product-detail]'),product,detailOptions);
    if (related.length) renderProductsGrid('relatedProductsGrid', related);
    syncFavoriteButtons();
  }

  function showProduct(ref, { push = true, scroll = true } = {}) {
    const product = findProduct(ref);
    if (product && SwitchesProductSections.isDigital(product) && window.SwitchesDigitalStore) {
      window.SwitchesDigitalStore.navigate(SwitchesProductSections.route(product), { push, scroll });
      return;
    }
    activate();
    productRef = ref;
    page.classList.add('is-detail');
    detail.hidden = false;
    navigate(`/?product=${encodeURIComponent(ref)}`, push);
    renderDetail();
    if (scroll) window.scrollTo({ top: 0, behavior: 'instant' });
  }

  function refresh() {
    renderFilters();
    if (!page.classList.contains('active')) return;
    if (page.classList.contains('is-detail')) renderDetail();
    else filter({ readControls: false, updateUrl: false });
  }

  function readRoute() {
    if (location.pathname !== '/' && location.pathname !== '/index.html') return;
    const query = new URLSearchParams(location.search);
    if (query.has('product')) showProduct(query.get('product'), { push: false, scroll: false });
    else if (query.get('view') === 'products') {
      for (const key of Object.keys(selected)) selected[key] = new Set(query.getAll(key));
      search.value = query.get('q') || '';
      showListing('جميع المنتجات', { push: false, scroll: false });
    } else if (page.classList.contains('active')) window.showMainPage();
  }

  function syncDrawerAccessibility() {
    sidebar.inert = mobile.matches && !drawerOpen;
  }

  function closeFilters({ restoreFocus = false } = {}) {
    if (!drawerOpen) return;
    drawerOpen = false;
    page.classList.remove('filters-open');
    sidebar.removeAttribute('role');
    sidebar.removeAttribute('aria-modal');
    document.querySelector('.catalog-filter-backdrop').hidden = true;
    document.querySelector('.catalog-filter-toggle').setAttribute('aria-expanded', 'false');
    document.querySelector('.catalog-results').inert = false;
    document.body.style.overflow = previousOverflow;
    syncDrawerAccessibility();
    if (restoreFocus) document.querySelector('.catalog-filter-toggle').focus();
  }

  function openFilters() {
    drawerOpen = true;
    previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    page.classList.add('filters-open');
    sidebar.setAttribute('role', 'dialog');
    sidebar.setAttribute('aria-modal', 'true');
    document.querySelector('.catalog-filter-backdrop').hidden = false;
    document.querySelector('.catalog-filter-toggle').setAttribute('aria-expanded', 'true');
    document.querySelector('.catalog-results').inert = true;
    syncDrawerAccessibility();
    document.querySelector('.catalog-close-filters').focus();
  }

  function initialize() {
    renderFilters();
    syncDrawerAccessibility();
    readRoute();
    document.querySelector('.catalog-filter-toggle').addEventListener('click', openFilters);
    ['.catalog-close-filters', '.catalog-apply-filters', '.catalog-filter-backdrop'].forEach(selector => document.querySelector(selector).addEventListener('click', () => closeFilters({ restoreFocus: true })));
    document.getElementById('catalogSelectedFilters').addEventListener('click', event => {
      const button = event.target.closest('button');
      if (!button) return;
      if (button.hasAttribute('data-reset-filters')) {
        Object.values(selected).forEach(values => values.clear());
        search.value = '';
      } else if (button.dataset.removeFilter === 'q') search.value = '';
      else selected[button.dataset.removeFilter]?.delete(button.dataset.value);
      renderFilters();
      filter({ readControls: false });
    });
    detail.addEventListener('click', event => {
      const link = event.target.closest('[data-catalog-listing]');
      if (link && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey) {
        event.preventDefault();
        window.showAllProducts();
      }
      const thumbnail = event.target.closest('[data-image-index]');
      if (thumbnail) {
        const product = findProduct(productRef);
        changeProductImage(product.id, product.images[Number(thumbnail.dataset.imageIndex)], thumbnail);
        detail.querySelectorAll('[data-image-index]').forEach(button => button.setAttribute('aria-pressed', String(button === thumbnail)));
      }
    });
    document.addEventListener('keydown', event => {
      if (!drawerOpen) return;
      if (event.key === 'Escape') closeFilters({ restoreFocus: true });
      if (event.key !== 'Tab') return;
      const controls = [...sidebar.querySelectorAll('button, input, summary')].filter(element => element.getClientRects().length && !element.disabled);
      const first = controls[0], last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    });
    mobile.addEventListener('change', () => { if (!mobile.matches) closeFilters(); syncDrawerAccessibility(); });
    window.addEventListener('popstate', readRoute);
    new MutationObserver(() => { if (!page.classList.contains('active')) closeFilters(); }).observe(page, { attributes: true, attributeFilter: ['class'] });
  }

  window.SwitchesCatalog = { showListing, showProduct, filter, refresh, closeFilters };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialize);
  else initialize();
})();
