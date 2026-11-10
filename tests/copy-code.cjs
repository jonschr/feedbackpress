// First run wp eval-file tests/render-admin.php; all HTTP and clipboard operations stay inside this fixture.
const {chromium,webkit}=require('playwright'),fs=require('node:fs'),assert=require('node:assert/strict');
const fixture=process.env.FEEDBACKPRESS_ADMIN_FIXTURE||'/tmp/feedbackpress-copy-admin.html',code='fp1:'+Buffer.from(JSON.stringify({format:1,ticket:'fixture-only',expires:2000000000})).toString('base64');
(async()=>{const engine=process.env.FEEDBACKPRESS_BROWSER==='webkit'?webkit:chromium;
const browser=await engine.launch(engine===chromium?{channel:'chrome',headless:true}:{headless:true,...(process.env.FEEDBACKPRESS_WEBKIT_PATH?{executablePath:process.env.FEEDBACKPRESS_WEBKIT_PATH}:{})});
try{for(const mode of ['gesture','denied','legacy','unavailable','server-error','html-error','url-response','reconnect']){
const context=await browser.newContext(),page=await context.newPage(),errors=[];let calls=0,payload,release;const responseReady=new Promise(resolve=>{release=resolve});
page.on('pageerror',e=>errors.push(e.message));
await context.addInitScript(mode=>{
 window.fixtureClipboard='https://previous-clipboard.example/';window.fixtureClipboardCalls=[];window.fixtureGesture=false;
 document.addEventListener('click',()=>{window.fixtureGesture=true;setTimeout(()=>{window.fixtureGesture=false},0)},true);
 const denied=()=>Promise.reject(new DOMException('Clipboard blocked','NotAllowedError'));
 Object.defineProperty(navigator,'clipboard',{configurable:true,value:mode==='unavailable'?undefined:{
  write(items){window.fixtureClipboardCalls.push({method:'write',gesture:window.fixtureGesture});if(!window.fixtureGesture||mode==='denied')return denied();return items[0].getType('text/plain').then(blob=>blob.text()).then(text=>{window.fixtureClipboard=text})},
  writeText(text){window.fixtureClipboardCalls.push({method:'writeText',gesture:window.fixtureGesture});if(mode!=='legacy'&&!window.fixtureGesture)return denied();window.fixtureClipboard=text;return Promise.resolve()}
 }});
 if(mode==='legacy')Object.defineProperty(window,'ClipboardItem',{configurable:true,value:undefined});
},mode);
await context.route('https://feedbackpress.test/**',async r=>{const path=new URL(r.request().url()).pathname;
 if(path==='/admin.js')return r.fulfill({contentType:'text/javascript',body:fs.readFileSync(process.env.FEEDBACKPRESS_ADMIN_SCRIPT||'assets/admin.js','utf8')});
 if(path==='/adminapi/network/code'){calls++;payload=r.request().postDataJSON();await responseReady;if(mode==='server-error')return r.fulfill({status:403,json:{message:'This installation is not a network member.'}});if(mode==='html-error')return r.fulfill({status:403,contentType:'text/html',body:'<h1>Forbidden</h1>'});return r.fulfill({json:{code:mode==='url-response'?'https://wrong-response.example/':code}})}
 if(path==='/adminapi/sync/activity')return r.fulfill({json:{state:'cooldown'}});
 if(path==='/adminapi/sync/log')return r.fulfill({json:[]});
 return r.fulfill({contentType:'text/html',body:fs.readFileSync(fixture,'utf8')});
});
await page.goto('https://feedbackpress.test/settings');const button=mode==='reconnect'?page.locator('.fp-provision-peer').first():page.locator('#fp-copy-network'),status=page.locator('#fp-copy-status'),field=page.locator('#fp-network-code');
await button.click();assert.equal(await status.textContent(),'Preparing connection code…');assert.equal(await button.isDisabled(),true);await button.evaluate(e=>e.click());release();
if(['gesture','legacy','reconnect'].includes(mode)){
 await page.getByRole('button',{name:'Code copied',exact:true}).waitFor();assert.equal(await page.evaluate(()=>window.fixtureClipboard),code);assert.equal(await field.inputValue(),code);assert.equal(await field.isVisible(),false);
 if(mode!=='legacy')assert.equal(await page.evaluate(()=>window.fixtureClipboardCalls[0].gesture),true);
 if(mode==='reconnect')assert.match(payload.provision,/^[a-f0-9-]{36}$/);
}else if(['denied','unavailable'].includes(mode)){
 await field.waitFor();assert.equal(await field.inputValue(),code);assert.match(await status.textContent(),/Automatic copying was blocked/);assert.equal(await field.evaluate(e=>e.selectionEnd-e.selectionStart),code.length);
}else{
 await page.waitForFunction(()=>!document.querySelector('#fp-copy-network').disabled);assert.equal(await field.isVisible(),false);assert.equal(await field.inputValue(),'');assert.match(await status.textContent(),mode==='server-error'?/not a network member/:mode==='html-error'?/HTTP 403/:/valid connection code/);
}
if(!['gesture','legacy','reconnect'].includes(mode))assert.equal(await page.evaluate(()=>window.fixtureClipboard),'https://previous-clipboard.example/');
assert.equal(calls,1);assert.deepEqual(errors,[],mode);await context.close();console.log('PASS '+mode+': clipboard value, feedback, fallback/error state, and single request.');
}}finally{await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1});
