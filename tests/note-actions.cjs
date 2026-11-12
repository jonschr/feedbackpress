// Synthetic owner gateway only. No provider or customer data.
const {chromium}=require('playwright'),fs=require('node:fs'),assert=require('node:assert/strict');
(async()=>{const browser=await chromium.launch({channel:'chrome',headless:true});try{
 const base='https://feedbackpress.test',owner='owner',root='11111111-1111-4111-8111-111111111111',reply='22222222-2222-4222-8222-222222222222',other='33333333-3333-4333-8333-333333333333',human='44444444-4444-4444-8444-444444444444',agent='55555555-5555-4555-8555-555555555555';
 const original={id:root,number:1,title:'Owner issue',body:'Original issue text',author:'Owner',author_id:owner,owner_id:owner,status:'todo',revision:1,visibility:'shared',path:'/',created_at:'2026-11-12T12:00:00Z',activity:[{id:reply,kind:'reply',created_at:'2026-11-12T12:00:01Z',payload:{body:'My reply sentinel',author:'Owner',author_id:owner,owner_id:owner,visibility:'shared'}},{id:other,kind:'reply',created_at:'2026-11-12T12:00:02Z',payload:{body:'Someone else reply',author:'Someone else',author_id:'other',owner_id:'other',visibility:'shared'}}],files:[],target:{selector:'#target',x:.5,y:.5}};
 let issue=structuredClone(original),notes=[{id:human,issue_id:root,body:'Private human text',author_kind:'human',author_name:'Owner',revision:1,created_at:'2026-11-12T12:00:03Z'},{id:agent,issue_id:root,body:'Private agent text',author_kind:'agent',author_name:'Owner',agent:'Codex',revision:1}],actor=owner,delay=0,deleted=false;
 const context=await browser.newContext({viewport:{width:1280,height:900},reducedMotion:'reduce'});
 await context.route(base+'/**',async route=>{const req=route.request(),u=new URL(req.url()),path=u.pathname;const respond=(data,status=200)=>{for(const row of [...(data.issues||[]),...(data.issue?[data.issue]:[]),...(data.id===root?[data]:[])]){row.edit_revision=row.revision;for(const event of row.activity||[])event.payload.edit_revision=row.revision;}return route.fulfill({status,headers:{'X-FeedbackPress-Actor-Id':actor},json:data})};
  if(path.endsWith('.woff2'))return route.fulfill({contentType:'font/woff2',body:fs.readFileSync('assets/fonts/InterVariable.woff2')});
  if(path.endsWith('.css'))return route.fulfill({contentType:'text/css',body:fs.readFileSync('assets/review.css','utf8')});
  if(path==='/api/issues')return respond({issues:deleted?[]:[structuredClone(issue)],total:deleted?0:1,page:1});
  if(path.endsWith('/notes')&&req.method()==='GET')return respond({notes:structuredClone(notes)});
  if(path.includes('/notes/')){
   const id=path.split('/')[5],note=notes.find(n=>n.id===id),body=req.postDataJSON();if(!note)return respond({message:'Missing note'},404);if(body.revision!==note.revision)return respond({message:'This note changed elsewhere.'},409);
   if(req.method()==='DELETE'){notes=notes.filter(n=>n.id!==id);return respond({deleted:true})}
   if(path.endsWith('/convert')){issue.activity.push({id,kind:'reply',created_at:note.created_at,payload:{body:note.body,author:'Owner',author_id:owner,owner_id:owner,visibility:'shared'}});notes=notes.filter(n=>n.id!==id);issue.revision++;return respond({visibility:'shared',issue:structuredClone(issue)})}
   note.body=body.body;note.revision++;note.edited_at='2026-11-12T13:00:00Z';return respond(note);
  }
  if(path.endsWith('/manage')){
   const body=req.postDataJSON(),id=path.includes('/comments/')?path.split('/')[5]:root;
   if(actor!==owner)return respond({message:'Identity changed'},403);
   if(delay)await new Promise(r=>setTimeout(r,delay));
   if(body.revision!==issue.revision)return respond({message:'Stale revision'},409);
   if(id===other)return respond({message:'Not your note'},403);
   const target=id===root?issue:issue.activity.find(e=>e.id===id)?.payload;
   if(body.action==='edit'){target.body=body.body;if(body.title)target.title=body.title;}
   else if(body.action==='delete'){if(id===root){deleted=true;return respond({deleted:true,id:root})}issue.activity=issue.activity.filter(e=>e.id!==id)}
   else target.visibility=body.action==='private'?'private':'shared';
   issue.revision++;return respond(structuredClone(issue));
  }
  if(path.startsWith('/api/issues/'))return respond(structuredClone(issue));
  if(path.startsWith('/api/'))return respond({});
  return route.fulfill({contentType:'text/html',body:`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><div id="target" style="margin:180px">Target</div><script>window.FeedbackPressConfig={api:'${base}/api/',home:'${base}',css:'${base}/review.css',nonce:'fixture',userName:'Owner',authorId:'owner',privateNotes:true,maxBytes:5242880}</script><script>${fs.readFileSync('assets/review.js','utf8')}</script>`});
 });
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(base);await page.getByRole('button',{name:'View issues',exact:true}).click();await page.locator('.issue-open').click();await page.getByText('Private human text',{exact:true}).waitFor();
 const popup=page.getByRole('region',{name:'Issue details',exact:true});
 const choose=async(id,label)=>{const comment=popup.locator(`[data-comment="${id}"],[data-note="${id}"]`);await comment.locator('.note-actions-trigger').click();await popup.locator('.note-actions:popover-open').getByRole('button',{name:label,exact:true}).click()};
 const confirm=async(id,label)=>{await popup.locator(`[data-confirm-note="${id}"]`).getByRole('button',{name:label,exact:true}).click();await page.waitForFunction(id=>!document.querySelector('#feedbackpress-root').shadowRoot.querySelector(`[data-confirm-note="${id}"]`),id)};
 assert.equal(await popup.locator(`[data-comment="${other}"] .note-actions-trigger`).count(),0);
 await choose(human,'Edit');const privateEditor=popup.getByRole('textbox',{name:'Edit private note',exact:true});await privateEditor.fill('Edited private human text');await popup.locator('[data-private-edit]').getByRole('button',{name:'Save',exact:true}).click();await page.getByText('Edited private human text',{exact:true}).waitFor();
 await choose(human,'Make public');await confirm(human,'Make public');await page.getByText('Edited private human text',{exact:true}).waitFor();assert.equal(await popup.locator(`[data-note="${human}"]`).count(),0);assert.ok(issue.activity.some(e=>e.id===human));
 await choose(reply,'Make private');await confirm(reply,'Make private');await popup.locator(`[data-comment="${reply}"] .private-label`).waitFor();
 await page.evaluate(()=>new Promise(r=>setTimeout(r,30)));assert.ok(!await page.evaluate(()=>JSON.stringify(sessionStorage).includes('My reply sentinel')));
 await choose(reply,'Edit');delay=600;await popup.getByRole('textbox',{name:'Edit comment',exact:true}).fill('Private edit never persisted');await popup.locator('[data-edit-comment]').getByRole('button',{name:'Save',exact:true}).click();assert.ok(!await page.evaluate(()=>JSON.stringify(sessionStorage).includes('Private edit never persisted')));await page.getByText('Private edit never persisted',{exact:true}).waitFor();await page.waitForFunction(()=>document.querySelector('#feedbackpress-root').shadowRoot.querySelector('.work-item[data-state=done]'));delay=0;
 const jobs=await page.evaluate(()=>new Promise(resolve=>{const open=indexedDB.open('feedbackpress-work',1);open.onsuccess=()=>{const get=open.result.transaction('jobs').objectStore('jobs').getAll();get.onsuccess=()=>resolve(get.result)}}));assert.ok(!JSON.stringify(jobs).includes('Private edit never persisted'));
 await choose(reply,'Make public');await confirm(reply,'Make public');assert.equal(await popup.locator(`[data-comment="${reply}"] .private-label`).count(),0);
 await choose(reply,'Delete');await confirm(reply,'Delete reply');assert.equal(await popup.locator(`[data-comment="${reply}"]`).count(),0);
 await choose(agent,'Delete');await confirm(agent,'Delete note');assert.equal(await popup.locator(`[data-note="${agent}"]`).count(),0);
 await choose(root,'Make private');await confirm(root,'Make private');await popup.locator(`[data-comment="${root}"] .private-label`).waitFor();
 await choose(root,'Edit');await popup.getByRole('textbox',{name:'Edit comment',exact:true}).fill('PRIVATE ROOT NEVER STORED');await popup.locator('[data-edit-comment]').getByRole('button',{name:'Save',exact:true}).click();await page.getByText('PRIVATE ROOT NEVER STORED',{exact:true}).waitFor();await page.waitForTimeout(30);assert.ok(!await page.evaluate(()=>JSON.stringify(sessionStorage).includes('PRIVATE ROOT NEVER STORED')));
 for(const width of [390,320]){await page.setViewportSize({width,height:844});await popup.locator(`[data-comment="${root}"] .note-actions-trigger`).click();const menu=popup.locator('.note-actions:popover-open');await menu.waitFor();const r=await menu.boundingBox();assert.ok(r.x>=0&&r.x+r.width<=width&&r.y>=0);await page.screenshot({path:`/tmp/feedbackpress-note-actions-${width}.png`});await page.keyboard.press('Escape');assert.equal(await popup.isVisible(),true)}
 await choose(root,'Make public');await confirm(root,'Make public');await choose(root,'Delete');await confirm(root,'Delete issue');assert.equal(await popup.isVisible(),false);assert.equal(await page.locator('.issue-row').count(),0);
 // A different WordPress actor cannot retain a private editor or private thread in the old page.
 deleted=false;issue=structuredClone(original);issue.visibility='private';issue.body='ACCOUNT SWITCH PRIVATE SENTINEL';await page.reload();await page.locator('.issue-open').click();await page.getByText(issue.body,{exact:true}).waitFor();await choose(root,'Edit');await popup.getByRole('textbox',{name:'Edit comment',exact:true}).fill('ACCOUNT SWITCH PRIVATE DRAFT');actor='different';await popup.locator('[data-edit-comment]').getByRole('button',{name:'Save',exact:true}).click();await page.getByText('Your WordPress identity changed. Reload this page to continue.',{exact:true}).first().waitFor();assert.equal(await popup.isVisible(),false);assert.ok(!await page.evaluate(()=>JSON.stringify(sessionStorage).includes('ACCOUNT SWITCH PRIVATE')));assert.equal(await page.getByText('ACCOUNT SWITCH PRIVATE SENTINEL',{exact:true}).count(),0);assert.deepEqual(errors,[]);
 console.log('PASS Owner-only issue/reply/private-note edit, public/private/delete confirmations, private memory-only edits/cache/jobs, native menu/keyboard/320px bounds and WP identity-change purge.');
}finally{await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1});
