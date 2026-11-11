// A stale write remains recoverable after navigating elsewhere, without creating a second operation.
const {chromium}=require('playwright'),fs=require('node:fs'),assert=require('node:assert/strict');
(async()=>{const browser=await chromium.launch({channel:'chrome',headless:true});try{
 const context=await browser.newContext({viewport:{width:1280,height:900}}),base='https://feedbackpress.test',path='/first/?view=one&filter=x%20y',keys=[];
 let issue={id:'11111111-1111-4111-8111-111111111111',number:1,title:'Restore test',body:'Shared',author:'Owner',status:'todo',path,revision:1,target:{selector:'#target',x:.5,y:.5},activity:[],files:[]};
 await context.route(base+'/**',async route=>{const req=route.request(),url=new URL(req.url());
  if(url.pathname.endsWith('.css'))return route.fulfill({contentType:'text/css',body:fs.readFileSync('assets/review.css','utf8')});
  if(url.pathname==='/api/issues')return route.fulfill({json:{issues:[issue],total:1,page:1}});
  if(url.pathname.endsWith('/replies')){keys.push(req.headers()['idempotency-key']);const body=req.postDataJSON();if(body.revision!==issue.revision)return route.fulfill({status:409,json:{message:'Fixture stale revision'}});issue={...issue,revision:issue.revision+1,activity:[{id:'reply-1',kind:'reply',created_at:'2026-11-11T12:00:00Z',payload:{author:'Owner',body:body.body}}]};return route.fulfill({json:{...issue,reply_id:'reply-1'}})}
  if(url.pathname.startsWith('/api/'))return route.fulfill({json:issue});
  return route.fulfill({contentType:'text/html',body:`<!doctype html><meta charset="utf-8"><div id="target" style="margin:150px;padding:50px">Target</div><script>window.FeedbackPressConfig={api:'${base}/api/',home:'${base}',css:'${base}/review.css',nonce:'fixture',userName:'Owner',network:'restore-test',maxBytes:5242880}</script><script>${fs.readFileSync('assets/review.js','utf8')}</script>`})
 });
 const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));await page.goto(base+path);await page.getByRole('button',{name:'View issues',exact:true}).click();await page.locator('.issue-open').click();const popup=page.getByRole('region',{name:'Issue details'});await popup.waitFor();await page.waitForTimeout(100);issue={...issue,revision:2};
 await popup.getByRole('textbox',{name:'Reply',exact:true}).fill('Preserved across another page');await popup.getByRole('button',{name:'Reply',exact:true}).click();await page.getByText('Fixture stale revision',{exact:true}).waitFor();await page.goto(base+'/second/?view=two');await page.getByRole('button',{name:'Restore draft',exact:true}).click();await page.waitForURL(base+path+'#feedbackpress='+issue.id);
 await page.waitForFunction(()=>document.querySelector('#feedbackpress-root').shadowRoot.querySelector('.reply-form textarea')?.value==='Preserved across another page');await popup.getByRole('button',{name:'Reply',exact:true}).click();await page.getByRole('status').filter({hasText:'Saved'}).waitFor();assert.equal(issue.activity.length,1);assert.equal(keys.length,2);assert.equal(keys[0],keys[1]);assert.deepEqual(errors,[]);
 console.log('PASS Stale queued reply survives page changes; Restore returns to its full query-bearing address, restores text and retries with the original operation ID/current revision.');
}finally{await browser.close()}})().catch(error=>{console.error(error);process.exitCode=1});
