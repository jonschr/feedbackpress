// Real renderer and fake browser clock; synthetic gateway only, no customer requests.
const {chromium}=require('playwright'),fs=require('node:fs'),assert=require('node:assert/strict');
(async()=>{const browser=await chromium.launch({channel:'chrome',headless:true});try{
 const context=await browser.newContext({viewport:{width:1280,height:900},reducedMotion:'reduce'}),base='https://feedbackpress.test',errors=[];
 let issue={id:'11111111-1111-4111-8111-111111111111',number:1,title:'Shared issue',body:'Initial description',author:'Reviewer',status:'todo',revision:'1',path:'/',activity:[],files:[],target:{selector:'#target',x:.5,y:.5},created_at:'2026-11-11T12:00:00Z'};
 let reads=0,mode='normal',release,statusRelease;
 await context.route(base+'/**',async route=>{const req=route.request(),path=new URL(req.url()).pathname;
  if(path.endsWith('.css'))return route.fulfill({contentType:'text/css',body:fs.readFileSync('assets/review.css','utf8')});
  if(path.endsWith('.woff2'))return route.fulfill({contentType:'font/woff2',body:fs.readFileSync('assets/fonts/InterVariable.woff2')});
  if(path==='/api/sync/activity'){
   reads++;
   if(mode==='limited')return route.fulfill({status:429,headers:{'Retry-After':'90'},json:{message:'Slow down'}});
   if(mode==='held')await new Promise(resolve=>release=resolve);
   if(mode==='unchanged')return route.fulfill({json:{state:'unchanged',cursor:'2'}});
   return route.fulfill({json:{issues:[structuredClone(issue)],new_issues:[issue.id],cursor:issue.revision}});
  }
  if(path.endsWith('/status')){const body=req.postDataJSON();await new Promise(resolve=>statusRelease=resolve);issue={...issue,status:body.status,revision:'4'};return route.fulfill({json:issue})}
  if(path==='/api/issues')return route.fulfill({json:{issues:[issue],total:1,page:1}});
  if(path.startsWith('/api/issues/'))return route.fulfill({json:issue});
  return route.fulfill({contentType:'text/html',body:`<!doctype html><button id="target" style="margin:100px">Page content</button><script>window.FeedbackPressConfig={api:'${base}/api/',home:'${base}',css:'${base}/review.css',nonce:'fixture',userName:'Reviewer',activitySync:true}</script><script>${fs.readFileSync('assets/review.js','utf8')}</script>`});
 });
 const page=await context.newPage();page.setDefaultTimeout(6000);page.on('pageerror',e=>errors.push(e.message));await page.clock.install();await page.goto(base);await page.getByRole('button',{name:'View issues',exact:true}).click();await page.locator('.issue-open').click();
 const popup=page.locator('.issue-popup'),reply=page.getByRole('textbox',{name:'Reply',exact:true});await reply.waitFor();await page.locator('#target').focus();await page.clock.runFor(1);
 const tick=async(ms=30100)=>{await page.clock.fastForward(ms);await new Promise(resolve=>setTimeout(resolve,70));};
 const before=reads;issue={...issue,status:'review',revision:'2',activity:[{id:'22222222-2222-4222-8222-222222222222',kind:'reply',created_at:'2026-11-11T12:01:00Z',payload:{author:'Client',body:'A remote reply'}}]};
 await tick();await page.getByText('A remote reply',{exact:true}).waitFor();assert.equal(reads,before+1);assert.equal(await popup.locator('.status-review').getAttribute('aria-pressed'),'true');
 // No interactions for over two minutes: polling must continue.
 for(let i=0;i<5;i++){const count=reads;await tick();assert.equal(reads,count+1)}
 await reply.fill('Unsent draft');await reply.focus();await page.evaluate(()=>window.savedReply=document.querySelector('#feedbackpress-root').shadowRoot.activeElement);
 issue={...issue,status:'needs_info',revision:'3',activity:[...issue.activity,{id:'33333333-3333-4333-8333-333333333333',kind:'reply',created_at:'2026-11-11T12:02:00Z',payload:{author:'Client',body:'Another remote reply'}}]};
 await tick();assert.equal(await reply.inputValue(),'Unsent draft');assert.ok(await reply.evaluate(node=>node===window.savedReply&&node===node.getRootNode().activeElement));
 await page.locator('#target').focus();await page.clock.runFor(1);await page.getByText('Another remote reply',{exact:true}).waitFor();assert.equal(await reply.inputValue(),'Unsent draft');
 // A slow local status write stays optimistic when a remote snapshot arrives.
 await popup.locator('[data-status-action=doing]').click();await page.locator('#target').focus();await page.clock.runFor(500);await tick();assert.equal(typeof statusRelease,'function');assert.equal(await popup.locator('.status-doing').getAttribute('aria-pressed'),'true');statusRelease();await new Promise(resolve=>setTimeout(resolve,70));
 // Unchanged checks do not rebuild the open card.
 mode='unchanged';await page.evaluate(()=>window.savedPopup=document.querySelector('#feedbackpress-root').shadowRoot.querySelector('.issue-popup').firstElementChild);await tick();assert.ok(await page.evaluate(()=>window.savedPopup===document.querySelector('#feedbackpress-root').shadowRoot.querySelector('.issue-popup').firstElementChild));
 await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'))});let count=reads;await tick(180000);assert.equal(reads,count);
 await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:false});document.dispatchEvent(new Event('visibilitychange'))});await new Promise(resolve=>setTimeout(resolve,70));assert.equal(reads,count+1);
 mode='held';await tick();count=reads;assert.equal(typeof release,'function');await tick(100000);assert.equal(reads,count);mode='normal';release();await new Promise(resolve=>setTimeout(resolve,70));
 mode='limited';await tick();count=reads;mode='normal';await tick(30100);await tick(30100);assert.equal(reads,count);await tick(30100);assert.equal(reads,count+1);
 assert.deepEqual(errors,[]);console.log('PASS 30-second visible/idle polling, remote status/replies, draft/focus and queued-status preservation, unchanged-card stability, hidden-tab pause/resume, no overlapping reads and Retry-After backoff.');
}finally{await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1});
