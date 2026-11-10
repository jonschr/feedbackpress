// Headless fixtures only: host-theme isolation, actual bundled font, docking, responsive flows, and visual states.
const {chromium,webkit}=require('playwright'),fs=require('node:fs'),assert=require('node:assert/strict');
(async()=>{
 const engine=process.env.FEEDBACKPRESS_BROWSER==='webkit'?webkit:chromium;
 const capture=name=>'/tmp/feedbackpress-design'+(process.env.FEEDBACKPRESS_FONT_MISSING?'-fallback':process.env.FEEDBACKPRESS_TOUCH?'-touch':engine===webkit?'-webkit':'')+'-'+name+'.png';
 const browser=await engine.launch(engine===chromium?{channel:'chrome',headless:true}:{headless:true,...(process.env.FEEDBACKPRESS_WEBKIT_PATH?{executablePath:process.env.FEEDBACKPRESS_WEBKIT_PATH}:{})});
 try{
  const context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce',hasTouch:process.env.FEEDBACKPRESS_TOUCH==='1'}),base='https://feedbackpress.test',errors=[];
  const items=['todo','review','doing','done','review'].map((status,n)=>({id:`${n+1}1111111-1111-4111-8111-111111111111`,number:String(n+1),title:['Update the product photography','Confirm the revised homepage introduction','Adjust the spacing above the product range','Replace the old contact email','Make the specification sheet easier to find'][n],body:'Use the latest approved images and keep the current proportions. The layout should remain consistent across desktop and mobile.',author:n%2?'Melissa Perez':'Jon Schroeder',author_id:'a'.repeat(64),path:'/',status,revision:'one',author_revision:'one',edit_revision:'one',created_at:'2026-11-10T12:00:00Z',updated_at:'2026-11-10T12:00:00Z',target:{selector:'#product',text:'Product range',x:.5,y:.25},files:[],activity:[]}));
  items[0].files=[['reference','reference.png',false,'image/png'],['brief','brand-guide.pdf',false,'application/pdf'],['screen','Screenshot',true,'image/png']].map(([id,name,screenshot,mime])=>({id,name,screenshot,mime,available:true,expired:false,comment_id:items[0].id}));
  items[0].activity=[{id:'reply-one',kind:'reply',created_at:'2026-11-10T13:00:00Z',payload:{author:'Melissa Perez',author_id:'b'.repeat(64),body:'The final images are approved. Please use the tighter crop for the product cards.'}}];
  let image=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==','base64'),writes=0,failIssues=false;
  await context.route(base+'/**',async r=>{
   const u=new URL(r.request().url());
   if(u.pathname.endsWith('.woff2')&&process.env.FEEDBACKPRESS_FONT_MISSING)return r.fulfill({status:404,body:''});
   if(u.pathname.endsWith('.woff2'))return r.fulfill({contentType:'font/woff2',body:fs.readFileSync('assets/fonts/InterVariable.woff2')});
   if(u.pathname.endsWith('.css'))return r.fulfill({contentType:'text/css',body:fs.readFileSync('assets/review.css','utf8')});
   if(u.pathname.startsWith('/api/')){
    if(r.request().method()==='POST')writes++;
    if(u.pathname.startsWith('/api/files/'))return r.fulfill({contentType:'image/png',body:image});
    if(u.pathname==='/api/authors')return r.fulfill({json:[{id:'a'.repeat(64),name:'Jon Schroeder'},{id:'b'.repeat(64),name:'Melissa Perez'}]});
    if(u.pathname==='/api/issues'){
     if(failIssues)return r.fulfill({status:503,json:{message:'Connection temporarily unavailable.'}});
     let found=items.filter(i=>(u.searchParams.get('status')||'todo,review').split(',').includes(i.status));
     if(u.searchParams.get('search'))found=found.filter(i=>(i.title+' '+i.body).toLowerCase().includes(u.searchParams.get('search').toLowerCase()));
     return r.fulfill({json:{issues:found,total:found.length,page:1}});
    }
    return r.fulfill({json:items.find(i=>u.pathname.endsWith(i.id))||{}});
   }
   return r.fulfill({contentType:'text/html',body:`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;background:#f2f1ee;color:#202936;font:16px/1.7 Georgia,serif}button,input,textarea,select{font:italic 24px Georgia;color:lime;background:green;border:8px solid red;padding:30px}header{padding:24px 5%;background:#fff;border-bottom:1px solid #ddd}.hero{padding:70px 6%;background:#26333d;color:#fff}h1{font:48px/1.1 Georgia;max-width:650px}#product{margin:55px 6%;padding:30px;max-width:560px;background:#fff;min-height:360px}p{max-width:550px}.spacer{height:1100px}</style><header>HARRISON &nbsp; / &nbsp; Products &nbsp; / &nbsp; Contact</header><section class="hero"><h1>Precision built for the work ahead.</h1><p>Explore our product range and technical resources.</p></section><section id="product"><h2>Our product range</h2><p>Review the latest product details, photography, and supporting documents.</p></section><div class="spacer"></div><script>window.html2canvas=async()=>{const c=document.createElement('canvas');c.width=50;c.height=50;return c};window.FeedbackPressConfig={api:'${base}/api/',home:'${base}',css:'${base}/review.css',nonce:'fixture',userName:'Jon Schroeder',authorId:'${'a'.repeat(64)}',maxBytes:5242880}</script><script>${fs.readFileSync('assets/review.js','utf8')}</script>`});
  });
  const p=await context.newPage();p.on('pageerror',e=>errors.push(e.message));await p.goto(base);await p.getByRole('button',{name:'View issues',exact:true}).waitFor();
  await p.waitForFunction(state=>[...document.fonts].some(f=>f.family.includes('FeedbackPress Inter')&&f.status===state),process.env.FEEDBACKPRESS_FONT_MISSING?'error':'loaded',{timeout:5000}).catch(async error=>{console.log('Font diagnostics',await p.evaluate(()=>[...document.fonts].map(f=>({family:f.family,status:f.status}))),errors);throw error;});
  image=await p.screenshot();await p.getByRole('button',{name:'View issues',exact:true}).click();
  const panel=p.getByRole('complementary',{name:'Issues',exact:true}),popup=p.getByRole('region',{name:'Issue details'}),search=panel.getByRole('searchbox'),filter=panel.getByRole('button',{name:'Filter statuses'});
  await p.waitForFunction(()=>document.querySelector('#feedbackpress-root').shadowRoot.querySelectorAll('.issue-row').length===3);
  const dock=await panel.boundingBox();assert.deepEqual(dock,{x:1040,y:0,width:400,height:1000});assert.equal(await panel.evaluate(e=>getComputedStyle(e).borderRadius),'0px');
  assert.equal(await p.locator('#feedbackpress-root').locator('.launcher').isVisible(),false);assert.equal(await p.getByRole('button',{name:'Refresh issues',exact:true}).count(),0);
  const controls=await panel.evaluate(e=>[...e.querySelectorAll('.issue-search,.filters>select,.status-filter-trigger')].map(n=>({h:n.getBoundingClientRect().height,r:getComputedStyle(n).borderRadius,font:getComputedStyle(n).fontFamily})));
  assert.equal(new Set(controls.map(c=>c.h)).size,1);assert.equal(new Set(controls.map(c=>c.r)).size,1);assert.ok(controls.every(c=>c.font.includes('FeedbackPress Inter')));
  assert.equal(await panel.locator('.issue-row').first().locator('.issue-body').evaluate(e=>getComputedStyle(e).fontSize),'14px');
  await panel.locator('.issue-open').first().click();await popup.waitFor();const bounds=await popup.boundingBox();assert.ok(bounds.x+bounds.width<=dock.x-12);assert.ok(bounds.y+bounds.height<=1000-12,JSON.stringify(bounds));
  assert.equal(await popup.locator('.comment-author').first().textContent(),'Jon Schroeder');assert.equal(await popup.locator('.comment-author').last().textContent(),'Melissa Perez');
  const reply=popup.getByRole('textbox',{name:'Reply',exact:true});await reply.fill('Keep this reply while switching views.');
  await p.screenshot({path:capture('desktop')});
  await popup.getByRole('button',{name:'Preview reference.png',exact:true}).click();const lightbox=p.getByRole('dialog',{name:'Attachment preview'});await lightbox.locator('img').waitFor();assert.equal(await lightbox.getByRole('button',{name:'Download',exact:true}).count(),1);await p.keyboard.press('Escape');assert.equal(await reply.inputValue(),'Keep this reply while switching views.');
  await filter.click();await panel.getByRole('checkbox',{name:'Doing',exact:true}).check();await panel.getByRole('checkbox',{name:'Done',exact:true}).check();await p.keyboard.press('Escape');
  await panel.locator('[data-status=done].issue-row').waitFor();await p.screenshot({path:capture('statuses')});
  const done=panel.locator('[data-status=done].issue-row');assert.equal(await done.locator('.issue-body').evaluate(e=>getComputedStyle(e).color),'rgb(98, 106, 118)');
  const review=panel.locator('[data-status=review].issue-row').first();await review.hover();assert.equal(await review.evaluate(e=>getComputedStyle(e).backgroundColor),'rgb(250, 247, 253)');
  await search.fill('nothing matches this');await panel.getByText('No issues match this search and status filter.',{exact:true}).waitFor();await search.fill('');await panel.locator('.issue-row').first().waitFor();
  await panel.getByRole('button',{name:'Dismiss issues'}).click();assert.equal(await p.locator('#feedbackpress-root').locator('.launcher').isVisible(),true);
  await p.getByRole('button',{name:'Leave feedback',exact:true}).click();await p.locator('#product').click();const composer=p.getByRole('region',{name:'New feedback'});await composer.waitFor();await composer.getByRole('textbox',{name:'Issue title'}).fill('Adjust the product card crop');await composer.getByRole('textbox',{name:'What needs to change?'}).fill('Keep the product centered and use the approved image.');await p.screenshot({path:capture('composer')});await p.keyboard.press('Escape');
  await p.setViewportSize({width:390,height:844});await p.getByRole('button',{name:'View issues',exact:true}).click();await panel.waitFor();assert.deepEqual(await panel.boundingBox(),{x:0,y:0,width:390,height:844});await p.screenshot({path:capture('mobile')});
  await panel.locator('.issue-open').first().click();await popup.waitFor();assert.equal(await panel.isVisible(),false);assert.equal(await p.locator('#feedbackpress-root').locator('.launcher').isVisible(),false);assert.equal(await reply.inputValue(),'Keep this reply while switching views.');await p.screenshot({path:capture('mobile-thread')});
  await popup.getByRole('button',{name:'Change author: Jon Schroeder'}).click();await popup.getByLabel('Issue author',{exact:true}).waitFor();await p.setViewportSize({width:320,height:640});await p.screenshot({path:capture('narrow-author')});
  assert.ok(await popup.evaluate(e=>e.scrollWidth<=e.clientWidth));await popup.getByRole('button',{name:'Cancel author change'}).click();await popup.getByRole('button',{name:'Dismiss issue',exact:true}).click();await panel.waitFor();assert.equal(await p.locator('#feedbackpress-root').locator('.launcher').isVisible(),false);
  await panel.getByRole('button',{name:'Leave feedback',exact:true}).click();assert.equal(await panel.isVisible(),false);assert.equal(await p.locator('#feedbackpress-root').locator('.launcher').isVisible(),true);await p.keyboard.press('Escape');
  failIssues=true;await p.reload();await p.getByRole('button',{name:'View issues',exact:true}).click();await panel.getByRole('button',{name:'Try again',exact:true}).waitFor();failIssues=false;await panel.getByRole('button',{name:'Try again',exact:true}).click();await panel.locator('.issue-row').first().waitFor();
  assert.equal(writes,0);assert.deepEqual(errors,[]);console.log('PASS Docked 400px/full-height panel, hidden launchers and mobile return, bundled Inter, theme isolation, consistent inputs, semantic states, thread/media/drafts, compact creation, and 320px author controls.');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
