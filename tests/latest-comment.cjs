// Synthetic threads only; all requests intercepted.
const {chromium}=require('playwright'),fs=require('node:fs'),assert=require('node:assert/strict');
(async()=>{const browser=await chromium.launch({channel:'chrome',headless:true});try{
 const base='https://feedbackpress.test',ids=['11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222'];
 const issues=ids.map((id,i)=>({id,number:i+1,title:'Long review '+(i+1),body:'Long initial ticket. '.repeat(350),author:'Maya',status:'todo',revision:1,path:i?'/menu/':'/',created_at:'2026-11-12T12:00:00Z',target:{selector:'',x:.5,y:.5},files:[],activity:[
  {id:'latest-'+i,kind:'reply',created_at:'2026-11-14T12:00:00Z',payload:{author:'Owen',body:'Newest long reply. '.repeat(250)}},
  {id:'older-'+i,kind:'reply',created_at:'2026-11-13T12:00:00Z',payload:{author:'Jon',body:'Earlier long reply. '.repeat(250)}}]}));
 const ctx=await browser.newContext({viewport:{width:1280,height:900},reducedMotion:'reduce'}),errors=[];
 await ctx.route('**/*',async route=>{const u=new URL(route.request().url());
  if(u.origin!==base)return route.abort();
  if(u.pathname.endsWith('.woff2'))return route.fulfill({body:fs.readFileSync('assets/fonts/InterVariable.woff2'),contentType:'font/woff2'});
  if(u.pathname.endsWith('.css'))return route.fulfill({body:fs.readFileSync('assets/review.css'),contentType:'text/css'});
  if(u.pathname==='/api/issues')return route.fulfill({json:{issues,total:2,page:1}});
  if(u.pathname.startsWith('/api/issues/')){await new Promise(r=>setTimeout(r,200));return route.fulfill({json:issues.find(i=>u.pathname.endsWith(i.id))});}
  if(u.pathname.startsWith('/api/'))return route.fulfill({json:{}});
  return route.fulfill({contentType:'text/html',body:`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><main id="target" style="height:1800px">Demo page</main><script>window.FeedbackPressConfig={home:'${base}',api:'${base}/api/',css:'${base}/review.css',userName:'Jon',nonce:'fixture'}</script><script>${fs.readFileSync('assets/review.js','utf8')}</script>`});
 });
 const page=await ctx.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto(base);await page.getByRole('button',{name:'View issues',exact:true}).click();
 const panel=page.getByRole('complementary',{name:'Issues',exact:true}),popup=page.getByRole('region',{name:'Issue details',exact:true}),thread=popup.locator('.issue-thread'),row=i=>panel.locator(`[data-issue="${ids[i]}"]`);
 const atStart=async i=>{await page.waitForFunction(id=>{const r=document.querySelector('#feedbackpress-root').shadowRoot,t=r.querySelector('.issue-thread'),e=t?.querySelector(`[data-comment="latest-${id}"]`);return e&&Math.abs(e.getBoundingClientRect().top-t.getBoundingClientRect().top)<2},i);};
 await row(0).locator('.issue-open').click();await popup.waitFor();assert.equal(await thread.evaluate(n=>n.scrollTop),0,'Title initially opens at the report');
 const list=panel.locator('.issue-list'),before=await list.evaluate(n=>n.scrollTop),pageY=await page.evaluate(()=>scrollY);
 await row(0).locator('.row-replies').click();await atStart(0);assert.equal(await popup.isVisible(),true,'Clicking current issue replies must not close it');
 assert.equal(await popup.locator('.thread-comment').count(),3,'Earlier comments remain expanded');assert.equal(await list.evaluate(n=>n.scrollTop),before);assert.equal(await page.evaluate(()=>scrollY),pageY);
 await thread.evaluate(n=>n.scrollTop=40);await page.waitForTimeout(300);assert.equal(await thread.evaluate(n=>n.scrollTop),40,'Background read must preserve manual scrolling');
 await popup.getByRole('button',{name:'Dismiss issue',exact:true}).click();await row(0).locator('.row-replies').click();await atStart(0);
 await row(1).locator('.row-replies').click();await page.waitForURL(base+'/menu/#feedbackpress='+ids[1]);await atStart(1);assert.equal(await page.evaluate(()=>sessionStorage.getItem('feedbackpress-comment-target:https://feedbackpress.test')),null,'Navigation intent is consumed');
 await page.setViewportSize({width:390,height:844});await popup.waitFor();await popup.getByRole('button',{name:'Dismiss issue',exact:true}).click();await row(1).locator('.row-replies').click();await atStart(1);assert.ok(await popup.evaluate(n=>n.scrollWidth<=n.clientWidth));
 await page.screenshot({path:'/tmp/feedbackpress-latest-comment-mobile.png'});
 assert.deepEqual(errors,[]);console.log('PASS Latest-comment start, timestamp selection, open issue jump, retained history, no list/page movement, manual scroll during refresh, cross-page one-shot intent, and mobile.');
}finally{await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1});
