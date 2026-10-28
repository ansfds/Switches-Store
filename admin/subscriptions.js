(function () {
  'use strict';
  const model = window.SwitchesProductSections;
  let sessionToken = '';
  let products = [];
  const families = { gemini: 'Google AI / Gemini', chatgpt: 'ChatGPT', canva: 'Canva', capcut: 'CapCut', microsoft: 'Microsoft', claude: 'Claude', other: 'أخرى' };
  async function request(path, options = {}) {
    if (/^\/api\/admin\/products/.test(path)) path = path.replace('/api/admin/products', '/api/local-admin/subscriptions');
    if (!sessionToken) {
      const response = await fetch('/api/local-admin/session', { headers: { 'X-Switches-Local': '1' } });
      if (!response.ok) throw new Error('الإدارة المحلية متاحة من خادم المشروع على هذا الجهاز فقط.');
      sessionToken = (await response.json()).token;
    }
    const response = await fetch(path.replace('/api/admin/', '/api/local-admin/'), { ...options, headers: { 'Content-Type': 'application/json', 'X-Switches-Local': '1', 'X-Local-Token': sessionToken, ...(options.headers || {}) } });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'تعذر حفظ البيانات المحلية.');
    return data;
  }
  titles.subscriptions = 'الاشتراكات';
  const navButton = document.createElement('button');
  navButton.className = 'nav-btn'; navButton.dataset.section = 'subscriptions';
  navButton.innerHTML = '<i class="fas fa-layer-group"></i><span>الاشتراكات</span>';
  document.querySelector('[data-section="products"]').after(navButton);
  const panel = document.createElement('section'); panel.className = 'section-panel'; panel.id = 'section-subscriptions';
  panel.innerHTML = `<article class="panel-card"><div class="panel-head split"><div><h3>الاشتراكات والمنتجات الرقمية</h3><p>كتالوج محلي للمراجعة. الأسعار الداخلية لا تُرسل للزائر.</p></div><button id="addSubscriptionBtn" class="btn primary" type="button"><i class="fas fa-plus"></i> إضافة منتج</button></div><div class="filters-row"><input id="subscriptionAdminSearch" placeholder="بحث بالاسم أو المنصة أو المنطقة"><select id="subscriptionAdminFamily"><option value="">كل التصنيفات</option>${Object.entries(families).map(([key,label]) => `<option value="${key}">${label}</option>`).join('')}</select></div><div class="table-wrap"><table><thead><tr><th>المنتج</th><th>التفعيل والمدة</th><th>المنطقة</th><th>الحالة</th><th>الترتيب</th><th>تحكم</th></tr></thead><tbody id="subscriptionsBody"></tbody></table></div></article><article class="panel-card subscription-notice-settings"><div class="panel-head"><div><h3>النص البديل للسعر</h3><p>يظهر في الاشتراكات وGift Cards. لا يؤثر على أسعار PC Parts أو Minecraft.</p></div></div><form id="dynamicPriceNoticeForm" class="stack-form"><label><span>dynamic_price_notice</span><textarea name="dynamic_price_notice" rows="2" maxlength="400" required></textarea></label><button class="btn primary" type="submit">حفظ النص</button></form></article>`;
  document.querySelector('.main-panel').append(panel);
  const localButton = document.createElement('button'); localButton.type = 'button'; localButton.className = 'btn ghost local-catalog-entry'; localButton.id = 'localCatalogAdminBtn'; localButton.textContent = 'إدارة الاشتراكات وGift Cards محليًا';
  document.querySelector('.auth-card').append(localButton);

  function render() {
    const term = document.getElementById('subscriptionAdminSearch').value.trim().toLowerCase();
    const family = document.getElementById('subscriptionAdminFamily').value;
    const list = products.filter(product => {
      const data = model.metadata(product);
      return (!family || data.family === family) && (!term || [product.name,data.platform,data.region,data.activationMethod].join(' ').toLowerCase().includes(term));
    });
    document.getElementById('subscriptionsBody').innerHTML = list.map(product => {
      const data = model.metadata(product);
      return `<tr><td><div class="subscription-admin-product"><img src="${esc(product.images?.[0] || '/assets/subscriptions/placeholder.svg')}" alt="" onerror="this.onerror=null;this.src='/assets/subscriptions/placeholder.svg'"><div><strong>${esc(product.name)}</strong><small>${esc(product.slug)}${data.featured ? ' · ★' : ''}</small></div></div></td><td><bdi>${esc(data.activationMethod || '—')}</bdi><br><small>${esc(data.duration)}</small></td><td><bdi>${esc(data.region || 'غير محددة')}</bdi></td><td>${badge(({available:'متوفر',comingSoon:'قريبًا',unavailable:'غير متوفر',hidden:'مخفي'})[product.availability],product.availability==='available'?'good':'')}</td><td>${product.sortOrder || 0}</td><td><div class="row-actions"><button class="btn small" data-subscription-edit="${product.id}">تعديل</button><button class="btn small ghost" data-subscription-hide="${product.id}">${product.availability==='hidden'?'إظهار':'إخفاء'}</button><button class="btn small ghost danger-text" data-subscription-delete="${product.id}">حذف</button></div></td></tr>`;
    }).join('') || '<tr><td colspan="6">لا توجد منتجات.</td></tr>';
  }
  async function load() {
    const controls=[...panel.querySelectorAll('input,textarea,select,button')];
    controls.forEach(control=>{control.disabled=true;});
    try {
      products = await request('/api/local-admin/subscriptions');
      const settings = await request('/api/local-admin/settings');
      document.querySelector('#dynamicPriceNoticeForm [name="dynamic_price_notice"]').value = settings.dynamic_price_notice || '';
      if (window.localCatalogMode) { state.settings = settings; state.giftCards = await request('/api/local-admin/gift-cards'); renderGiftCardsAdmin(); }
      render();
    } finally { controls.forEach(control=>{control.disabled=false;}); }
  }
  async function enterLocal() {
    try {
      await request('/api/local-admin/settings');
      window.localCatalogMode = true;
      state.me = { username: 'النسخة المحلية', role: 'local' };
      showApp(); switchSection('subscriptions'); await load();
      document.querySelector('#section-gift-cards .panel-head p').textContent = 'نسخة محلية للفئات والأسعار الداخلية، دون كتابة إلى Supabase.';
    } catch (error) { toast(error.message, true); }
  }
  function editor(id) {
    const original = products.find(product => product.id === Number(id));
    const product = original || { name:'',slug:'',brand:'',images:[],description:'',sortOrder:0,availability:'unavailable',status:'published',isActive:true,specs:{_switchesDigital:{categoryType:'SUBSCRIPTION',productType:'SUBSCRIPTION',family:'other'}} };
    const data = model.metadata(product);
    const input = (name,label,value,extra='') => `<label ${extra}><span>${label}</span><input name="${name}" value="${esc(value)}"></label>`;
    const options = (values,current) => Object.entries(values).map(([key,label])=>`<option value="${key}" ${key===current?'selected':''}>${label}</option>`).join('');
    openModal(original?'تعديل الاشتراك':'إضافة منتج رقمي',`<div class="form-grid three">
      ${input('productName','اسم المنتج',product.name,'class="full"')}${input('productSlug','Slug',product.slug)}
      <label><span>التصنيف / الخدمة</span><select name="family">${options(families,data.family)}</select></label>${input('catalogCategory','الفئة (AI، تصميم، مونتاج، برامج، أخرى)',data.catalogCategory)}
      ${input('brand','Brand',product.brand)}${input('platform','المنصة',data.platform)}
      <label><span>نوع المنتج</span><select name="productType">${options(model.TYPES,data.productType)}</select></label>
      ${input('duration','المدة',data.duration,'data-duration-field')}${input('activationMethod','طريقة التفعيل',data.activationMethod)}${input('region','الريجن (اتركه فارغًا إذا لم يتأكد)',data.region)}${input('activationCountry','بلد التفعيل',data.activationCountry)}${input('deliveryMethod','طريقة التسليم',data.deliveryMethod)}
      <label><span>التوفر</span><select name="availability">${options({available:'متوفر',comingSoon:'قريبًا',unavailable:'غير متوفر',hidden:'مخفي'},product.availability)}</select></label>
      ${input('sortOrder','Sort Order',product.sortOrder || 0)}<label><span>Featured</span><input name="featured" type="checkbox" ${data.featured?'checked':''}></label>
      ${input('imageUrl','Image URL',product.images?.[0] || '','class="full"')}<img class="subscription-admin-preview full" src="${esc(product.images?.[0] || '/assets/subscriptions/placeholder.svg')}" alt="معاينة الصورة">
      <label class="full"><span>الوصف</span><textarea name="description" rows="4">${esc(product.description)}</textarea></label>
      <label class="full" data-bundle-field><span>الخدمات داخل الباقة (كل سطر: اسم الخدمة | مدتها إن كانت معروفة)</span><textarea name="bundleServices" rows="3">${esc(data.bundleServices.map(item=>`${item.name}${item.duration?' | '+item.duration:''}`).join('\n'))}</textarea></label>
      ${input('seoTitle','SEO Title',product.seoTitle || '','class="full"')}<label class="full"><span>Meta Description</span><textarea name="metaDescription" rows="2">${esc(product.metaDescription || '')}</textarea></label>
      <fieldset class="full digital-editor-fields"><legend>بيانات داخلية للمكتب فقط</legend><div class="form-grid">${input('internalCost','التكلفة الداخلية (اختياري)',product.internalCost ?? '')}${input('internalReferencePrice','السعر المرجعي الداخلي (اختياري)',product.internalReferencePrice ?? '')}<label class="full"><span>ملاحظة داخلية — لا تحفظ كلمات مرور أو مفاتيح أو جلسات</span><textarea name="internalNote" rows="2">${esc(product.internalNote || '')}</textarea></label></div></fieldset>
      <div class="full row-actions"><button class="btn primary" type="submit">حفظ المنتج</button>${original?`<a class="btn ghost" href="${model.route(product)}" target="_blank" rel="noopener">معاينة المنتج</a>`:''}</div></div>`,async event=>{
      event.preventDefault(); const form=event.currentTarget; const value=name=>form.elements[name].value.trim();
      const meta={...data,categoryType:'SUBSCRIPTION',family:value('family'),catalogCategory:value('catalogCategory'),platform:value('platform'),productType:value('productType'),duration:value('duration'),activationMethod:value('activationMethod'),region:value('region'),activationCountry:value('activationCountry'),deliveryMethod:value('deliveryMethod'),featured:form.elements.featured.checked,bundleServices:value('bundleServices').split('\n').map(line=>{const [name,duration='']=line.split('|');return {name:name.trim(),duration:duration.trim()};}).filter(item=>item.name)};
      const payload={...product,name:value('productName'),slug:value('productSlug'),brand:value('brand'),category:value('catalogCategory'),images:value('imageUrl')?[value('imageUrl')]:[],description:value('description'),availability:value('availability'),sortOrder:Number(value('sortOrder'))||0,seoTitle:value('seoTitle'),metaDescription:value('metaDescription'),internalCost:value('internalCost'),internalReferencePrice:value('internalReferencePrice'),internalNote:value('internalNote'),specs:model.storeMetadata(product.specs,meta)};
      try { await request('/api/local-admin/subscriptions'+(original?'/'+product.id:''),{method:original?'PUT':'POST',body:JSON.stringify(payload)});closeModal();await load();toast('تم حفظ المنتج محليًا'); } catch(error) { toast(error.message,true); }
    });
    const form=document.getElementById('modalForm');
    for(const name of ['productName','productSlug']) form.elements[name].required=true;
    for(const name of ['internalCost','internalReferencePrice']) { form.elements[name].type='number'; form.elements[name].min='0'; form.elements[name].step='.01'; }
    form.elements.sortOrder.type='number';
    const sync=()=>{ form.querySelector('[data-bundle-field]').hidden=form.elements.productType.value!=='BUNDLE'; form.querySelector('[data-duration-field]').hidden=['KEY','SERVICE'].includes(form.elements.productType.value)&&!form.elements.duration.value; };
    form.elements.productType.addEventListener('change',sync);sync();
    form.elements.productName.addEventListener('input',()=>{if(!original&&!form.elements.productSlug.dataset.edited)form.elements.productSlug.value=slugSuggestion(form.elements.productName.value);});
    form.elements.productSlug.addEventListener('input',()=>{form.elements.productSlug.dataset.edited='1';});
    const image=form.querySelector('.subscription-admin-preview');image.onerror=()=>{image.onerror=null;image.src='/assets/subscriptions/placeholder.svg';};
    form.elements.imageUrl.addEventListener('input',()=>{image.src=form.elements.imageUrl.value||'/assets/subscriptions/placeholder.svg';});
  }
  navButton.addEventListener('click',async()=>{switchSection('subscriptions');try{await load();}catch(error){toast(error.message,true);}});
  localButton.addEventListener('click',enterLocal);
  const giftEditor=window.openGiftCardEditor;
  window.openGiftCardEditor=function(...args){const result=giftEditor(...args);if(window.localCatalogMode)for(const id of ['giftCardImageUpload','giftCardBgUpload'])document.getElementById(id)?.closest('label')?.setAttribute('hidden','');return result;};
  document.getElementById('addSubscriptionBtn').addEventListener('click',()=>editor());
  document.getElementById('subscriptionAdminSearch').addEventListener('input',render);
  document.getElementById('subscriptionAdminFamily').addEventListener('change',render);
  panel.addEventListener('click',async event=>{
    const edit=event.target.closest('[data-subscription-edit]');if(edit){editor(edit.dataset.subscriptionEdit);return;}
    const hide=event.target.closest('[data-subscription-hide]');const remove=event.target.closest('[data-subscription-delete]');
    if(!hide&&!remove)return;
    const id=Number((hide||remove).dataset[hide?'subscriptionHide':'subscriptionDelete']);const item=products.find(product=>product.id===id);
    try{if(remove){await request('/api/local-admin/subscriptions/'+id,{method:'DELETE'});}else{await request('/api/local-admin/subscriptions/'+id,{method:'PUT',body:JSON.stringify({...item,availability:item.availability==='hidden'?'unavailable':'hidden'})});}await load();toast(remove?'تم حذف المنتج محليًا':'تم تحديث حالة المنتج');}catch(error){toast(error.message,true);}
  });
  document.getElementById('dynamicPriceNoticeForm').addEventListener('submit',async event=>{event.preventDefault();try{await request('/api/local-admin/settings',{method:'PUT',body:JSON.stringify({dynamic_price_notice:event.currentTarget.elements.dynamic_price_notice.value})});toast('تم حفظ النص المشترك');}catch(error){toast(error.message,true);}});
  window.SwitchesLocalAdmin={request,load,editor,handles:(path,options={})=>{
    if(window.localCatalogMode&&/^\/api\/admin\/(gift-cards|gift-card-denominations|settings)(\/|$)/.test(path))return true;
    if(/^\/api\/admin\/products/.test(path)&&['POST','PUT'].includes(options.method)){try{return model.metadata(JSON.parse(options.body)).categoryType==='SUBSCRIPTION';}catch{return false;}}
    return false;
  }};
})();
