// Cached public HTML never contains reviewer configuration; all grants/providers are synthetic.
const {chromium}=require('playwright'),fs=require('node:fs'),assert=require('node:assert/strict');
(async()=>{const browser=await chromium.launch({channel:'chrome',headless:true});try{
 const base='https://feedbackpress.test',token='synthetic-review-link',issue={id:'11111111-1111-4111-8111-111111111111',number:1,title:'Shared review',body:'A shared issue',path:'/',author:'Reviewer',status:'todo',revision:1,activity:[],files:[],target:{selector:'#target',x:.5,y:.5}};
 for(const plain of [false,true]) {
  const context=await browser.newContext({viewport:{width:1280,height:900},reducedMotion:'reduce'}),calls=[],errors=[];let revoked=false;
  const api=base+(plain?'/?rest_route=/feedbackpress/v1/':'/api/'),config={api,home:base,css:base+'/review.css',nonce:'fixture',userName:'',privateNotes:false,reviewSession:true,maxBytes:5242880};
  const bootstrap={api};const html=()=>`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><script>window.FeedbackPressAccess=${JSON.stringify(bootstrap)}</script><script src="/review-access.js"></script><div id="target" style="margin:160px">Page content</div>`;
  await context.route(base+'/**',async route=>{const req=route.request(),u=new URL(req.url()),path=u.searchParams.get('rest_route')||u.pathname;
   if(u.pathname==='/review-access.js')return route.fulfill({contentType:'text/javascript',body:fs.readFileSync('assets/review-access.js','utf8')});
   if(u.pathname==='/review.js')return route.fulfill({contentType:'text/javascript',body:fs.readFileSync('assets/review.js','utf8')});
   if(u.pathname==='/review.css')return route.fulfill({contentType:'text/css',body:fs.readFileSync('assets/review.css','utf8')});
   if(u.pathname==='/capture.js')return route.fulfill({contentType:'text/javascript',body:'window.html2canvas=async()=>document.createElement("canvas");'});
   if(path.endsWith('/review-session')){
    calls.push({method:req.method(),url:req.url(),body:req.postDataJSON(),origin:req.headers().origin});
    if(req.headers()['x-wp-nonce']==='stale')return route.fulfill({status:403,json:{code:'rest_cookie_invalid_nonce',message:'Cookie check failed.'}});const cookie=req.headers().cookie||'',post=req.method()==='POST',end=req.method()==='DELETE';
    if(!end&&(revoked||(post?req.postDataJSON().token!==token:!cookie.includes('__Secure-feedbackpress-review='+token))))return route.fulfill({status:403,headers:{'Set-Cookie':'feedbackpress_review_active=; Path=/; Secure; Max-Age=0'},json:{message:'This review link is invalid, expired or revoked.'}});
    const headers={'Cache-Control':'private, no-store','Set-Cookie':end?'feedbackpress_review_active=; Path=/; Secure; Max-Age=0':`__Secure-feedbackpress-review=${token}; Path=/; Secure; HttpOnly; SameSite=Lax\nfeedbackpress_review_active=1; Path=/; Secure; SameSite=Lax`};
    return route.fulfill({headers,json:end?{ended:true}:{config,script:base+'/review.js',capture:base+'/capture.js'}});
   }
   if(path.startsWith('/api/')||path.startsWith('/feedbackpress/v1/'))return route.fulfill({json:path.endsWith('/issues')?{issues:[issue],total:1,page:1}:issue});
   return route.fulfill({contentType:'text/html',body:html()});
  });
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto(base+'/?page_id=2&view=a%20b');assert.equal(calls.length,0);assert.equal(await page.locator('#feedbackpress-root').count(),0);
  bootstrap.nonce='stale';await page.goto(base+'/#fp-review='+token+'&fp-return='+encodeURIComponent('feedbackpress='+issue.id));await page.getByRole('region',{name:'Introduce yourself'}).waitFor();
  assert.equal(new URL(page.url()).hash,'#feedbackpress='+issue.id);assert.equal(calls[0].method,'POST');assert.equal(calls[0].origin,base);assert.ok(!calls[0].url.includes(token));
  const cookies=await context.cookies();assert.ok(cookies.some(c=>c.name==='__Secure-feedbackpress-review'&&c.httpOnly&&c.secure));assert.ok(!await page.evaluate(()=>document.cookie.includes('__Secure-feedbackpress-review')));assert.ok(!await page.evaluate(t=>JSON.stringify(FeedbackPressConfig).includes(t),token));assert.equal(await page.getByText('Private note',{exact:true}).count(),0);
  delete bootstrap.nonce;await page.goto(base+'/?page_id=2&view=a%20b');await page.getByRole('button',{name:'View issues',exact:true}).waitFor();assert.equal(calls.at(-1).method,'GET');assert.ok(page.url().endsWith('/?page_id=2&view=a%20b'));
  await page.getByRole('button',{name:'View issues',exact:true}).click();await page.getByRole('textbox',{name:'Your name',exact:true}).fill('Client');await page.getByRole('textbox',{name:'Email address',exact:true}).fill('owner@example.test');await page.getByRole('button',{name:'Continue',exact:true}).click();await page.getByRole('complementary',{name:'Issues',exact:true}).waitFor();await page.locator('.sidebar-settings summary').click();await page.getByRole('button',{name:'End review session',exact:true}).click();await page.waitForFunction(()=>!document.querySelector('#feedbackpress-root'));assert.equal(calls.at(-1).method,'DELETE');
  await page.goto(base+'/#fp-review='+token);await page.getByRole('button',{name:'View issues',exact:true}).waitFor();revoked=true;await Promise.all([page.waitForResponse(r=>r.url().includes('review-session')&&r.request().method()==='GET'),page.reload()]);assert.equal(await page.locator('#feedbackpress-root').count(),0);
  await page.goto(base+'/#fp-review=invalid');await page.getByRole('alert').waitFor();assert.ok(!page.url().includes('fp-review'));await page.getByRole('button',{name:'Dismiss',exact:true}).click();assert.equal(await page.getByRole('alert').count(),0);assert.deepEqual(errors,[]);await context.close();
 }
 console.log('PASS Fragment exchange/cleanup and issue/query restoration, HttpOnly cookie, uncached bootstrap and stale-login nonce fallback over public HTML, no public config/data, no private identity, session end/revocation/friendly failure and plain REST URLs. All requests intercepted.');
}finally{await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1});
