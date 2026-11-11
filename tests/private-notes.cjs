// Intercepted WordPress gateway; no provider or customer writes.
const {chromium}=require('playwright'),fs=require('node:fs'),assert=require('node:assert/strict');
(async()=>{const browser=await chromium.launch({channel:'chrome',headless:true});try{
 const context=await browser.newContext({viewport:{width:1280,height:900}}),base='https://feedbackpress.test';
 const issue={id:'11111111-1111-4111-8111-111111111111',number:1,title:'Privacy regression',body:'Shared text',author:'Reviewer',status:'todo',revision:1,path:'/',activity:[],files:[],target:{selector:'#target',x:.5,y:.5},created_at:'2026-11-11T12:00:00Z'};
 const note={id:'22222222-2222-4222-8222-222222222222',body:'Owner-only secret',author_kind:'agent',agent:'Fixture',author_name:'Reviewer',revision:1};
 let mode='owner',privateWrites=0,sharedWrites=0,reads=0,release;
 await context.route(base+'/**',async route=>{const req=route.request(),url=new URL(req.url()),path=url.pathname;
  if(path.endsWith('.css'))return route.fulfill({contentType:'text/css',body:fs.readFileSync('assets/review.css','utf8')});
  if(path.endsWith('.woff2'))return route.fulfill({contentType:'font/woff2',body:fs.readFileSync('assets/fonts/InterVariable.woff2')});
  if(path.endsWith('/notes')){if(req.method()==='POST'){privateWrites++;return route.fulfill({status:403,json:{message:'Log in again.'}})}reads++;if(mode==='delayed')return new Promise(resolve=>{release=async()=>{await route.fulfill({json:{notes:[note]}});resolve()}});return mode==='denied'?route.fulfill({status:403,json:{message:'Log in again.'}}):route.fulfill({json:{notes:mode==='owner'?[note]:[]}})}
  if(path.endsWith('/replies')){sharedWrites++;return route.fulfill({json:issue})}
  if(path==='/api/issues')return route.fulfill({json:{issues:[issue],total:1,page:1}});
  if(path==='/api/sync/activity')return route.fulfill({json:{issues:[issue],new_issues:[],cursor:1}});
  if(path.startsWith('/api/'))return route.fulfill({json:issue});
  return route.fulfill({contentType:'text/html',body:`<!doctype html><div id="target" style="margin:180px">Target</div><script>window.FeedbackPressConfig={api:'${base}/api/',home:'${base}',css:'${base}/review.css',nonce:'test',userName:'Reviewer',privateNotes:true,activitySync:true,maxBytes:5242880}</script><script>${fs.readFileSync('assets/review.js','utf8')}</script>`});
 });
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.clock.install();await page.goto(base);
 await page.getByRole('button',{name:'View issues',exact:true}).click();await page.locator('.issue-open').click();await page.getByText(note.body,{exact:true}).waitFor();
 const reply=page.getByRole('textbox',{name:'Reply',exact:true});await reply.fill('Unsent private draft');await page.getByLabel('Private note',{exact:true}).check();await reply.focus();
 const refresh=async()=>{const before=reads;await page.mouse.move(20 + reads, 20);await page.keyboard.press('Shift');await page.clock.fastForward(61000);await page.waitForFunction(()=>document.querySelector('#feedbackpress-root').shadowRoot.querySelector('.issue-thread'));for(let n=0;n<100&&reads===before;n++)await new Promise(resolve=>setTimeout(resolve,10));assert.ok(reads>before);};
 mode='delayed';await refresh();mode='other';await refresh();await release();await page.getByText(note.body,{exact:true}).waitFor({state:'detached'});assert.equal(await reply.inputValue(),'Unsent private draft');assert.equal(await reply.evaluate(e=>e===e.getRootNode().activeElement),true);await page.evaluate(()=>new Promise(requestAnimationFrame));assert.equal(await page.getByText(note.body,{exact:true}).count(),0);
 mode='owner';await refresh();await page.getByText(note.body,{exact:true}).waitFor();
 mode='denied';await refresh();await page.getByText(note.body,{exact:true}).waitFor({state:'detached'});assert.equal(await reply.inputValue(),'Unsent private draft');
 await page.getByRole('button',{name:'Reply',exact:true}).click();await page.getByRole('status').filter({hasText:'Log in again.'}).waitFor();assert.equal(privateWrites,1);assert.equal(sharedWrites,0);assert.deepEqual(errors,[]);
 console.log('PASS Private refresh removes prior actor/denied content while typing, preserves focus/draft, and never publishes a private draft after access loss.');
}finally{await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1});
