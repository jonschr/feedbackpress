const {chromium}=require('playwright'),fs=require('node:fs'),assert=require('node:assert/strict');
(async()=>{const browser=await chromium.launch({channel:'chrome',headless:true});try{
 const base='https://feedbackpress.test',home=base+'/site',grant='11111111-1111-4111-8111-111111111111.'+'a'.repeat(43);
 const site=url=>({url,review_url:url+'/#fp-review='+grant});
 for(const variant of ['owner','mobile','dark','nonowner','guest','empty','failed','revoked','missing-grant','wrong-origin']){
  console.log('Checking',variant);
  const context=await browser.newContext({viewport:{width:variant==='mobile'?320:1280,height:844},colorScheme:variant==='dark'?'dark':'light',reducedMotion:'reduce'}),errors=[];let requests=0;
  await context.route(base+'/**',route=>{
   const u=new URL(route.request().url());
   if(u.pathname.endsWith('.css'))return route.fulfill({contentType:'text/css',body:fs.readFileSync('assets/review.css','utf8')});
   if(u.pathname.endsWith('.woff2'))return route.fulfill({contentType:'font/woff2',body:fs.readFileSync('assets/fonts/InterVariable.woff2')});
   if(u.pathname==='/review.js')return route.fulfill({contentType:'text/javascript',body:fs.readFileSync('assets/review.js','utf8')});
   if(u.pathname==='/api/review-access')return route.fulfill({json:{paused:false,can_create:true,account_owner:!['nonowner','guest'].includes(variant)}});
   if(u.pathname==='/api/admin/environments'){
    requests++;if(variant==='revoked')return route.fulfill({status:403,json:{message:'Only the FeedbackPress account owner can view environments.'}});
    if(variant==='failed'&&requests===1)return route.fulfill({status:503,json:{message:'Cannot load environments. Try again.'}});
    const bad=variant==='missing-grant'?{url:'https://live.example.test'}:variant==='wrong-origin'?{url:'https://live.example.test',review_url:'https://elsewhere.example.test/#fp-review='+grant}:null;
    if(bad)return route.fulfill({json:{sites:[bad]}});
    return route.fulfill({json:{sites:[site(home),...(variant==='empty'?[]:[site('https://live.example.test'),site('https://staging.example.test/client'),site('https://live.example.test'),site('http://insecure.example.test'),site('https://secret@example.test')])]}});
   }
   if(u.pathname==='/api/issues')return route.fulfill({json:{issues:[],total:0,page:1,project_counts:{open:0,closed:0,contains_private:false}}});
   if(u.pathname.startsWith('/api/'))return route.fulfill({json:{}});
   return route.fulfill({contentType:'text/html',body:`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><body><main>Client website</main><script>window.FeedbackPressConfig=${JSON.stringify({home,api:base+'/api/',css:base+'/review.css',reviewAccess:true,canShareReviewLinks:variant!=='guest',reviewSession:true,userName:variant==='guest'?'':'Administrator',nonce:'fixture'})}</script><script src="/review.js"></script>`});
  });
  const page=await context.newPage();page.on('pageerror',e=>{errors.push(e.message);console.error('Page error',variant,e.message);});await page.goto(home+'/');await page.getByRole('button',{name:'View issues',exact:true}).click();
  const switcher=page.locator('.environment-switcher'),summary=page.getByRole('button',{name:'Environments',exact:true});
  if(['guest','nonowner'].includes(variant)){await page.getByRole('heading',{name:'0 open issues',exact:true}).waitFor();assert.equal(await switcher.isVisible(),false);assert.equal(await summary.isVisible(),false);assert.equal(requests,0);await context.close();continue;}
  await summary.waitFor();assert.equal(requests,0);assert.equal(await switcher.isVisible(),false);assert.equal(await summary.getAttribute('aria-expanded'),'false');
  assert.ok(await summary.evaluate(n=>n.previousElementSibling.getAttribute('aria-label')==='Pause new client tickets'));
  const listBefore=await page.locator('.issue-list').boundingBox();await summary.click();
  if(variant==='revoked'){await page.locator('.notice').getByText(/Only the FeedbackPress account owner/).waitFor();assert.equal(await switcher.isVisible(),false);assert.equal(await page.getByRole('complementary',{name:'Issues'}).isVisible(),true);await context.close();continue;}
  if(variant==='failed'){await switcher.getByText('Cannot load environments. Try again.',{exact:true}).waitFor();await switcher.getByRole('button',{name:'Try again',exact:true}).click();}
  if(['missing-grant','wrong-origin'].includes(variant)){await switcher.getByRole('button',{name:'Try again',exact:true}).waitFor();assert.equal(await switcher.locator('a').count(),0);assert.deepEqual(errors,[]);await context.close();continue;}
  if(variant==='empty'){await switcher.getByText('No other environments connected.',{exact:true}).waitFor();assert.equal(await switcher.locator('a').count(),0);}else{
   await switcher.getByRole('link',{name:'live.example.test',exact:true}).waitFor();const links=await switcher.locator('a').evaluateAll(nodes=>nodes.map(n=>({href:n.href,target:n.target,rel:n.rel})));assert.deepEqual(links.map(x=>x.href),['https://live.example.test/?feedbackpress=open#fp-review='+grant,'https://staging.example.test/client/?feedbackpress=open#fp-review='+grant]);assert.ok(links.every(x=>x.target==='_blank'&&x.rel==='noopener noreferrer'));assert.ok(links.every(x=>new URL(x.href).hash==='#fp-review='+grant));
  }
  assert.deepEqual(await page.locator('.issue-list').boundingBox(),listBefore);assert.ok(listBefore.height>0);
  const drawerBox=await switcher.boundingBox(),settingsBox=await page.locator('.sidebar-settings').boundingBox();
  assert.ok(drawerBox.y>=0&&drawerBox.y+drawerBox.height<=settingsBox.y+1);
  assert.ok(await page.evaluate(()=>{const r=document.querySelector('#feedbackpress-root').shadowRoot.querySelector('.panel');return r.scrollWidth<=r.clientWidth}));
  if(['owner','mobile','dark'].includes(variant))await page.getByRole('complementary',{name:'Issues'}).screenshot({path:'/tmp/feedbackpress-environments-'+variant+'.png'});
  if(['owner','mobile','dark'].includes(variant)){
   await page.goto(home+'/another-page/');await switcher.waitFor();
   await switcher.getByRole('link',{name:'live.example.test',exact:true}).waitFor();assert.equal(await summary.getAttribute('aria-expanded'),'true');
   if(variant!=='mobile')await page.getByRole('radio',{name:'Left',exact:true}).check();assert.equal(await switcher.isVisible(),true);
   await switcher.getByRole('button',{name:'Close environments',exact:true}).click();assert.equal(await switcher.isVisible(),false);
   await page.goto(home+'/third-page/');await summary.waitFor();assert.equal(await switcher.isVisible(),false);
   await summary.click();await switcher.getByRole('link',{name:'live.example.test',exact:true}).waitFor();
  }
  await summary.press('Escape');assert.equal(await switcher.isVisible(),false);assert.equal(await summary.getAttribute('aria-expanded'),'false');assert.equal(await page.getByRole('complementary',{name:'Issues'}).isVisible(),true);assert.deepEqual(errors,[]);await context.close();
 }
 console.log('PASS owner-only environments, lazy/retry reads, current-site exclusion/deduplication, site-specific magic links without API credentials, empty/revoked states, Escape, overlay geometry, drawer navigation persistence, explicit close persistence and desktop/mobile light/dark layouts.');
}finally{await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1});
