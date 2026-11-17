// All HTTP is intercepted. No real review links, accounts, feedback or email.
const {chromium}=require('playwright'),fs=require('node:fs'),assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try {
  const base='https://feedbackpress.test',id='11111111-1111-4111-8111-111111111111';
  async function fixture(entry,reviewSession=true,width=1280,colorScheme='light'){
   const context=await browser.newContext({viewport:{width,height:900},colorScheme,reducedMotion:'reduce'}),writes=[],errors=[];
   let issue={id,number:1,title:'Review without registration',body:'Original shared text',author:'Client',status:'todo',revision:1,path:'/',target:{selector:'#target',x:.5,y:.5},files:[{id:'33333333-3333-4333-8333-333333333333',comment_id:id,name:'screenshot.png',mime:'image/png',screenshot:true,available:true}],activity:[]};
   await context.route(base+'/**',route=>{
    const req=route.request(),url=new URL(req.url()),path=url.pathname.slice(5);
    if(url.pathname.endsWith('.woff2'))return route.fulfill({contentType:'font/woff2',body:fs.readFileSync('assets/fonts/InterVariable.woff2')});
    if(url.pathname==='/review.css')return route.fulfill({contentType:'text/css',body:fs.readFileSync('assets/review.css','utf8')});
    if(url.pathname==='/review.js')return route.fulfill({contentType:'text/javascript',body:fs.readFileSync('assets/review.js','utf8')});
    if(path==='authors'&&req.method()==='GET')return route.fulfill({json:[{id:'a'.repeat(64),name:'New reviewer'}]});
    if(path.startsWith('files/'))return route.fulfill({contentType:'image/png',body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=','base64')});
    if(url.pathname.startsWith('/api/')){
     if(req.method()!=='GET'){
      const body=path.endsWith('/files')?null:req.postDataJSON();writes.push({path,body});
      if(path==='identity')return route.fulfill({json:{author_id:'a'.repeat(64)}});
      if(path.endsWith('/replies'))issue={...issue,revision:issue.revision+1,activity:[...issue.activity,{id:'22222222-2222-4222-8222-222222222222',kind:'reply',created_at:new Date().toISOString(),payload:{...body,author_id:'a'.repeat(64)}}]};
      if(path.endsWith('/status'))issue={...issue,status:body.status};
      if(path==='issues')issue={...issue,...body};
     }
     return route.fulfill({json:path==='issues'&&req.method()==='GET'?{issues:[issue],total:1,page:1}:issue});
    }
    return route.fulfill({contentType:'text/html',body:`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><div id="target" style="margin:150px;width:180px;height:180px">Shared target</div><script>window.FeedbackPressConfig=${JSON.stringify({api:base+'/api/',home:base,css:base+'/review.css',loginUrl:base+'/wp-login.php',nonce:'fixture',userName:'',privateNotes:false,reviewSession,maxBytes:5242880})};window.html2canvas=async()=>{const c=document.createElement('canvas');c.width=100;c.height=100;return c};</script><script src="/review.js"></script>`});
   });
   const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto(base+entry);
   const prompt=page.getByRole('region',{name:'Introduce yourself',exact:true}),popup=page.getByRole('region',{name:'Issue details',exact:true});
   const identify=async()=>{await prompt.getByRole('textbox',{name:'Your name',exact:true}).fill('New reviewer');await prompt.getByRole('textbox',{name:'Email address',exact:true}).fill('reviewer@example.test');await prompt.getByRole('button',{name:'Continue',exact:true}).click();};
   const finish=async()=>{assert.deepEqual(errors,[]);await context.close();};
   return {context,page,writes,prompt,popup,identify,finish};
  }
  for(const [width,colorScheme] of [[1280,'light'],[390,'light'],[320,'dark']]){
   const f=await fixture('/#feedbackpress='+id,true,width,colorScheme),{page,popup,prompt,writes}=f;
   await popup.waitFor();assert.equal(await prompt.isVisible(),false);assert.equal(writes.length,0);
   await popup.getByRole('button',{name:'Preview Screenshot',exact:true}).click();await page.getByRole('dialog',{name:'Attachment preview',exact:true}).waitFor();assert.equal(await prompt.isVisible(),false);await page.getByRole('button',{name:'Dismiss attachment',exact:true}).click();assert.equal(writes.length,0);
   const reply=popup.getByRole('textbox',{name:'Reply',exact:true});await reply.fill('Keep this reply');
   await popup.getByLabel('Issue attachments',{exact:true}).setInputFiles({name:'example.pdf',mimeType:'application/pdf',buffer:Buffer.from('%PDF-1.4 fixture')});
   await popup.getByRole('button',{name:'Reply',exact:true}).click();await prompt.waitFor();assert.equal(writes.length,0);const login=prompt.getByRole('link',{name:'Log in to this site',exact:true});assert.equal(new URL(await login.getAttribute('href')).searchParams.get('redirect_to'),page.url());assert.ok(await login.evaluate(n=>n.getRootNode().activeElement===n));const bounds=await prompt.boundingBox();assert.ok(bounds.x>=0&&bounds.x+bounds.width<=width);assert.ok(await prompt.evaluate(n=>n.scrollWidth<=n.clientWidth));await prompt.screenshot({path:'/tmp/feedbackpress-identity-'+width+'-'+colorScheme+'.png'});
   await prompt.getByRole('button',{name:'Dismiss name prompt',exact:true}).click();
   assert.equal(await reply.inputValue(),'Keep this reply');assert.equal(await popup.locator('.reply-queued').textContent(),'example.pdf');
   await popup.getByRole('button',{name:'Reply',exact:true}).click();await f.identify();
   await page.waitForFunction(()=>document.querySelector('#feedbackpress-root').shadowRoot.querySelector('.work-item[data-state=done]'));
   const posted=writes.filter(w=>w.path.endsWith('/replies'));assert.equal(posted.length,1);assert.equal(posted[0].body.body,'Keep this reply');assert.equal(posted[0].body.author,'New reviewer');assert.equal(posted[0].body.author_email,'reviewer@example.test');assert.equal(writes.filter(w=>w.path.endsWith('/files')).length,1);
   await f.finish();
  }
  for(const entry of ['sidebar','pin','resume','hash']){
   const f=await fixture(entry==='resume'?'/?feedbackpress=open':'/');
   if(entry==='sidebar')await f.page.getByRole('button',{name:'View issues',exact:true}).click();
   if(entry==='pin')await f.page.getByRole('button',{name:/Issue 1, To do/}).click();
   if(entry==='hash')await f.page.evaluate(id=>location.hash='feedbackpress='+id,id);
   if(entry==='sidebar'||entry==='resume'){await f.page.getByRole('complementary',{name:'Issues',exact:true}).waitFor();await f.page.getByRole('button',{name:'Open issue 1',exact:true}).click();}
   await f.popup.waitFor();assert.equal(await f.prompt.isVisible(),false);assert.equal(f.writes.length,0);await f.finish();
  }
  for(const action of ['button','C','T','status','status-key','author','drag']){
   const f=await fixture('/#feedbackpress='+id);await f.popup.waitFor();
   if(action==='button')await f.page.getByRole('button',{name:'Leave feedback',exact:true}).click();
   else if(action==='status')await f.popup.getByRole('button',{name:'Set issue 1 to Doing',exact:true}).click();
   else if(action==='drag'){const b=await f.page.locator('[data-pin-issue="'+id+'"]').boundingBox();await f.page.mouse.move(b.x+b.width/2,b.y+b.height/2);await f.page.mouse.down();await f.page.mouse.move(b.x+b.width/2+20,b.y+b.height/2+20);await f.page.mouse.up();}
   else if(action==='author')await f.popup.getByRole('button',{name:'Change author: Client',exact:true}).click();
   else {await f.page.evaluate(()=>{document.body.tabIndex=-1;document.body.focus()});await f.page.keyboard.press(action==='status-key'?'3':action);}
   await f.prompt.waitFor();assert.equal(f.writes.length,0);
   if(action==='status'){await f.identify();await f.page.waitForFunction(()=>document.querySelector('#feedbackpress-root').shadowRoot.querySelector('.work-item[data-state=done]'));assert.equal(f.writes.filter(w=>w.path.endsWith('/status')).length,1);}
   if(action==='author'){await f.identify();await f.popup.getByRole('combobox',{name:'Issue author',exact:true}).waitFor();assert.equal(f.writes.filter(w=>w.path!=='identity').length,0);}
   if(action==='button'){
    await f.identify();await f.page.evaluate(()=>{document.body.tabIndex=-1;document.body.focus()});await f.page.keyboard.press('p');
    const draft=f.page.getByRole('region',{name:'New feedback',exact:true});await draft.waitFor();await draft.getByRole('textbox',{name:'Issue title',exact:true}).fill('New ticket after identification');await draft.getByRole('button',{name:'Submit feedback',exact:true}).click();
    await f.page.waitForFunction(()=>document.querySelector('#feedbackpress-root').shadowRoot.querySelector('.work-item[data-state=done]'));
    const created=f.writes.filter(w=>w.path==='issues');assert.equal(created.length,1);assert.equal(created[0].body.author,'New reviewer');assert.equal(created[0].body.author_email,'reviewer@example.test');
   }
   await f.finish();
  }
  for(const [width,colorScheme] of [[1280,'light'],[390,'light'],[320,'dark']]){
   const ordinary=await fixture('/',false,width,colorScheme);await ordinary.page.getByRole('button',{name:'View issues',exact:true}).click();await ordinary.prompt.waitFor();assert.equal(ordinary.writes.length,0);
   await ordinary.page.evaluate(()=>document.fonts.ready);await ordinary.page.waitForFunction(()=>{const r=document.querySelector('#feedbackpress-root').shadowRoot,box=r.querySelector('.identity').getBoundingClientRect(),buttons=r.querySelectorAll('.launcher button');return Math.abs(buttons[0].getBoundingClientRect().top-box.bottom-8)<1;});
   const spacing=await ordinary.prompt.evaluate(n=>{const r=n.getRootNode(),box=n.getBoundingClientRect(),buttons=[...r.querySelectorAll('.launcher button')].map(b=>b.getBoundingClientRect()),style=getComputedStyle(n);return {gap:buttons[0].top-box.bottom,buttonGap:buttons[1].top-buttons[0].bottom,header:n.querySelector('header').getBoundingClientRect().height,title:n.querySelector('h2').getBoundingClientRect().height,padding:[style.paddingTop,style.paddingRight,style.paddingBottom,style.paddingLeft]};});
   assert.ok(Math.abs(spacing.gap-spacing.buttonGap)<1,JSON.stringify(spacing));assert.equal(spacing.header,spacing.title);assert.deepEqual(spacing.padding,['16px','16px','16px','16px']);
   await ordinary.page.screenshot({path:'/tmp/feedbackpress-identity-spacing-'+width+'-'+colorScheme+'.png'});await ordinary.finish();
  }
  console.log('PASS magic-link anonymous desktop/mobile reading, direct/fragment/sidebar/pin/resumed entry, reply/file preservation and one attributed send, creation C/T/button, status/author identity guards, and unchanged non-link prompt. All requests intercepted.');
 }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
