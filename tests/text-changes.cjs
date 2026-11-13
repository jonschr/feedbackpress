// All central writes intercepted; never changes WordPress content or sends email.
const {chromium}=require('playwright'),fs=require('node:fs'),assert=require('node:assert/strict');
(async()=>{const browser=await chromium.launch({channel:'chrome',headless:true});try{
 const base='https://feedbackpress.test',original='  We build websites for businesses.  ',id='11111111-1111-4111-8111-111111111111';let saved=null,writes=0;
 const context=await browser.newContext({viewport:{width:1440,height:900},colorScheme:'dark',reducedMotion:'reduce'});
 await context.route('**/*',route=>{const req=route.request(),url=new URL(req.url());
  if(url.pathname.endsWith('.woff2'))return route.fulfill({contentType:'font/woff2',body:fs.readFileSync('assets/fonts/InterVariable.woff2')});
  if(url.pathname.endsWith('.css'))return route.fulfill({contentType:'text/css',body:fs.readFileSync('assets/review.css','utf8')});
  if(url.pathname.startsWith('/api/')){
   const headers={'X-FeedbackPress-Actor-Id':'owner'};
   if(req.method()==='POST'&&url.pathname==='/api/issues'){writes++;const body=req.postDataJSON();saved={...body,id,number:1,revision:'1',edit_revision:'1',target_revision:'1',author:'Owner',author_id:'owner',owner_id:'owner',created_at:new Date().toISOString(),activity:[],files:[]};return route.fulfill({headers,json:saved});}
   if(req.method()==='POST'&&url.pathname.endsWith('/manage')){const body=req.postDataJSON();saved={...saved,title:body.title,body:body.body,target:{...saved.target,text_change:{...saved.target.text_change,proposed:body.proposed_text}},revision:'2',edit_revision:'2'};return route.fulfill({headers,json:saved});}
   if(url.pathname.endsWith('/notes'))return route.fulfill({headers,json:{notes:[]}});
   if(url.pathname.endsWith('/mentions'))return route.fulfill({headers,json:{people:[]}});
   if(url.pathname==='/api/issues')return route.fulfill({headers,json:{issues:saved?[saved]:[],total:saved?1:0,page:1}});
   if(url.pathname==='/api/activity')return route.fulfill({headers,json:{issues:saved?[saved]:[],cursor:'1',network:'fixture'}});
   if(saved&&url.pathname==='/api/issues/'+id)return route.fulfill({headers,json:saved});
   return route.fulfill({headers,json:{}});
  }
  return route.fulfill({contentType:'text/html',body:`<!doctype html><style>body{margin:0;padding:120px;font-family:sans-serif}h1{width:420px}#rich{margin-top:40px}</style><h1 id="target">${original}</h1><p id="rich">Rich <strong>formatting</strong></p><script>window.FeedbackPressConfig={api:'${base}/api/',css:'${base}/review.css',home:'${base}',nonce:'fixture',userName:'Owner',authorId:'owner',privateNotes:true,maxBytes:5242880,network:'fixture'};</script><script>${fs.readFileSync('assets/review.js','utf8')}</script>`});
 });
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(base);
 const host=page.locator('#feedbackpress-root');await page.getByRole('button',{name:'Leave feedback',exact:true}).click();await page.locator('#target').click();
 const composer=page.getByRole('region',{name:'New feedback'});await composer.getByRole('textbox',{name:'Issue title'}).fill('Keep this note draft');await composer.locator('textarea').fill('Keep this description');
 await composer.getByRole('button',{name:'Text change',exact:true}).click();assert.equal(await page.locator('#target').getAttribute('contenteditable'),'plaintext-only');await page.locator('#target').fill('We build sites that help businesses grow.');
 await composer.getByRole('button',{name:'Note',exact:true}).click();assert.equal(await page.locator('#target').textContent(),original);assert.equal(await composer.getByRole('textbox',{name:'Issue title'}).inputValue(),'Keep this note draft');assert.equal(await composer.locator('textarea').inputValue(),'Keep this description');
 await composer.getByRole('button',{name:'Text change',exact:true}).click();assert.equal(await page.locator('#target').textContent(),'We build sites that help businesses grow.');await composer.getByRole('button',{name:'Save suggestion',exact:true}).click();
 await page.waitForFunction(()=>!document.querySelector('#feedbackpress-root').shadowRoot.querySelector('.work-item[data-state=text]'));
 await page.getByRole('button',{name:'View issues',exact:true}).click();await page.locator('.issue-open').first().click();
 const popup=page.getByRole('region',{name:'Issue details'});await popup.locator('.text-change-view').waitFor();await page.screenshot({path:'/tmp/feedbackpress-text-change-dark.png'});assert.equal(writes,1);assert.deepEqual(saved.target.text_change,{original,proposed:'We build sites that help businesses grow.'});assert.equal(await page.locator('#target').textContent(),original);
 await popup.getByLabel('Preview on page').check();assert.equal(await page.locator('#target').textContent(),'We build sites that help businesses grow.');await popup.getByRole('button',{name:'Dismiss issue',exact:true}).click();assert.equal(await page.locator('#target').textContent(),original);assert.equal(await page.locator('#target').getAttribute('contenteditable'),null);
 await page.locator('.issue-open').first().click();await popup.getByRole('button',{name:'Actions for issue',exact:true}).click();await page.getByRole('button',{name:'Edit',exact:true}).click();await popup.getByRole('textbox',{name:'Edit suggested wording',exact:true}).fill('A revised proposal');await popup.getByRole('button',{name:'Save',exact:true}).click();await page.waitForFunction(()=>document.querySelector('#feedbackpress-root').shadowRoot.querySelector('.text-change-proposed')?.textContent==='A revised proposal');await popup.getByLabel('Preview on page').check();await page.locator('#target').evaluate(n=>n.textContent='Theme updated this heading');await popup.getByRole('button',{name:'Dismiss issue',exact:true}).click();assert.equal(await page.locator('#target').textContent(),'Theme updated this heading','Closing a preview must preserve an unrelated host change');

 const appearance=()=>page.getByRole('button',{name:/Appearance:/});assert.equal(await host.getAttribute('data-appearance'),'dark');await appearance().click();assert.equal(await host.getAttribute('data-appearance'),'light');await page.emulateMedia({colorScheme:'dark'});assert.equal(await host.getAttribute('data-appearance'),'light');await appearance().click();assert.equal(await host.getAttribute('data-appearance'),'dark');await appearance().click();await page.emulateMedia({colorScheme:'light'});await page.waitForFunction(()=>document.querySelector('#feedbackpress-root').dataset.appearance==='light');
 await page.reload();assert.equal(await host.getAttribute('data-appearance'),'light');
 await page.getByRole('button',{name:'Leave feedback',exact:true}).click();await page.locator('#rich').click({position:{x:5,y:5}});await composer.getByRole('button',{name:'Select a heading, paragraph or plain-text label'}).count();assert.equal(await composer.getByRole('button',{name:'Text change',exact:true}).isDisabled(),true);await page.keyboard.press('Escape');
 assert.deepEqual(errors,[]);console.log('PASS text-change creation, exact original whitespace, retained mode drafts, one background write, safe preview/cleanup, rich-text guard and system/manual appearance.');
 }finally{await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1});
