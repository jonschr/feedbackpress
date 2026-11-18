// All traffic and clipboard operations use synthetic fixtures; no real invitations or grants.
const {chromium}=require('playwright'),fs=require('node:fs'),assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try {
  const base='https://feedbackpress.test',home=base+'/site',project='11111111-1111-4111-8111-111111111111';
  for(const variant of ['desktop','dark-mobile','narrow','touch','unavailable','clipboard-denied','denied','options-failed','identity-changed','guest']) {
   console.log('Checking',variant);
   const width=['narrow','touch'].includes(variant)?320:variant==='dark-mobile'?390:1280;
   const context=await browser.newContext({viewport:{width,height:844},colorScheme:variant==='dark-mobile'||variant==='touch'?'dark':'light',hasTouch:variant==='touch',reducedMotion:'reduce'});
   await context.addInitScript(denied=>Object.defineProperty(navigator,'clipboard',{value:{writeText:async value=>{if(denied)throw Error('Clipboard blocked');window.copied=value;}}}),variant==='clipboard-denied');
   const issues=Array.from({length:24},(_,i)=>({id:`${String(i+1).padStart(8,'0')}-1111-4111-8111-111111111111`,number:i+1,title:'An issue to review',body:'Shared context',path:'/',author:'Client',status:'todo',revision:1,files:[],activity:[],target:{selector:'#target',x:.5,y:.5}}));
   let options=0,copies=0;const sends=[],errors=[];let releaseFirstSend;
   await context.route(base+'/**',async route=>{
    const req=route.request(),url=new URL(req.url());
    if(url.pathname.endsWith('.css'))return route.fulfill({contentType:'text/css',body:fs.readFileSync('assets/review.css','utf8')});
    if(url.pathname.endsWith('.woff2'))return route.fulfill({contentType:'font/woff2',body:fs.readFileSync('assets/fonts/InterVariable.woff2')});
    if(url.pathname==='/review.js')return route.fulfill({contentType:'text/javascript',body:fs.readFileSync('assets/review.js','utf8')});
    if(url.pathname==='/api/admin/reviewers'){options++;if(variant==='options-failed'&&options===1)return route.fulfill({status:503,json:{message:'Could not load invitation options.'}});return route.fulfill({json:{users:[{id:42,name:'Existing reviewer',email:'existing@example.test'},{id:43,name:'Second reviewer with a longer name',email:'second@example.test'}]}});}
    if(url.pathname==='/api/admin/capabilities')return route.fulfill({json:{invitations:variant!=='unavailable'}});
    if(url.pathname==='/api/admin/review-link'){copies++;return route.fulfill(variant==='denied'?{status:403,json:{message:'Administrator access required.'}}:{headers:variant==='identity-changed'?{'X-FeedbackPress-Actor-Id':'different'}:{},json:{url:home+'/#fp-review=synthetic'}});}
    if(url.pathname==='/api/admin/invite'){
     sends.push({body:req.postDataJSON(),key:req.headers()['idempotency-key']});
     if(sends.length===1&&variant==='desktop')await new Promise(resolve=>{releaseFirstSend=resolve;});
     return route.fulfill(sends.length===1?{status:503,json:{message:'Could not send. Try again.'}}:{json:{sent:true,captured:false}});
    }
    if(url.pathname==='/api/review-access')return route.fulfill({json:{paused:false,can_create:true,account_owner:true}});
    if(url.pathname==='/api/issues')return route.fulfill({json:{issues,total:issues.length,page:1,project_counts:{open:24,closed:0,contains_private:false}}});
    if(url.pathname.startsWith('/api/'))return route.fulfill({json:issues.find(i=>url.pathname.endsWith(i.id))||{}});
    return route.fulfill({contentType:'text/html',body:`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;background:#f5f5f1;height:4000px;font:16px sans-serif}#target{padding:100px}</style><div id="target">A client website</div><script>window.FeedbackPressConfig=${JSON.stringify({home,api:base+'/api/',css:base+'/review.css',nonce:'fixture',network:project,userName:variant==='guest'?'':'Administrator',reviewSession:true,canShareReviewLinks:variant!=='guest',reviewAccess:true,privateNotes:true,authorId:'owner'})}</script><script src="/review.js"></script>`});
   });
   const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));await page.goto(home+'/');
   await page.getByRole('button',{name:'View issues',exact:true}).click();const panel=page.getByRole('complementary',{name:'Issues',exact:true});await panel.locator('.issue-row').last().waitFor();
   assert.equal(options,0,'Reviewer emails are loaded only when sharing opens');
   const toggle=panel.getByRole('button',{name:'Invite reviewers',exact:true});
   if(variant==='guest'){assert.equal(await toggle.count(),0);assert.equal(copies,0);await context.close();continue;}
   const list=panel.locator('.issue-list');await list.evaluate(n=>n.scrollTop=160);const top=await list.evaluate(n=>n.scrollTop);
   await toggle.click();const bar=panel.getByRole('region',{name:'Invite reviewers',exact:true,includeHidden:true}),mail=bar.getByRole('combobox',{name:'Reviewer email address',exact:true}),send=bar.getByRole('button',{name:'Send invitation',exact:true}),copy=bar.getByRole('button',{name:'Copy magic link',exact:true});
   await bar.waitFor();assert.equal(await toggle.getAttribute('aria-expanded'),'true');
   if(variant==='options-failed'){await bar.getByText(/Could not load invitation options/).waitFor();await toggle.click();await toggle.click();}
   if(variant==='unavailable'){await bar.getByText(/Email invites are unavailable/).waitFor();assert.equal(await send.isDisabled(),true);}else {await send.waitFor({state:'visible'});await page.waitForFunction(()=>!document.querySelector('#feedbackpress-root').shadowRoot.querySelector('.share-row [type=submit]').disabled);}
   assert.equal(await list.evaluate(n=>n.scrollTop),top);assert.equal(await mail.evaluate(n=>n.getRootNode().activeElement===n),true);
   const suggestions=page.getByRole('listbox',{name:'Site reviewers',exact:true});await suggestions.waitFor();
   assert.equal(await suggestions.getByRole('option').count(),2);assert.equal(await suggestions.locator('.share-option-name').first().textContent(),'Existing reviewer');assert.equal(await suggestions.locator('.share-option-email').first().textContent(),'existing@example.test');
   const padding=await bar.evaluate(n=>{const s=getComputedStyle(n);return [s.paddingTop,s.paddingRight,s.paddingBottom,s.paddingLeft]});assert.deepEqual(padding,['8px','8px','8px','8px']);
   const popup=await suggestions.boundingBox();assert.ok(popup.x>=0&&popup.x+popup.width<=width&&popup.y>=0&&popup.y+popup.height<=844);
   if(variant==='desktop'){
    await mail.fill('second');assert.equal(await suggestions.getByRole('option').count(),1);await mail.dispatchEvent('keydown',{key:'ArrowDown',isComposing:true});assert.equal(await mail.getAttribute('aria-activedescendant'),null);await mail.press('ArrowDown');assert.ok(await mail.getAttribute('aria-activedescendant'));await mail.press('Enter');assert.equal(await mail.inputValue(),'second@example.test');assert.equal(await suggestions.isVisible(),false);assert.equal(sends.length,0,'Selecting a person never sends an invitation');assert.equal(await mail.evaluate(n=>n.getRootNode().activeElement===n),true);
    await mail.fill('');await suggestions.getByRole('option',{name:'Existing reviewer existing@example.test',exact:true}).click();assert.equal(await mail.inputValue(),'existing@example.test');assert.equal(await suggestions.isVisible(),false);await mail.fill('');await mail.press('Escape');assert.equal(await suggestions.isVisible(),false);assert.equal(await bar.isVisible(),true);await mail.click();await suggestions.waitFor();
   }
   if(variant==='touch'){await suggestions.getByRole('option').first().tap();assert.equal(await mail.inputValue(),'existing@example.test');assert.equal(sends.length,0);await mail.fill('');}

   const bounds=await panel.evaluate(n=>{const p=n.getBoundingClientRect();return [...n.querySelectorAll('.sidebar-settings button,.sidebar-option,.share-row input,.share-row button')].filter(x=>x.getBoundingClientRect().width).every(x=>{const b=x.getBoundingClientRect();return b.left>=p.left&&b.right<=p.right+.5&&b.bottom<=innerHeight})});assert.equal(bounds,true,'Footer and invite controls stay inside panel');
   if(['desktop','dark-mobile','narrow','touch'].includes(variant))await panel.screenshot({path:'/tmp/feedbackpress-sharing-'+variant+'.png'});
   await copy.click();
   if(variant==='identity-changed'){await page.locator('.notice').getByText(/Your WordPress identity changed/).waitFor();assert.equal(await panel.isVisible(),false);assert.equal(await page.locator('.share-suggestions [role=option]').count(),0);assert.equal(await page.locator('.share-bar input[type=email]').inputValue(),'');assert.equal(await page.evaluate(()=>window.copied),undefined);assert.deepEqual(errors,[]);await context.close();continue;}
   if(variant==='clipboard-denied'){const fallback=bar.getByRole('textbox',{name:'Magic review link'});await fallback.waitFor();assert.equal(await fallback.inputValue(),home+'/?feedbackpress=open#fp-review=synthetic');assert.equal(await page.evaluate(()=>window.copied),undefined);await fallback.press('Escape');assert.equal(await bar.isVisible(),false);assert.equal(await bar.locator('input[aria-label="Magic review link"]').inputValue(),'');await toggle.click();}
   else if(variant==='denied'){await bar.getByText('Administrator access required.',{exact:true}).waitFor();assert.equal(await list.locator('.issue-row').count(),24,'Sharing denial does not erase otherwise authorized issues');}
   else{await bar.getByText(/Magic link copied/).waitFor();assert.equal(await page.evaluate(()=>window.copied),home+'/?feedbackpress=open#fp-review=synthetic');assert.equal(sends.length,0,'Copy does not send an email');}
   if(variant==='desktop'){
    await mail.fill('client@example.test');await mail.press('Enter');await bar.getByText('Sending invitation…',{exact:true}).waitFor();assert.equal(await send.isDisabled(),true);releaseFirstSend();await bar.getByText('Could not send. Try again.',{exact:true}).waitFor();assert.equal(await mail.inputValue(),'client@example.test');
    await mail.press('Control+Enter');await bar.getByText('Invitation sent to client@example.test.',{exact:true}).waitFor();assert.equal(sends.length,2);assert.equal(sends[0].key,sends[1].key);assert.deepEqual(sends[0].body,sends[1].body);assert.equal(sends[1].body.project,project);assert.equal(sends[1].body.user_id,0);assert.equal(await mail.inputValue(),'');
    await mail.fill('existing@example.test');await send.click();await bar.getByText('Invitation sent to existing@example.test.',{exact:true}).waitFor();assert.equal(sends[2].body.user_id,42);assert.equal(sends[2].body.email,'');assert.notEqual(sends[2].key,sends[1].key);
    await mail.fill('kept@example.test');await mail.press('Escape');assert.equal(await bar.isVisible(),false);assert.equal(await panel.isVisible(),true);await toggle.click();assert.equal(await mail.inputValue(),'kept@example.test');
    await panel.getByRole('button',{name:'Dismiss issues',exact:true}).click();await page.getByRole('button',{name:'View issues',exact:true}).click();assert.equal(await bar.isVisible(),false);
   }
   assert.deepEqual(errors,[]);await context.close();
  }
  console.log('PASS overlay invitation/copy bar: lazy admin-only users, native-user/custom email, retries/idempotency, no-mail copying, clipboard fallback, unavailable/denied/retry states, keyboard/dismissal, independent scrolling and 1280/390/320px light/dark/touch layouts.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1});
