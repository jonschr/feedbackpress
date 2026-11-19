// Synthetic site administrator and review grant; all HTTP/clipboard operations intercepted.
const {chromium}=require('playwright'),fs=require('node:fs'),assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
  const base='https://feedbackpress.test',home=base+'/site',shared='https://review.example.com/site',grant='22222222-2222-4222-8222-222222222222.'+'a'.repeat(43),id='11111111-1111-4111-8111-111111111111',path='/about/?x=a%20b&x=c';
  for(const state of ['owner','other-owner','private','nonadmin','clipboard-denied','denied']){
   const context=await browser.newContext({viewport:{width:1280,height:900},reducedMotion:'reduce'}),errors=[];let requests=0;
   await context.addInitScript(denied=>{Object.defineProperty(navigator,'clipboard',{value:{writeText:async text=>{if(denied)throw Error('Clipboard unavailable');window.copiedLink=text;}}});},state==='clipboard-denied');
   const issue={id,number:7,title:'Share this ticket',body:'Shared text',path,author:'Writer',author_id:'owner',owner_id:state==='other-owner'?'other':'owner',status:'todo',revision:1,visibility:state==='private'?'private':'shared',activity:[],files:[],target:{selector:'#target',x:.5,y:.5}};
   await context.route(base+'/**',route=>{
    const req=route.request(),u=new URL(req.url());
    if(u.pathname==='/review.css')return route.fulfill({contentType:'text/css',body:fs.readFileSync('assets/review.css','utf8')});
    if(u.pathname==='/review.js')return route.fulfill({contentType:'text/javascript',body:fs.readFileSync('assets/review.js','utf8')});
    if(u.pathname==='/api/admin/review-link'){requests++;return route.fulfill(state==='denied'?{status:403,json:{message:'Administrator access required.'}}:{json:{url:shared+'/#fp-review='+grant}});}
    if(u.pathname==='/api/issues')return route.fulfill({json:{issues:[issue],total:1,page:1}});
    if(u.pathname.endsWith('/notes'))return route.fulfill({json:{notes:[]}});
    if(u.pathname.startsWith('/api/'))return route.fulfill({json:issue});
    return route.fulfill({contentType:'text/html',body:`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><div id="target" style="margin:160px;width:150px;height:150px">Target</div><script>window.FeedbackPressConfig=${JSON.stringify({home,api:base+'/api/',css:base+'/review.css',nonce:'fixture',userName:'Site administrator',authorId:'owner',privateNotes:true,canShareReviewLinks:state!=='nonadmin',reviewSession:true})}</script><script src="/review.js"></script>`});
   });
   const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto(home+path+'#feedbackpress='+id);
   const popup=page.getByRole('region',{name:'Issue details',exact:true});await popup.waitFor();await popup.getByRole('button',{name:'Actions for issue',exact:true}).click();
   const menu=page.locator('.note-actions:popover-open'),copy=menu.getByRole('button',{name:'Copy magic link',exact:true});
   if(state==='private'||state==='nonadmin'){assert.equal(await copy.count(),0);assert.equal(requests,0);}
   else{
    if(state==='other-owner'){assert.equal(await menu.getByRole('button',{name:'Edit',exact:true}).count(),0);assert.equal(await menu.getByRole('button',{name:'Delete',exact:true}).count(),0);}
    await copy.click();
    if(state==='denied'){await page.locator('.notice').getByText('Administrator access required.',{exact:true}).waitFor();assert.equal(await page.evaluate(()=>window.copiedLink),undefined);assert.equal(await popup.isVisible(),true);assert.equal(await page.locator('.issue-row').count(),1);}
    else{
     let value;
     if(state==='clipboard-denied'){const field=page.getByRole('textbox',{name:'Magic link for issue 7',exact:true});await field.waitFor();assert.equal(await field.getAttribute('readonly'),'');value=await field.inputValue();}
     else{await page.waitForFunction(()=>window.copiedLink);value=await page.evaluate(()=>copiedLink);}
     const link=new URL(value),hash=new URLSearchParams(link.hash.slice(1));assert.equal(link.origin,new URL(shared).origin);assert.equal(link.pathname,'/site/about/');assert.equal(link.search,'?x=a%20b&x=c');assert.equal(hash.get('fp-review'),grant);assert.equal(hash.get('fp-return'),'feedbackpress='+id);
     const row=page.locator('.issue-row').first();await row.hover();await row.getByRole('button',{name:'Actions for issue',exact:true}).click();await page.locator('.note-actions:popover-open').getByRole('button',{name:'Copy magic link',exact:true}).waitFor();
    }
    assert.equal(requests,1);
   }
   assert.deepEqual(errors,[]);await context.close();
  }
  console.log('PASS admin card/sidebar issue magic links, subdirectory/query/issue targeting, other-author copy-only actions, private/nonadmin exclusion, denied endpoint and clipboard fallback. No real grant copied.');
 }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
