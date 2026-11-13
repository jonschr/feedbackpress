// Fully intercepted text/media/navigation fixtures; no real site or provider writes.
const {chromium}=require('playwright'),fs=require('node:fs'),assert=require('node:assert/strict');
(async()=>{const browser=await chromium.launch({channel:'chrome',headless:true});try{
 const base='https://feedbackpress.test',owner='a'.repeat(64),id='11111111-1111-4111-8111-111111111111';
 const body='See https://secure-ai-now.localhost:8453/test/?page_id=3&preview=true#one and (https://example.test/docs(a)).\n@Alex says www.example.test/help, not javascript:alert(1) or data:text/html,<img src=x onerror=alert(1)>.';
 const mention=body.indexOf('@Alex');
 const issue={id,number:1,title:'Testing a link',title_generated:false,body,mentions:[{id:'alex',start:mention,end:mention+5}],author:'Jon',owner_id:owner,author_id:owner,status:'todo',revision:1,edit_revision:1,path:'/',created_at:'2026-11-12T12:00:00Z',target:{selector:'#target',x:.5,y:.5},files:[],activity:[{id:'reply-one',kind:'reply',created_at:'2026-11-12T12:01:00Z',payload:{author:'Alex',body:'Reply: http://example.test/path?q=one&two=2. Invalid https:// and javascript:alert(1) stay text.'}}]};
 const note={id:'private-one',issue_id:id,body:'Private reference: https://example.test/private?x=1&y=2!',author_kind:'human',author_name:'Jon',created_at:'2026-11-12T12:02:00Z',revision:1};
 const context=await browser.newContext({viewport:{width:1280,height:900},reducedMotion:'reduce'}),errors=[];let writes=0;
 await context.route('**/*',route=>{
  const req=route.request(),u=new URL(req.url());
  if(u.origin!==base)return route.fulfill({contentType:'text/html',body:'<!doctype html><title>Linked fixture</title>Linked page'});
  if(u.pathname.endsWith('.woff2'))return route.fulfill({contentType:'font/woff2',body:fs.readFileSync('assets/fonts/InterVariable.woff2')});
  if(u.pathname.endsWith('.css'))return route.fulfill({contentType:'text/css',body:fs.readFileSync('assets/review.css','utf8')});
  if(u.pathname.startsWith('/api/')){
   if(req.method()!=='GET')writes++;
   const headers={'X-FeedbackPress-Actor-Id':owner};
   return route.fulfill({headers,json:u.pathname.endsWith('/notes')?{notes:[note]}:u.pathname==='/api/issues'?{issues:[issue],total:1,page:1}:issue});
  }
  return route.fulfill({contentType:'text/html',body:`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><div id="target" style="margin:180px">Target</div><script>window.FeedbackPressConfig={api:'${base}/api/',home:'${base}',css:'${base}/review.css',userName:'Jon',authorId:'${owner}',privateNotes:true,nonce:'fixture'}</script><script>${fs.readFileSync('assets/review.js','utf8')}</script>`});
 });
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto(base);await page.getByRole('button',{name:'View issues',exact:true}).click();await page.locator('.issue-open').click();
 const popup=page.getByRole('region',{name:'Issue details',exact:true}),original=popup.locator(`[data-comment="${id}"] .comment`),reply=popup.locator('[data-comment="reply-one"] .comment'),priv=popup.locator('[data-note="private-one"] .comment');
 await priv.waitFor();assert.equal(await original.textContent(),body);assert.equal(await reply.textContent(),issue.activity[0].payload.body);assert.equal(await priv.textContent(),note.body);
 assert.deepEqual(await original.locator('a').evaluateAll(nodes=>nodes.map(a=>[a.textContent,a.href])),[
  ['https://secure-ai-now.localhost:8453/test/?page_id=3&preview=true#one','https://secure-ai-now.localhost:8453/test/?page_id=3&preview=true#one'],
  ['https://example.test/docs(a)','https://example.test/docs(a)'],['www.example.test/help','https://www.example.test/help']]);
 assert.equal(await reply.locator('a').getAttribute('href'),'http://example.test/path?q=one&two=2');assert.equal(await priv.locator('a').getAttribute('href'),'https://example.test/private?x=1&y=2');
 assert.equal(await original.locator('.comment-mention').textContent(),'@Alex');assert.equal(await popup.locator('.comment img,.comment script').count(),0);
 assert.ok(await popup.locator('.comment a').evaluateAll(nodes=>nodes.every(a=>a.target==='_blank'&&a.relList.contains('noopener')&&a.relList.contains('noreferrer'))));
 const link=original.locator('a').first();assert.equal(await link.evaluate(a=>getComputedStyle(a).color),'rgb(98, 106, 118)');await link.hover();assert.equal(await link.evaluate(a=>getComputedStyle(a).textDecorationLine),'underline');await page.keyboard.press('Tab');await link.focus();assert.ok(await link.evaluate(a=>a.matches(':focus-visible')&&getComputedStyle(a).outlineStyle==='solid'));
 const next=context.waitForEvent('page');await link.click();const destination=await next;await destination.waitForLoadState('domcontentloaded');assert.equal(destination.url(),'https://secure-ai-now.localhost:8453/test/?page_id=3&preview=true#one');assert.equal(await destination.evaluate(()=>window.opener),null);await destination.close();assert.equal(page.url(),base+'/');assert.ok(await popup.isVisible());
 await popup.getByRole('button',{name:'Actions for issue',exact:true}).click();await page.getByRole('button',{name:'Edit',exact:true}).click();assert.equal(await popup.getByRole('textbox',{name:'Edit comment',exact:true}).inputValue(),body);await popup.getByRole('button',{name:'Cancel',exact:true}).click();await priv.waitFor();
 for(const width of [1280,390,320]){await page.setViewportSize({width,height:900});assert.ok(await popup.evaluate(n=>n.scrollWidth<=n.clientWidth));await page.screenshot({path:`/tmp/feedbackpress-comment-links-${width}.png`});}
 assert.equal(writes,0);assert.deepEqual(errors,[]);console.log('PASS Initial/reply/private links, query/fragment preservation, balanced parentheses and sentence punctuation, www URLs, mention ranges, inert HTML/unsafe schemes, native new-tab navigation with no opener, unchanged editor source, gray/underline/focus styles and 390/320px wrapping.');
}finally{await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1});
