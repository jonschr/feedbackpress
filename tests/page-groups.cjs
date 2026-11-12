// Isolated, multi-document fixture; no external requests or customer data.
const {chromium}=require('playwright'),fs=require('node:fs'),assert=require('node:assert/strict');
(async()=>{const browser=await chromium.launch({channel:'chrome',headless:true});try{
 const base='https://feedbackpress.test',context=await browser.newContext({viewport:{width:1280,height:900},reducedMotion:'reduce'}),errors=[];
 const groups=[['/','FeedbackPress QA'],['/?page_id=2&view=full','Sample Page'],['/long/?filter=one&filter=two%20words','A longer page title that should wrap naturally without obscuring the issues beneath it'],['/missing/','']];
 const items=groups.flatMap(([path,page_title],g)=>Array.from({length:3},(_,n)=>({id:`${String(g*3+n+1).padStart(8,'0')}-1111-4111-8111-111111111111`,number:g*3+n+1,title:['Check the heading spacing','This looks good on mobile','Clarify the button label'][n],body:'',page_title,path,author:'Alex',status:'todo',revision:1,activity:[],files:[],target:{selector:'body',x:.5,y:.5}})));
 let delay=0;
 await context.route(base+'/**',async route=>{const u=new URL(route.request().url());
  if(u.pathname.endsWith('.woff2'))return route.fulfill({body:fs.readFileSync('assets/fonts/InterVariable.woff2'),contentType:'font/woff2'});
  if(u.pathname.endsWith('.css'))return route.fulfill({body:fs.readFileSync('assets/review.css','utf8'),contentType:'text/css'});
  if(u.pathname==='/api/issues'){if(delay)await new Promise(r=>setTimeout(r,delay));const q=u.searchParams;return route.fulfill({json:{issues:items.filter(i=>!q.get('path')||q.get('path')===i.path),total:items.length,page:1}})}
  if(u.pathname.startsWith('/api/issues/'))return route.fulfill({json:items.find(i=>u.pathname.endsWith(i.id))});
  return route.fulfill({contentType:'text/html',body:`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{background:#eee}</style><body><script>window.FeedbackPressConfig={home:'${base}',api:'${base}/api/',css:'${base}/review.css',userName:'Reviewer',nonce:'fixture'}</script><script>${fs.readFileSync('assets/review.js','utf8')}</script>`});
 });
 const page=await context.newPage();page.on('pageerror',e=>{errors.push(e.message);console.error(e.message)});await page.goto(base);await page.getByRole('button',{name:'View issues',exact:true}).click();const panel=page.getByRole('complementary',{name:'Issues',exact:true}),list=panel.locator('.issue-list');await panel.locator('.issue-row').nth(11).waitFor();await panel.getByLabel('Group issues').selectOption('page');await panel.locator('.page-heading').nth(3).waitFor();
 await page.screenshot({path:process.env.BASELINE?'/tmp/feedbackpress-page-groups-before.png':'/tmp/feedbackpress-page-groups-desktop.png'});if(process.env.BASELINE)return;
 assert.deepEqual(await panel.locator('.page-title').allTextContents(),groups.map(g=>g[1]||'Page'));
 assert.deepEqual(await panel.locator('.page-url').allTextContents(),groups.map(g=>base+g[0]));
 assert.equal(await panel.locator('.issue-row .page-reference').count(),0);
 const geometry=await panel.locator('.page-heading').evaluateAll(nodes=>nodes.map(n=>{const s=getComputedStyle(n);return{top:parseFloat(s.paddingTop),bottom:parseFloat(s.paddingBottom),margin:parseFloat(s.marginTop),overflow:n.scrollWidth>n.clientWidth}}));assert.ok(geometry.every(g=>g.top>g.bottom&&!g.overflow));assert.ok(geometry[1].margin>geometry[0].margin);
 await list.evaluate(n=>n.scrollTop=350);await page.waitForFunction(()=>JSON.parse(sessionStorage.getItem('feedbackpress-view:https://feedbackpress.test')).scrollTop===350);delay=800;
 await panel.locator(`[data-issue="${items[3].id}"] .issue-open`).click();await page.waitForURL(base+groups[1][0]+'#feedbackpress='+items[3].id);await panel.locator('.page-title').nth(3).waitFor();assert.equal(await list.evaluate(n=>n.scrollTop),350);assert.equal(await panel.locator('.page-title').nth(1).textContent(),'Sample Page');
 await page.waitForFunction(()=>document.querySelector('#feedbackpress-root').shadowRoot.querySelector('.issue-list').getAttribute('aria-busy')==='false');assert.equal(await list.evaluate(n=>n.scrollTop),350);
 for(const width of [390,320]){await page.setViewportSize({width,height:844});if(await page.getByRole('region',{name:'Issue details'}).isVisible())await page.getByRole('region',{name:'Issue details'}).getByRole('button',{name:'Dismiss issue',exact:true}).click();await panel.waitFor();await list.evaluate(n=>n.scrollTop=480);assert.ok(await panel.evaluate(n=>n.scrollWidth<=n.clientWidth));assert.ok(await panel.locator('.page-heading').evaluateAll(nodes=>nodes.every(n=>n.scrollWidth<=n.clientWidth)));await page.screenshot({path:`/tmp/feedbackpress-page-groups-${width}.png`})}
 assert.deepEqual(errors,[]);console.log('PASS Page titles/full query URLs, unavailable fallback, group spacing, 390/320px wrapping, cached cross-page title/order/exact-scroll continuity.');
}finally{await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1});
