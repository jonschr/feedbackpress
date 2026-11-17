const {chromium}=require('playwright'),fs=require('node:fs'),assert=require('node:assert/strict');
(async()=>{const browser=await chromium.launch({channel:'chrome',headless:true});let paused=false;const writes=[];try{
 const base='https://feedbackpress.test',id='11111111-1111-4111-8111-111111111111';
 const issue={id,number:1,title:'Existing feedback',body:'Still readable',author:'Owner',author_id:'owner',owner_id:'owner',status:'todo',revision:1,path:'/',target:{selector:'#target',x:.5,y:.5},activity:[],files:[]};
 const context=await browser.newContext({viewport:{width:1280,height:900},reducedMotion:'reduce'});
 await context.route(base+'/**',async route=>{
  const request=route.request(),url=new URL(request.url()),isOwner=url.searchParams.get('owner')==='yes';
  if(url.pathname.endsWith('.css'))return route.fulfill({contentType:'text/css',body:fs.readFileSync('assets/review.css','utf8')});
  if(url.pathname.startsWith('/api/')){
   const owner=request.headers()['x-feedbackpress-expected-actor']==='owner';
   if(url.pathname==='/api/review-access'){
    if(request.method()==='POST'){assert.ok(owner);paused=request.postDataJSON().paused;}
    return route.fulfill({json:{paused,account_owner:owner,can_create:!paused||owner}});
   }
   if(request.method()!=='GET')writes.push(url.pathname);
   if(url.pathname==='/api/issues'&&request.method()==='POST'&&paused&&!owner)return route.fulfill({status:403,json:{code:'feedback_paused',message:'New client tickets are paused. You can still reply to existing tickets.'}});
   if(url.pathname.endsWith('/notes'))return route.fulfill({json:{notes:[]}});
   const visible={...issue,path:owner?'/?owner=yes':'/?owner=no'};
   if(url.pathname==='/api/issues')return route.fulfill({json:{issues:[visible],total:1,page:1}});
   return route.fulfill({json:visible});
  }
  return route.fulfill({contentType:'text/html',body:`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><div id="target" style="margin:180px 50px">Target</div><script>window.html2canvas=async()=>{const canvas=document.createElement('canvas');canvas.width=10;canvas.height=10;return canvas;};window.FeedbackPressConfig={reviewAccess:true,home:'${base}',api:'${base}/api/',css:'${base}/review.css',nonce:'fixture',userName:'${isOwner?'Owner':'Client'}',authorId:'${isOwner?'owner':'client'}',privateNotes:true,maxBytes:5242880};</script><script>${fs.readFileSync('assets/review.js','utf8')}</script>`});
 });
 const owner=await context.newPage(),errors=[];owner.on('pageerror',e=>errors.push(e.message));await owner.goto(base+'/?owner=yes');await owner.getByRole('button',{name:'View issues',exact:true}).click();
 await owner.getByRole('button',{name:'Pause new client tickets',exact:true}).click();await owner.getByRole('button',{name:'Resume new client tickets',exact:true}).waitFor();assert.ok(paused);await owner.screenshot({path:'/tmp/feedbackpress-review-pause-owner.png'});for(const width of [390,320]){await owner.setViewportSize({width,height:844});await owner.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));assert.ok(await owner.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));}await owner.setViewportSize({width:1280,height:900});await owner.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 await owner.locator('.issue-open').click();await owner.getByRole('textbox',{name:'Reply',exact:true}).waitFor();assert.equal(await owner.getByRole('switch',{name:'Private note',exact:true}).isEnabled(),true);
 await owner.getByRole('button',{name:'Dismiss issue',exact:true}).click();await owner.getByRole('button',{name:'Leave feedback',exact:true}).click();await owner.locator('#target').click({position:{x:4,y:4}});await owner.getByRole('textbox',{name:'Issue title',exact:true}).waitFor();await owner.keyboard.press('Escape');
 const client=await context.newPage();client.on('pageerror',e=>errors.push(e.message));await client.goto(base+'/?owner=no');await client.getByRole('button',{name:'View issues',exact:true}).click();await client.getByText('New tickets are paused. You can still reply and attach files.',{exact:true}).waitFor();
 assert.equal(await client.getByRole('button',{name:'Pause new client tickets',exact:true}).count(),0);assert.equal(await client.getByRole('button',{name:'Leave feedback',exact:true}).isDisabled(),true);
 await client.locator('.issue-open').click();await client.getByText('Still readable',{exact:true}).waitFor();assert.equal(await client.getByRole('textbox',{name:'Reply',exact:true}).isEnabled(),true);assert.equal(await client.getByRole('button',{name:'Attach files to reply',exact:true}).isEnabled(),true);assert.ok(await client.locator('.issue-popup .status-action').evaluateAll(nodes=>nodes.every(n=>!n.disabled)));await client.getByRole('textbox',{name:'Reply',exact:true}).fill('A client can respond while creation is paused');
 await client.keyboard.press('c');assert.equal(await client.getByRole('textbox',{name:'Issue title',exact:true}).count(),0);await client.evaluate(()=>{const range=document.createRange();range.selectNodeContents(document.querySelector('#target'));const selected=getSelection();selected.removeAllRanges();selected.addRange(range);});await client.keyboard.press('c');assert.equal(await client.getByRole('textbox',{name:'Issue title',exact:true}).count(),0);await client.evaluate(()=>getSelection().removeAllRanges());await client.setViewportSize({width:390,height:844});await client.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));assert.ok(await client.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await client.screenshot({path:'/tmp/feedbackpress-review-paused-client.png'});
 await owner.getByRole('button',{name:'View issues',exact:true}).click();await owner.getByRole('button',{name:'Resume new client tickets',exact:true}).click();await owner.getByRole('button',{name:'Pause new client tickets',exact:true}).waitFor();assert.equal(paused,false);
 await client.reload();await client.getByRole('textbox',{name:'Reply',exact:true}).waitFor();
 await client.setViewportSize({width:1280,height:900});await client.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));await client.getByRole('button',{name:'Dismiss issue',exact:true}).click();
 await client.getByRole('button',{name:'Leave feedback',exact:true}).click();await client.locator('#target').click({position:{x:4,y:4}});await client.getByRole('textbox',{name:'Issue title',exact:true}).fill('Draft started before the pause');paused=true;
 await client.getByRole('button',{name:'Submit feedback',exact:true}).click();await client.getByText('New client tickets are paused. You can still reply to existing tickets.',{exact:true}).first().waitFor();
 assert.ok(await client.locator('.issue-row[data-issue="'+id+'"]').count());await client.locator('.issue-row[data-issue="'+id+'"] .issue-open').click();await client.getByRole('textbox',{name:'Reply',exact:true}).waitFor();
 assert.deepEqual(writes,['/api/issues']);assert.deepEqual(errors,[]);
 console.log('PASS owner pause/resume and own issue/private-note controls, client readable issues with enabled reply/attachment/status controls and disabled creation shortcuts, mobile bounds and resumed feedback.');
}finally{await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1});
