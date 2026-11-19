// Real document navigation with intercepted API; no customer data or writes.
const {chromium}=require('playwright'),fs=require('node:fs'),assert=require('node:assert/strict');
(async()=>{const browser=await chromium.launch({channel:'chrome',headless:true});try{
 const base='https://feedbackpress.test',key='feedbackpress-docked:'+base;
 const issues=['/','/','/other/?view=one&view=two'].map((path,i)=>({id:`0000000${i+1}-1111-4111-8111-111111111111`,number:i+1,title:'Issue '+(i+1),body:'Review context',path,author:'Reviewer',status:'todo',revision:1,target:{selector:'#target',x:.5,y:.5},activity:[],files:[]}));
 const context=await browser.newContext({viewport:{width:1280,height:900},reducedMotion:'reduce'});let writes=0;const errors=[];
 await context.route(base+'/**',route=>{
  const request=route.request(),url=new URL(request.url());
  if(url.pathname.endsWith('.css'))return route.fulfill({contentType:'text/css',body:fs.readFileSync('assets/review.css','utf8')});
  if(url.pathname.endsWith('.woff2'))return route.fulfill({contentType:'font/woff2',body:fs.readFileSync('assets/fonts/InterVariable.woff2')});
  if(url.pathname.startsWith('/api/')){
   if(request.method()!=='GET')writes++;
   if(url.pathname==='/api/issues'){const found=url.searchParams.has('path')?issues.filter(i=>i.path===url.searchParams.get('path')):issues;return route.fulfill({json:{issues:found,total:found.length,page:1,project_counts:{open:3,closed:0,contains_private:false}}});}
   if(url.pathname.endsWith('/notes'))return route.fulfill({json:{notes:[]}});
   return route.fulfill({json:issues.find(i=>url.pathname.endsWith(i.id))||{}});
  }
  return route.fulfill({contentType:'text/html',body:`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><body><a id="ordinary" href="/normal/">Browse normally</a><div id="target" style="margin:200px 40px">Page content</div><script>window.FeedbackPressConfig={home:'${base}',api:'${base}/api/',css:'${base}/review.css',userName:'Reviewer',nonce:'fixture'};</script><script>${fs.readFileSync('assets/review.js','utf8')}</script>`});
 });
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto(base+'/#feedbackpress='+issues[0].id);
 const popup=page.getByRole('region',{name:'Issue details',exact:true}),dock=()=>popup.getByRole('button',{name:'Dock issue window',exact:true});
 const assertDock=async()=>{await popup.waitFor();await page.waitForFunction(()=>document.querySelector('#feedbackpress-root').shadowRoot.querySelector('.issue-popup').hasAttribute('data-docked'));const box=await popup.boundingBox();assert.equal(box.y,0);assert.equal(box.height,900);assert.equal(await page.evaluate(k=>localStorage.getItem(k),key),'true');};
 await dock().click();await assertDock();
 await page.locator(`.issue-row[data-issue="${issues[1].id}"] .issue-open`).click();await popup.locator('.issue-reference').filter({hasText:'Issue 2'}).waitFor();await assertDock();
 await page.locator(`.issue-row[data-issue="${issues[2].id}"] .issue-open`).click();await page.waitForURL(base+issues[2].path+'#feedbackpress='+issues[2].id);await assertDock();
 await page.reload();await assertDock();assert.equal(await popup.evaluate(n=>getComputedStyle(n).opacity),'1','Restored docking starts opaque');
 await page.locator('#ordinary').click();await page.waitForURL(base+'/normal/');await page.getByRole('complementary',{name:'Issues',exact:true}).waitFor();assert.equal(await popup.isVisible(),false,'Ordinary browsing does not reopen a ticket');
 await page.locator(`.issue-row[data-issue="${issues[0].id}"] .issue-open`).click();await page.waitForURL(base+'/#feedbackpress='+issues[0].id);await assertDock();
 await popup.getByRole('button',{name:'Undock issue window',exact:true}).click();assert.equal(await page.evaluate(k=>localStorage.getItem(k),key),'false');await page.reload();await popup.waitFor();assert.equal(await popup.getAttribute('data-docked'),null);
 await dock().click();await assertDock();
 const other=await context.newPage();other.on('pageerror',e=>errors.push(e.message));await other.goto(base+'/#feedbackpress='+issues[1].id);await other.getByRole('region',{name:'Issue details',exact:true}).waitFor();assert.equal(await other.locator('.issue-popup').getAttribute('data-docked'),'');await other.close();
 await page.setViewportSize({width:390,height:844});await page.waitForFunction(()=>!document.querySelector('#feedbackpress-root').shadowRoot.querySelector('.issue-popup').hasAttribute('data-docked'));assert.equal(await page.evaluate(k=>localStorage.getItem(k),key),'true');await page.setViewportSize({width:1280,height:900});await assertDock();
 assert.deepEqual(errors,[]);assert.equal(writes,0);console.log('PASS saved docking across same-page/cross-page tickets, reload, ordinary navigation, new tabs, explicit undock and temporary mobile fallback; no feedback writes.');
}finally{await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1});
