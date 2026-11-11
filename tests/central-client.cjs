// Intercepted central gateway: no customer data or external API writes.
const {chromium}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs');
(async()=>{const browser=await chromium.launch({channel:'chrome',headless:true});try{
 const context=await browser.newContext({viewport:{width:1280,height:900}}),base='https://feedbackpress.test';let issue,attempts=0,firstKey;
 await context.route(base+'/**',async route=>{
  const request=route.request(),url=new URL(request.url()),path=url.searchParams.get('rest_route');
  if(url.pathname.endsWith('.css'))return route.fulfill({contentType:'text/css',body:fs.readFileSync('assets/review.css','utf8')});
  if(path){
   if(path==='/feedbackpress/v1/issues'&&request.method()==='POST'){
    attempts++;const key=request.headers()['idempotency-key'];assert.match(key,/^[0-9a-f-]{36}$/);if(firstKey)assert.equal(key,firstKey);else firstKey=key;
    if(!issue)issue={...request.postDataJSON(),id:'11111111-1111-4111-8111-111111111111',number:1,revision:'1',author:'Reviewer',activity:[],files:[],created_at:new Date().toISOString()};
    if(attempts===1)return route.abort('connectionreset');
    return route.fulfill({json:issue});
   }
   if(path==='/feedbackpress/v1/issues'){assert.ok(!path.includes('?'));assert.equal(url.searchParams.get('status'),'todo,review');return route.fulfill({json:{issues:issue?[issue]:[],total:issue?1:0,page:1}})}
   if(path.includes('/files'))return route.fulfill({json:{id:'media'}});
   return route.fulfill({json:issue||{}});
  }
  return route.fulfill({contentType:'text/html',body:`<!doctype html><body><div id="target" style="margin:180px;padding:50px">Target</div><script>window.FeedbackPressConfig={api:'${base}/index.php?rest_route=/feedbackpress/v1/',home:'${base}',css:'${base}/review.css',nonce:'test',userName:'Reviewer',maxBytes:5242880};window.html2canvas=async()=>{let c=document.createElement('canvas');c.width=10;c.height=10;return c};</script><script>${fs.readFileSync('assets/review.js','utf8')}</script>`});
 });
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(base);
 await page.getByRole('button',{name:'Leave feedback',exact:true}).click();await page.locator('#target').click();
 await page.getByRole('textbox',{name:'Issue title',exact:true}).fill('Retry without duplication');await page.getByRole('button',{name:'Submit feedback',exact:true}).click();
 await page.getByRole('status').filter({hasText:'Failed to fetch'}).waitFor();
 await page.getByRole('button',{name:'Submit feedback',exact:true}).click();
 await page.waitForFunction(()=>document.querySelector('#feedbackpress-root').shadowRoot.querySelector('.composer:not(.issue-popup)').hidden);
 assert.equal(attempts,2);await page.getByRole('button',{name:'View issues',exact:true}).click();await page.locator('.issue-row').waitFor();assert.equal(await page.locator('.issue-row').count(),1);assert.deepEqual(errors,[]);
 console.log('PASS Plain-permalink query routing and retry after a lost create acknowledgment reuse the operation ID and produce one issue.');
}finally{await browser.close()}})().catch(error=>{console.error(error);process.exitCode=1});
