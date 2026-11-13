// Actual multi-document navigation with intercepted requests; no customer data or external HTTP.
const {chromium,webkit}=require('playwright'),fs=require('node:fs'),assert=require('node:assert/strict');
(async()=>{const engine=process.env.FEEDBACKPRESS_BROWSER==='webkit'?webkit:chromium,browser=await engine.launch(engine===chromium?{channel:'chrome',headless:true}:{headless:true,...(process.env.FEEDBACKPRESS_WEBKIT_PATH?{executablePath:process.env.FEEDBACKPRESS_WEBKIT_PATH}:{})});
try{
 const context=await browser.newContext({viewport:{width:1280,height:900},reducedMotion:'reduce'}),base='https://feedbackpress.test',errors=[];
 const items=Array.from({length:130},(_,i)=>({id:`${String(i+1).padStart(8,'0')}-1111-4111-8111-111111111111`,number:String(i+1),title:'Issue '+(i+1)+' with a short title',body:'A note to review on this page.',author:'Client',path:i%2?'/other/':'/',status:'todo',revision:'one',created_at:'2026-11-10T12:00:00Z',updated_at:'2026-11-10T12:00:00Z',files:[],activity:[],target:{selector:'#target',text:'Target',x:.5,y:.5}}));
 let cssDelay=0,listDelay=0;const syncSamples=[];
 await context.route(base+'/**',async r=>{const u=new URL(r.request().url());
  if(u.pathname.endsWith('.woff2'))return r.fulfill({contentType:'font/woff2',body:fs.readFileSync('assets/fonts/InterVariable.woff2')});
  if(u.pathname.endsWith('.css')){if(cssDelay)await new Promise(resolve=>setTimeout(resolve,cssDelay));return r.fulfill({contentType:'text/css',body:fs.readFileSync('assets/review.css','utf8')})}
  if(u.pathname==='/api/issues'){
   if(listDelay)await new Promise(resolve=>setTimeout(resolve,listDelay));
   const q=u.searchParams,found=items.filter(i=>(!q.get('path')||i.path===q.get('path'))&&(!q.get('status')||q.get('status').split(',').includes(i.status))&&(!q.get('search')||i.title.toLowerCase().includes(q.get('search').toLowerCase())));
   let page=Math.max(1,Math.min(Number(q.get('page'))||1,Math.ceil(found.length/50)||1));if(q.get('focus')){const n=found.findIndex(i=>i.id===q.get('focus'));if(n>=0)page=Math.floor(n/50)+1}
   return r.fulfill({json:{issues:found.slice((page-1)*50,page*50),total:found.length,page}});
  }
  if(u.pathname==='/api/sync/activity'){syncSamples.push(items.length);return r.fulfill({json:{issues:structuredClone(items),new_issues:items.map(item=>item.id),cursor:1}})}
  if(u.pathname.startsWith('/api/issues/')){await new Promise(resolve=>setTimeout(resolve,40));return r.fulfill({json:items.find(i=>u.pathname.endsWith(i.id))})}
  return r.fulfill({contentType:'text/html',body:`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;min-height:1800px;background:#eee;font:16px sans-serif}nav{padding:20px}#target{margin:280px 40px;width:280px;height:200px;background:#ddd}</style><nav><a id="ordinary-link" href="/third/">Another website page</a></nav><div id="target">Target</div><script>window.FeedbackPressConfig={api:'${base}/api/',home:'${base}',css:'${base}/review.css',nonce:'fixture',activitySync:true,userName:'Reviewer',maxBytes:5242880}</script><script>${fs.readFileSync('assets/review.js','utf8')}</script>`});
 });
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto(base+'/');await page.getByRole('button',{name:'View issues',exact:true}).click();
 const panel=page.getByRole('complementary',{name:'Issues',exact:true}),list=panel.locator('.issue-list');
 const ready=async()=>{await panel.waitFor();await list.locator('.issue-row').first().waitFor();await page.waitForFunction(()=>document.querySelector('#feedbackpress-root').shadowRoot.querySelector('.issue-list').getAttribute('aria-busy')==='false')};
 await panel.getByLabel('Issue page view').selectOption('list');await ready();const edge=await list.locator('.issue-row').first().boundingBox(),area=await list.boundingBox(),dock=await panel.boundingBox();assert.equal(edge.x,dock.x);assert.equal(edge.y,area.y);assert.equal(edge.width,await list.evaluate(e=>e.clientWidth));assert.ok(await list.evaluate(e=>e.scrollHeight>e.clientHeight));
 await panel.getByRole('searchbox').fill('Issue');await page.waitForTimeout(250);await ready();await panel.getByLabel('Order issues').selectOption('updated_desc');await ready();await panel.getByRole('button',{name:'Filter statuses'}).click();await panel.getByRole('checkbox',{name:'Review',exact:true}).uncheck();await page.keyboard.press('Escape');await ready();
 await panel.getByRole('button',{name:'Next list page',exact:true}).click();await panel.getByText('2 / 3',{exact:true}).waitFor();await ready();
 await list.evaluate(e=>{e.scrollTop=1340});await page.waitForFunction(()=>JSON.parse(sessionStorage.getItem('feedbackpress-view:https://feedbackpress.test')).scrollTop===1340);
 const before=await list.evaluate(e=>e.scrollTop),first=await list.evaluate(e=>[...e.querySelectorAll('.issue-row')].find(n=>n.getBoundingClientRect().top>=e.getBoundingClientRect().top)?.dataset.issue);
 const visibleOther=()=>list.evaluate(e=>[...e.querySelectorAll('.issue-row')].find(n=>{const r=n.getBoundingClientRect(),v=e.getBoundingClientRect();return n.querySelector('.page-reference')?.textContent==='/other/'&&r.top>=v.top&&r.bottom<=v.bottom})?.dataset.issue);
 const id=await visibleOther();assert.ok(id);const clickedY=(await list.locator(`[data-issue="${id}"]`).boundingBox()).y;cssDelay=150;listDelay=120;
 await list.locator(`[data-issue="${id}"] .issue-open`).click();await page.waitForURL(base+'/other/#feedbackpress='+id);await ready();
 const same=async()=>{assert.equal(await list.locator('.issue-row').count(),50);assert.equal(await list.locator('.empty').count(),0);assert.equal(await list.locator('.outside-filter').count(),0);assert.equal(await list.evaluate(e=>e.scrollTop),before);assert.equal(await list.evaluate(e=>[...e.querySelectorAll('.issue-row')].find(n=>n.getBoundingClientRect().top>=e.getBoundingClientRect().top)?.dataset.issue),first);assert.equal(await panel.getByRole('searchbox').inputValue(),'Issue');assert.equal(await panel.getByLabel('Order issues').inputValue(),'updated_desc');assert.equal(await panel.getByText('2 / 3',{exact:true}).count(),1)};
 await same();assert.equal(await list.locator(`[data-issue="${id}"]`).getAttribute('class'),'issue-row is-selected');assert.equal((await list.locator(`[data-issue="${id}"]`).boundingBox()).y,clickedY);
 await list.locator(`[data-issue="${id}"] .issue-open`).click();await ready();await same();
 const next=items[items.findIndex(item=>item.id===id)+1];await page.getByRole('region',{name:'Issue details'}).getByRole('button',{name:'Next issue',exact:true}).click();await page.waitForURL(base+next.path+'#feedbackpress='+next.id);await ready();await same();
 await page.locator('#ordinary-link').click();await page.waitForURL(base+'/third/');await ready();await same();
 await page.reload();await ready();await same();
 await page.goBack();await ready();await same();
 await panel.getByRole('button',{name:'Dismiss issues',exact:true}).click();await page.getByRole('button',{name:'View issues',exact:true}).click();await ready();await same();
 await page.goto(base+'/third/');await ready();await page.setViewportSize({width:390,height:844});await ready();
 const mobileBefore=await list.evaluate(e=>e.scrollTop),mobileId=await visibleOther();await list.locator(`[data-issue="${mobileId}"] .issue-open`).click();await page.waitForURL(base+'/other/#feedbackpress='+mobileId);
 const popup=page.getByRole('region',{name:'Issue details'});await popup.waitFor();assert.equal(await panel.isVisible(),false);await popup.getByRole('button',{name:'Dismiss issue',exact:true}).click();await ready();assert.equal(await list.evaluate(e=>e.scrollTop),mobileBefore);
 await panel.getByRole('searchbox').fill('Issue 1');await page.waitForTimeout(250);await ready();assert.equal(await list.evaluate(e=>e.scrollTop),0);assert.deepEqual(errors,[]);
 await page.waitForFunction(()=>{const rows=[...document.querySelector('#feedbackpress-root').shadowRoot.querySelectorAll('.issue-row')];return rows.length&&rows.every(row=>row.querySelector('.issue-body').textContent.includes('Issue 1'))});
 await page.bringToFront();await page.evaluate(()=>new Promise(requestAnimationFrame));
 const seed=page.waitForResponse(response=>new URL(response.url()).pathname==='/api/sync/activity');
 await page.evaluate(()=>{const now=Date.now;Date.now=()=>now()+61000;window.fixtureSeedTime=Date.now();document.dispatchEvent(new Event('visibilitychange'))});await seed;
 await page.waitForFunction(()=>{const saved=JSON.parse(sessionStorage.getItem('feedbackpress-shared-cache:https://feedbackpress.test::Reviewer')||'{}');return saved.at>=window.fixtureSeedTime&&saved.known?.length===130});
 const previousIds=await list.locator('.issue-row').evaluateAll(rows=>rows.map(row=>row.dataset.issue));
 const added={...items[0],id:'00000131-1111-4111-8111-111111111111',number:'131',title:'Issue 131 with a short title',path:'/third/'};items.push(added);
 await page.evaluate(()=>{const now=Date.now;Date.now=()=>now()+61000;document.dispatchEvent(new Event('visibilitychange'))});
 try{await list.locator(`[data-issue="${added.id}"]`).waitFor()}catch(error){console.error({syncSamples,rows:await list.locator('.row-number').allTextContents(),search:await panel.getByRole('searchbox').inputValue(),browser:await page.evaluate(()=>{const saved=JSON.parse(sessionStorage.getItem('feedbackpress-shared-cache:https://feedbackpress.test::Reviewer')||'{}');return{hidden:document.hidden,now:Date.now(),seed:window.fixtureSeedTime,cacheAt:saved.at,knownCount:saved.known?.length,knownTail:saved.known?.slice(-3),signature:saved.view?.signature}})});throw error}assert.deepEqual(await list.locator('.issue-row').evaluateAll(rows=>rows.map(row=>row.dataset.issue)),[...previousIds,added.id]);assert.deepEqual(errors,[]);
 assert.equal(await panel.getByRole('searchbox').evaluate(node=>node===node.getRootNode().activeElement),true);
 console.log('PASS Full-bleed independently scrolling rows; exact list position, filters, sort and page survive real navigation/reload/back/mobile; full activity snapshots do not append old pages, and one genuinely new matching issue appends once while retaining search focus.');
}finally{await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1});
