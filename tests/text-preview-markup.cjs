// Intercepted feedback with real line-break headings; no WordPress or service writes.
const {chromium}=require('playwright'),fs=require('node:fs'),assert=require('node:assert/strict');
(async()=>{const browser=await chromium.launch({channel:'chrome',headless:true});try{
 const base='https://feedbackpress.test',original='Good bread.\nSlow mornings.',proposed='Your daily bread. A slower kind of morning.';
 const items=[
  {id:'11111111-1111-4111-8111-111111111111',number:1,title:'Heading suggestion',body:'Please update the headline.',target:{selector:'#target',text:original,x:.5,y:.5,text_change:{original,proposed}}},
  {id:'22222222-2222-4222-8222-222222222222',number:2,title:'Plain suggestion',body:'Update this too.',target:{selector:'#plain',text:'Plain original.',x:.5,y:.5,text_change:{original:'Plain original.',proposed:'Plain proposed.'}}},
  {id:'33333333-3333-4333-8333-333333333333',number:3,title:'Rich content stays protected',body:'No flattening.',target:{selector:'#rich',text:'Keep rich formatting.',x:.5,y:.5,text_change:{original:'Keep rich formatting.',proposed:'Incorrect flattening.'}}}
 ].map(i=>({...i,author:'Reviewer',status:'todo',path:'/',revision:1,target_revision:1,activity:[],files:[],created_at:'2026-11-20T12:00:00Z'}));
 const context=await browser.newContext({viewport:{width:1280,height:900},reducedMotion:'reduce'});let release;const held=new Promise(resolve=>{release=resolve});
 await context.route(base+'/**',async route=>{const req=route.request(),u=new URL(req.url());
  if(u.pathname.endsWith('.css'))return route.fulfill({contentType:'text/css',body:fs.readFileSync('assets/review.css','utf8')});
  if(u.pathname.endsWith('.woff2'))return route.fulfill({contentType:'font/woff2',body:fs.readFileSync('assets/fonts/InterVariable.woff2')});
  if(u.pathname==='/api/issues')return route.fulfill({json:{issues:items,total:3,page:1}});
  if(u.pathname.startsWith('/api/issues/')){if(u.pathname.endsWith('/notes'))return route.fulfill({json:{notes:[]}});await held;return route.fulfill({json:items.find(i=>u.pathname.includes(i.id))});}
  if(u.pathname.startsWith('/api/'))return route.fulfill({json:{}});
  return route.fulfill({contentType:'text/html',body:`<!doctype html><meta charset="utf-8"><style>body{padding:80px;font:18px/1.5 sans-serif}h1{width:420px}</style><h1 id="target">Good bread.<br>\nSlow mornings.</h1><p id="plain">Plain original.</p><p id="rich">Keep <strong>rich formatting.</strong></p><script>window.originalHeadingMarkup=document.querySelector('#target').innerHTML;window.originalHeadingNodes=[...document.querySelector('#target').childNodes];window.FeedbackPressConfig={api:'${base}/api/',home:'${base}',css:'${base}/review.css',nonce:'fixture',userName:'Reviewer',maxBytes:5242880};</script><script>${fs.readFileSync('assets/review.js','utf8')}</script>`});
 });
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(base);
 const pin=page.locator(`[data-pin-issue="${items[0].id}"]`),toggle=page.getByRole('button',{name:'Show text changes',exact:true});await pin.waitFor();
 assert.equal(await page.locator('#target').textContent(),proposed,'A saved suggestion previews a heading containing a BR');
 assert.equal(await page.locator('#plain').textContent(),'Plain proposed.');assert.equal(await page.locator('#rich').innerHTML(),'Keep <strong>rich formatting.</strong>');
 await page.getByRole('button',{name:'View issues',exact:true}).click();await page.locator('.issue-open').first().waitFor();
 assert.equal(await page.evaluate(()=>{const r=document.querySelector('#feedbackpress-root').shadowRoot;r.querySelector('.issue-open').click();return r.querySelector('.pin').classList.contains('is-selected')}),true,'Selection ring appears synchronously for a cached ticket before its held read');
 for(let n=0;n<4;n++){
  await toggle.click();assert.equal(await page.locator('#target').textContent(),original);
  assert.equal(await page.locator('#target').evaluate(node=>node.innerHTML===window.originalHeadingMarkup&&[...node.childNodes].every((child,i)=>child===window.originalHeadingNodes[i])),true,'Restores the exact original heading nodes and BR');
  assert.equal(await page.locator('#plain').textContent(),'Plain original.');assert.equal(await pin.evaluate(n=>n.classList.contains('is-selected')),true);
  await toggle.click();assert.equal(await page.locator('#target').textContent(),proposed);assert.equal(await pin.evaluate(n=>n.classList.contains('is-selected')),true);
  assert.ok(await page.evaluate(()=>CSS.highlights.get('feedbackpress-replacements')?.size>0));
 }
 release();await page.getByRole('button',{name:'Dismiss issue',exact:true}).click();assert.equal(await pin.evaluate(n=>n.classList.contains('is-selected')),false);
 await toggle.click();assert.equal(await page.evaluate(()=>CSS.highlights.has('feedbackpress-replacements')),false);
 // Direct editing of a line-break heading cancels back to the same original DOM.
 await page.keyboard.press('t');await page.locator('#target').click({position:{x:10,y:10}});
 const replacement=page.getByRole('textbox',{name:'Change text to',exact:true});await replacement.waitFor();assert.equal(await replacement.inputValue(),original);await replacement.fill('Another bakery morning.');assert.equal(await page.locator('#target').textContent(),'Another bakery morning.');await page.keyboard.press('Escape');
 assert.equal(await page.locator('#target').evaluate(node=>node.innerHTML===window.originalHeadingMarkup&&[...node.childNodes].every((child,i)=>child===window.originalHeadingNodes[i])),true);
 await page.getByRole('button',{name:'View issues',exact:true}).click();await toggle.click();assert.equal(await page.locator('#target').textContent(),proposed);
 await page.locator('#target').evaluate(node=>{node.replaceChildren(Object.assign(document.createElement('span'),{textContent:node.textContent}));});
 await toggle.click();assert.equal(await page.locator('#target span').textContent(),proposed,'A concurrent host markup change with the same words is preserved');
 assert.deepEqual(errors,[]);console.log('PASS BR heading previews, exact DOM restoration across toggles and edit cancellation, plain/rich safeguards, word highlights, immediate cached selection ring and independent preview state.');
}finally{await browser.close()}})().catch(error=>{console.error(error);process.exitCode=1});
