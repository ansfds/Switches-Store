const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawn } = require('node:child_process');
const root = path.resolve(__dirname,'..');
const dist = path.join(root,'dist');
const port = Number(process.env.PRODUCTION_TEST_PORT || 8001);
const baseURL = `http://127.0.0.1:${port}`;
const dbDirectory = fs.mkdtempSync(path.join(os.tmpdir(),'switches-production-db-'));
const server = spawn('python',['-u','local-server.py',String(port)],{cwd:dist,windowsHide:true,env:{...process.env,SWITCHES_OFFLINE_CATALOG:'1',SWITCHES_DB_PATH:path.join(dbDirectory,'store.db')}});
let serverErrors='';
server.stderr.on('data',chunk=>{serverErrors+=chunk.toString();});
server.stdout.resume();

async function main() {
  try {
    let ready=false;
    for(let index=0;index<60;index++) {
      if(server.exitCode!==null) throw new Error(`Production server exited: ${serverErrors}`);
      try {const response=await fetch(baseURL);if(response.ok){ready=true;break;}} catch {}
      await new Promise(resolve=>setTimeout(resolve,100));
    }
    assert.ok(ready,'Production server starts');
    for(const slug of ['minecraft','subscriptions']) {
      for(const suffix of ['', '/test-product']) {
        const response=await fetch(`${baseURL}/${slug}${suffix}`);
        assert.equal(response.status,200);
        const html=await response.text();
        assert.match(html,new RegExp(`rel="canonical" href="https://www.switches-store.ly/${slug}"`));
        assert.ok(html.includes(slug==='minecraft'?'<title data-home-title="Switches Store | سويتشز ستور">Minecraft | Switches Store</title>':'الاشتراكات والمنتجات الرقمية | Switches Store'));
      }
    }
    assert.equal(fs.existsSync(path.join(dist,'.env')),false);
    assert.equal(fs.existsSync(path.join(dist,'data/switches.db')),false);
    console.log('PASS: built section and detail routes return HTTP 200; section SEO is present in HTML; runtime secrets/databases are excluded.');
    process.env.STORE_URL=baseURL;
    process.env.ISOLATED_TEST_SERVER='1';
    process.env.LOCAL_CATALOG_TEST='1';
    await require('./subscriptions.browser.cjs').main();
  } finally { server.kill(); }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
