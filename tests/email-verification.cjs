// All mail, cookies and API results are synthetic. No messages or feedback leave this browser.
const {chromium}=require('playwright'),fs=require('node:fs'),assert=require('node:assert/strict');
(async()=>{const browser=await chromium.launch({channel:'chrome',headless:true});try{
 const base='https://feedbackpress.test',id='11111111-1111-4111-8111-111111111111',reviewer={name:'Verified Reviewer',email:'reviewer@example.test',id:'a'.repeat(64)};
 async function fixture({native=false,remembered=false}={}){
  const context=await browser.newContext({viewport:{width:390,height:844},colorScheme:'dark',reducedMotion:'reduce'}),mail=[],writes=[],errors=[];let mailStarted;const started=new Promise(resolve=>mailStarted=resolve);let verified=remembered,failMail=false,rejectWrite=false,holdMail=null;
  await context.addCookies([{name:'feedbackpress_name',value:'Forged',url:base},{name:'feedbackpress_email',value:'other%40example.test',url:base}]);
  let issue={id,number:1,title:'Email proof fixture',body:'Shared original',author:'Verified Reviewer',owner_id:reviewer.id,author_id:reviewer.id,status:'todo',revision:1,path:'/?view=one',activity:[],files:[],target:{selector:'#target',x:.5,y:.5}};
  await context.route(base+'/**',async route=>{const req=route.request(),url=new URL(req.url()),path=url.pathname.slice(5);
   if(url.pathname==='/review.css')return route.fulfill({contentType:'text/css',body:fs.readFileSync('assets/review.css','utf8')});
   if(url.pathname==='/review.js')return route.fulfill({contentType:'text/javascript',body:fs.readFileSync('assets/review.js','utf8')});
   if(url.pathname.endsWith('.woff2'))return route.fulfill({contentType:'font/woff2',body:fs.readFileSync('assets/fonts/InterVariable.woff2')});
   if(path==='identity/verification'){
    if(req.method()==='GET')return route.fulfill({json:{verified,reviewer:verified?reviewer:null}});
    mail.push({key:req.headers()['idempotency-key'],body:req.postDataJSON()});mailStarted();if(holdMail)await holdMail;
    return failMail?route.fulfill({status:503,json:{message:'Email unavailable. Try again.'}}):route.fulfill({json:{pending:true}});
   }
   if(path==='identity')return route.fulfill({json:{author_id:reviewer.id}});
   if(url.pathname.startsWith('/api/')){
    if(req.method()!=='GET'){
     writes.push({path,body:path.endsWith('/files')?null:req.postDataJSON()});
     if(rejectWrite)return route.fulfill({status:403,json:{code:'email_verification_required',message:'Verify your email before leaving feedback.'}});
     assert.ok(native||verified,'A contribution was attempted before email proof');
     if(path.endsWith('/replies'))issue={...issue,revision:issue.revision+1,activity:[...issue.activity,{id:'22222222-2222-4222-8222-222222222222',kind:'reply',created_at:new Date().toISOString(),payload:{...req.postDataJSON(),author_id:reviewer.id}}]};
    }
    return route.fulfill({json:path==='issues'&&req.method()==='GET'?{issues:[issue],total:1,page:1}:issue});
   }
   const config={api:base+'/api/',home:base,css:base+'/review.css',nonce:'fixture',network:'fixture-project',loginUrl:base+'/wp-login.php',userName:native?'WordPress Owner':'',authorId:native?reviewer.id:'',verifiedReviewer:remembered?reviewer:null,privateNotes:native,reviewSession:true,maxBytes:5242880};
   return route.fulfill({contentType:'text/html',body:`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><div id="target" style="margin:100px;width:120px;height:200px">Shared target</div><script>window.FeedbackPressConfig=${JSON.stringify(config)}</script><script src="/review.js"></script>`});
  });
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto(base+'/?view=one#feedbackpress='+id);
  const popup=page.getByRole('region',{name:'Issue details',exact:true}),prompt=page.getByRole('region',{name:'Introduce yourself',exact:true});await popup.waitFor();
  const reply=async text=>{await popup.getByRole('textbox',{name:'Reply',exact:true}).fill(text);await popup.getByRole('button',{name:'Reply',exact:true}).click();};
  const send=async()=>{await prompt.getByLabel('Your name',{exact:true}).fill(reviewer.name);await prompt.getByLabel('Email address',{exact:true}).fill(reviewer.email);await prompt.getByRole('button',{name:/^(Send verification email|Send again)$/}).click();};
  const finish=async()=>{assert.deepEqual(errors,[]);await context.close();};
  return {page,popup,prompt,mail,started,writes,reply,send,finish,setVerified:value=>verified=value,setMailFailure:value=>failMail=value,setWriteFailure:value=>rejectWrite=value,hold:value=>holdMail=value};
 }
 // An editable name/email cookie grants no ability to post; sending mail never submits the draft.
 const f=await fixture();await f.reply('Keep this draft while checking email');await f.prompt.waitFor();assert.equal(f.writes.length,0);f.setMailFailure(true);await f.send();await f.prompt.getByText('Email unavailable. Try again.',{exact:true}).waitFor();assert.equal(await f.popup.getByRole('textbox',{name:'Reply',exact:true}).inputValue(),'Keep this draft while checking email');
 f.setMailFailure(false);await f.send();await f.prompt.getByText('Check your email, then return here. Your draft is kept.',{exact:true}).waitFor();assert.equal(f.mail.length,2);assert.equal(f.mail[0].key,f.mail[1].key,'Transport retry lost its request identity');assert.equal(f.mail[1].body.path,'/?view=one');assert.equal(f.mail[1].body.return,'feedbackpress='+id);assert.equal(f.writes.length,0);
 await f.prompt.getByRole('button',{name:'Send again',exact:true}).click();await f.prompt.getByText('Check your email, then return here. Your draft is kept.',{exact:true}).waitFor();assert.notEqual(f.mail[1].key,f.mail[2].key,'Explicit resend reused an already delivered operation');await f.prompt.screenshot({path:'/tmp/feedbackpress-email-verification-dark.png'});
 f.setVerified(true);await f.prompt.waitFor({state:'hidden'});await f.page.waitForFunction(()=>document.querySelector('#feedbackpress-root').shadowRoot.querySelector('.work-item[data-state=done]'));assert.equal(f.writes.length,1);assert.equal(f.writes[0].body.body,'Keep this draft while checking email');assert.equal(f.writes[0].body.author_email,reviewer.email);await f.finish();
 // Closing while mail is in flight cannot run a hidden pending contribution later.
 const cancelled=await fixture();let release;cancelled.hold(new Promise(resolve=>release=resolve));await cancelled.reply('Do not submit after dismissal');await cancelled.send();await cancelled.started;assert.equal(cancelled.mail.length,1);
 await cancelled.prompt.getByRole('button',{name:'Dismiss name prompt',exact:true}).click();cancelled.setVerified(true);release();await cancelled.page.waitForTimeout(3000);assert.equal(cancelled.writes.length,0);assert.equal(await cancelled.popup.getByRole('textbox',{name:'Reply',exact:true}).inputValue(),'Do not submit after dismissal');await cancelled.finish();
 // Native login and an existing verified cookie both bypass mail; server proof overrides forged attribution cookies.
 for(const native of [false,true]){const known=await fixture({native,remembered:!native});await known.reply('Already verified');await known.page.waitForFunction(()=>document.querySelector('#feedbackpress-root').shadowRoot.querySelector('.work-item[data-state=done]'));assert.equal(known.mail.length,0);assert.equal(known.writes.length,1);assert.equal(known.writes[0].body.author,native?'WordPress Owner':reviewer.name);assert.equal(await known.prompt.isVisible(),false);await known.finish();}
 // Expiry on a stale tab retains the issue and queued draft, then allows re-verification and a single retry.
 const stale=await fixture({remembered:true});stale.setVerified(false);stale.setWriteFailure(true);await stale.reply('Recover after expiry');await stale.page.getByText('Verify your email before leaving feedback.',{exact:true}).waitFor();assert.equal(await stale.popup.isVisible(),true);stale.setWriteFailure(false);await stale.page.locator('.work-item').getByRole('button',{name:'Retry',exact:true}).click();await stale.prompt.waitFor();assert.equal(stale.writes.length,1);await stale.send();await stale.prompt.getByText('Check your email, then return here. Your draft is kept.',{exact:true}).waitFor();stale.setVerified(true);await stale.prompt.waitFor({state:'hidden'});await stale.page.waitForFunction(()=>document.querySelector('#feedbackpress-root').shadowRoot.querySelector('.work-item[data-state=done]'));assert.equal(stale.writes.length,2);assert.equal(stale.writes[1].body.body,'Recover after expiry');await stale.finish();
 console.log('PASS first-contribution email gate, forged-cookie rejection, stable failed-send retry, explicit resend, pending draft continuation/cancellation, remembered/native bypass, stale-proof recovery and attributed writes. All requests intercepted.');
}finally{await browser.close()}})().catch(error=>{console.error(error);process.exitCode=1});
