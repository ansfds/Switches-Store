(function () {
  'use strict';
  const model = window.SwitchesProductOptions;
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const instances = new WeakMap();
  function html(product, options = {}) {
    const groups = model.groups(product), data = SwitchesProductSections.metadata(product);
    const images = (product.images || []).filter(Boolean);
    const summary = product.shortDescription || product.short_description || '';
    const benefits = product.specs?.benefits || window.SwitchesStoreSettings?.storeBenefits || [];
    const reviews = (Array.isArray(product.reviews || product.specs?.reviews) ? product.reviews || product.specs.reviews : []).filter(review => review && (review.text || review.comment));
    const specs = model.specs(product);
    const reviewSource = product.reviewUrl || product.specs?.reviewUrl;
    let reviewUrl = ''; try { const url = new URL(reviewSource); if (['http:','https:'].includes(url.protocol)) reviewUrl = url.href; } catch {}
    return `<section class="store-product-detail ${options.digital ? 'store-product-digital' : ''}" data-product-detail="${esc(product.id)}">
      <div class="store-product-layout"><div class="store-product-gallery">${options.galleryHtml || `<div class="store-product-media">${images[0] ? `<img class="${options.digital ? 'digital-detail-image' : 'detail-main-image'}" src="${esc(images[0])}" alt="${esc(product.name)}" loading="eager" fetchpriority="high" decoding="async">` : '<i class="fas fa-image store-product-no-image" aria-label="لا توجد صورة للمنتج"></i>'}</div>${images.length > 1 ? `<div class="store-product-thumbnails">${images.map((src,index) => `<button type="button" data-detail-image="${esc(src)}" aria-label="عرض الصورة ${index+1}" aria-pressed="${index === 0}"><img src="${esc(src)}" alt="" loading="lazy"></button>`).join('')}</div>` : ''}`}</div>
      <div class="store-product-summary"><div class="store-product-category">${options.category || product.category ? `<span>${esc(options.category || product.category)}</span>` : ''}${product.brand ? `<bdi>${esc(product.brand)}</bdi>` : ''}</div>
      ${product.topSellingRank?`<span class="store-product-rank">#${Number(product.topSellingRank)} الأكثر مبيعًا</span>`:''}<h1 tabindex="-1"><bdi>${esc(product.name)}</bdi></h1>${summary ? `<p class="store-product-intro">${esc(summary)}</p>` : ''}${product.condition && !options.digital ? `<span class="store-product-condition">${esc(SwitchesProductCardData.conditionLabel(product.condition))}</span>` : ''}
      ${groups.length ? `<div class="store-product-options">${groups.map(group => `<fieldset><legend>${esc(group.label)}</legend><div class="store-product-option-list">${group.values.map(value => `<button type="button" class="store-product-option" data-detail-option="${esc(group.key)}" data-value="${esc(value)}" aria-pressed="false"><bdi>${esc(value)}</bdi><span data-option-status></span></button>`).join('')}</div></fieldset>`).join('')}</div>` : ''}
      ${options.factsHtml ? `<div class="store-product-facts">${options.factsHtml}</div>` : ''}
      <div class="store-product-order ${options.digital ? 'digital-purchase' : ''}"><div class="store-product-sale"><p class="store-product-stock" role="status"></p><div class="store-product-price" aria-live="polite"></div></div>
      ${options.digital ? data.deliveryMethod ? `<p class="store-product-delivery"><i class="fas fa-paper-plane" aria-hidden="true"></i>${esc(data.deliveryMethod)}</p>` : '' : `<p class="store-product-delivery"><i class="fas fa-truck" aria-hidden="true"></i>${SwitchesProductCardData.hasFreeShipping(product) ? 'شحن مجاني' : 'تحدد رسوم التوصيل عند إتمام الطلب'}</p>`}
      <div class="store-product-benefits">${Array.isArray(benefits) ? benefits.filter(item => typeof item === 'string' && item.trim()).slice(0,4).map(item => `<span><i class="fas fa-check" aria-hidden="true"></i>${esc(item)}</span>`).join('') : ''}${typeof window.SwitchesDynamicPricing?.order === 'function' ? '<span><i class="fas fa-headset" aria-hidden="true"></i>خدمة العملاء</span>' : ''}</div>
      <div class="store-product-actions"><div class="store-product-quantity" role="group" aria-label="كمية المنتج"><button type="button" data-detail-quantity="-1" aria-label="تقليل الكمية">−</button><output aria-live="polite">1</output><button type="button" data-detail-quantity="1" aria-label="زيادة الكمية">+</button></div><button type="button" class="store-product-buy ${options.actionClass || ''}" data-detail-purchase><i class="${options.quote ? 'fab fa-whatsapp' : 'fas fa-cart-plus'}" aria-hidden="true"></i><span></span></button>${typeof renderFavoriteButton === 'function' && options.favorite !== false ? renderFavoriteButton(product) : ''}</div>
      ${options.quote ? '<p class="store-product-order-note">تواصل معنا لمعرفة السعر الحالي وإتمام الطلب.</p>' : ''}${reviewUrl ? `<a class="store-product-review-link" href="${esc(reviewUrl)}" target="_blank" rel="noopener noreferrer"><i class="fas fa-circle-play" aria-hidden="true"></i>مشاهدة مراجعة المنتج</a>` : ''}</div></div></div>
      ${data.features.length ? `<section class="store-product-section"><h2>مميزات المنتج</h2><ul class="digital-features">${data.features.map(feature => `<li><i class="fas fa-check" aria-hidden="true"></i>${esc(feature)}</li>`).join('')}</ul></section>` : ''}
      ${product.description ? `<section class="store-product-section"><h2>عن المنتج</h2><p>${esc(product.description)}</p></section>` : ''}
      ${specs.length ? `<section class="store-product-section"><h2>المواصفات والتفاصيل</h2><dl class="store-product-specs">${specs.map(([key,value]) => `<div><dt>${esc(key)}</dt><dd><bdi>${esc(value)}</bdi></dd></div>`).join('')}</dl></section>` : ''}
      ${reviews.length ? `<section class="store-product-section"><h2>مراجعات العملاء <span>(${reviews.length})</span></h2><div class="store-product-reviews">${reviews.map(review => `<article>${review.author ? `<strong>${esc(review.author)}</strong>` : ''}${Number(review.rating)>0 && Number(review.rating)<=5 ? `<span aria-label="التقييم ${Number(review.rating)} من 5">${Number(review.rating)} / 5 <i class="fas fa-star" aria-hidden="true"></i></span>` : ''}<p>${esc(review.text || review.comment)}</p></article>`).join('')}</div></section>` : ''}</section>`;
  }
  function mount(root, product, options = {}) {
    instances.get(root)?.abort();
    const abort = new AbortController(); instances.set(root,abort);
    const variants = model.variants(product);
    let variant = variants.find(row => row.id === String(options.initialVariant)) || variants.find(row => model.inventory(product,row).available) || variants[0] || null;
    let selection = {...variant?.options}, quantity = 1;
    function setImage(src) {
      const image = root.querySelector('.store-product-media img,.gift-platform-art img');
      if (!image || !src) return;
      image.hidden = false;
      image.parentElement.classList.remove('image-unavailable');
      image.src = src;
    }
    function selectedProduct() {
      const metadata = SwitchesProductSections.metadata(product);
      for (const key of ['platform','region','duration','edition','activationMethod','activationCountry']) if (selection[key]) metadata[key] = selection[key];
      return { ...product, digital:metadata, ...(variant ? { price:variant.price ?? product.price, oldPrice:variant.oldPrice ?? variant.old_price ?? product.oldPrice } : {}), selectedOptions:{...selection}, selectedVariantId:variant?.id || null, quantity };
    }
    function update(changed = false) {
      variant = model.resolve(product,selection);
      const inventory = model.inventory(product,variant), selected = selectedProduct();
      quantity = Math.max(1,Math.min(quantity,inventory.limit || 1/0));
      const status = root.querySelector('.store-product-stock');
      status.className = `store-product-stock ${inventory.available ? 'is-available' : 'is-unavailable'}`;
      status.textContent = inventory.available ? `متوفر${inventory.limit !== null ? ` · ${inventory.limit} في المخزون` : ''}` : (product.availability === 'comingSoon' ? 'قريبًا' : 'غير متوفر');
      const price = root.querySelector('.store-product-price');
      if (options.quote) price.innerHTML = SwitchesDynamicPricing.html(options.priceClass || '');
      else {
        const current = Number(selected.price), old = Number(selected.oldPrice), discount = SwitchesProductSections.discount(selected);
        price.innerHTML = selected.price != null && Number.isFinite(current) ? `<strong><bdi>${formatPrice(current)}</bdi></strong>${discount ? `<del><bdi>${formatPrice(old)}</bdi></del><span class="store-product-discount">-${discount}%</span>` : ''}` : '';
      }
      root.querySelectorAll('[data-detail-option]').forEach(button => {
        const key = button.dataset.detailOption, value = button.dataset.value;
        const possible = variants.some(row => row.options[key] === value && Object.entries(selection).every(([other,chosen]) => other === key || row.options[other] === chosen) && model.inventory(product,row).available);
        button.setAttribute('aria-pressed',String(selection[key] === value));
        button.querySelector('[data-option-status]').textContent = possible ? 'متوفر' : 'غير متوفر';
        button.classList.toggle('option-unavailable',!possible);
      });
      const buy = root.querySelector('[data-detail-purchase]'); buy.disabled = !inventory.available;
      buy.querySelector('span').textContent = inventory.available ? `${options.quote ? 'اطلب الآن' : 'أضف إلى السلة'} (${quantity})` : status.textContent;
      root.querySelector('.store-product-quantity output').textContent = quantity;
      root.querySelector('[data-detail-quantity="-1"]').disabled = !inventory.available || quantity <= 1;
      root.querySelector('[data-detail-quantity="1"]').disabled = !inventory.available || (inventory.limit !== null && quantity >= inventory.limit);
      if (changed) {
        const src = variant?.images?.[0] || variant?.image || product.images?.[0];
        setImage(src);
        options.onVariant?.(variant,selection);
      }
    }
    root.addEventListener('click',event => {
      const option = event.target.closest('[data-detail-option]');
      if (option) { selection[option.dataset.detailOption] = option.dataset.value; update(true); }
      const step = event.target.closest('[data-detail-quantity]');
      if (step && !step.disabled) { quantity += Number(step.dataset.detailQuantity); update(); }
      const thumbnail = event.target.closest('[data-detail-image]');
      if (thumbnail) { setImage(thumbnail.dataset.detailImage); root.querySelectorAll('[data-detail-image]').forEach(button => button.setAttribute('aria-pressed',String(button === thumbnail))); }
      const purchase = event.target.closest('[data-detail-purchase]');
      if (purchase && !purchase.disabled) {
        const inventory = model.inventory(product,variant); if (!inventory.available) return;
        if (options.onOrder) options.onOrder({ product:selectedProduct(), quantity, variant, selection:{...selection} });
        else if (options.quote) SwitchesDynamicPricing.order(selectedProduct());
        else addToCart(product.id,selection.color || null,{quantity,variantId:variant?.id,selection});
      }
    },{signal:abort.signal});
    root.addEventListener('error',event => { if (event.target.matches('.store-product-media img')) { event.target.hidden = true; root.querySelector('.store-product-media').classList.add('image-unavailable'); } },{capture:true,signal:abort.signal});
    update();
  }
  window.SwitchesProductDetail = Object.freeze({ html,mount });
})();
