const assert = require('node:assert/strict');
const {test} = require('node:test');
const model = require('../shared/product-options.js');
const filters = require('../shared/digital-filters.js');
const product = {availability:'available',stockQty:5,trackStock:true,specs:{_productOptions:{variants:[
  {id:'white-1',options:{color:'White',capacity:'1 TB'},stockQty:2,price:365},
  {id:'white-2',options:{color:'White',capacity:'2 TB'},stockQty:0,price:400},
  {id:'black-2',options:{color:'Black',capacity:'2 TB'},stockQty:8,price:390},
]}}};
test('generic options resolve actual combinations and reject nonexistent combinations',()=>{
  assert.deepEqual(model.groups(product).map(group=>group.key),['color','capacity']);
  assert.equal(model.resolve(product,{color:'Black',capacity:'1 TB'}),null);
  assert.equal(model.resolve(product,{color:'Black',capacity:'2 TB'}).id,'black-2');
  assert.equal(model.inventory(product,model.resolve(product,{color:'White',capacity:'2 TB'})).available,false);
});
test('stock honors variant and product limits, zero, and disabled stock tracking',()=>{
  assert.equal(model.inventory(product,model.variants(product)[0]).limit,2);
  assert.equal(model.inventory(product,model.variants(product)[2]).limit,5);
  assert.equal(model.inventory({...product,availability:'unavailable'},model.variants(product)[0]).available,false);
  assert.equal(model.stock({stockQty:0,trackStock:false}),null);
  assert.equal(model.stock({stockQty:0,trackStock:true}),0);
  assert.equal(model.stock({}),null);
});
test('missing options stay absent and legacy colors come from stored data',()=>{
  assert.deepEqual(model.groups({name:'No options'}),[]);
  assert.equal(model.variants({specs:{colors:[{name:'Blue',available:false}]}})[0].options.color,'Blue');
  assert.deepEqual(model.specs({specs:{_productOptions:{},variants:[],empty:'',RAM:'32 GB',list:['a','b'],object:{secret:'hidden'}}}),[['RAM','32 GB'],['list','a · b']]);
});
test('facets combine with AND across groups, OR within each group',()=>{
  const facets=[{key:'platform',value:row=>row.platform},{key:'type',value:row=>row.types},{key:'region',value:row=>row.region}];
  const selected={platform:new Set(['Gemini','Canva']),type:new Set(['Activation Link']),region:new Set(['GLOBAL'])};
  assert.equal(filters.matches({platform:'Gemini',types:['Account','Activation Link'],region:'GLOBAL'},facets,selected),true);
  assert.equal(filters.matches({platform:'Gemini',types:['Invitation Link'],region:'GLOBAL'},facets,selected),false);
  assert.equal(filters.matches({platform:'Gemini',types:['Activation Link'],region:'BRAZIL'},facets,selected),false);
});
