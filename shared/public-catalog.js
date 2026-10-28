(function(){
  'use strict';
  let pending;
  async function read(path){
    const response=await fetch(path,{cache:'no-store'});
    if(!response.ok){const error=await response.json().catch(()=>({}));throw new Error(error.detail || `Catalog request failed: ${response.status}`);}
    return response.json();
  }
  window.SwitchesPublicCatalog={
    loadBootstrap(){if(!pending)pending=read('/api/public/bootstrap').then(data=>{window.SwitchesCatalogSections=data.sections || [];window.SwitchesStoreSettings={...(window.SwitchesStoreSettings || {}),...data.settings};window.dispatchEvent(new CustomEvent('switches:settings-changed'));window.dispatchEvent(new CustomEvent('switches:sections-changed'));return data;}).finally(()=>{pending=null;});return pending;},
    loadGiftCards:()=>read('/api/public/gift-cards').then(data=>data.platforms),
    loadSubscriptions:()=>read('/api/public/subscriptions'),
  };
})();
