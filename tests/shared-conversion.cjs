const {chromium}=require('playwright'),fs=require('node:fs'),assert=require('node:assert/strict');
(async()=>{const browser=await chromium.launch({channel:'chrome',headless:true});try{
 const context=await browser.newContext({viewport:{width:1280,height:900}}),base='https://feedbackpress.test';let published=false;
 const issue={id:'11111111-1111-4111-8111-111111111111',number:1,title:'Conversion',body:'Shared issue',author:'Owner',status:'todo',path:'/',revision:1,target:{selector:'#target',x:.5,y:.5},activity:[],files:[]};
 const note={id:'22222222-2222-4222-8222-222222222222',body:'Owner-only before conversion',author_kind:'agent',author_name:'Owner',agent:'Codex',revision:1,created_at:'2026-11-11T12:00:00Z'};
 await context.route(base+'/**',route=>{const req=route.request(),path=new URL(req.url()).pathname;
  if(path.endsWith('.css'))return route.fulfill({contentType:'text/css',body:fs.readFileSync('assets/review.css','utf8')});
  if(path.endsWith('/convert')){assert.equal(req.postDataJSON().publish,true);published=true;issue.revision++;issue.activity.push({id:note.id,kind:'reply',created_at:note.created_at,payload:{body:note.body,author:'Owner'}});return route.fulfill({json:{...note,author_kind:'human',visibility:'shared',issue}})}
  if(path.endsWith('/notes'))return route.fulfill({json:{notes:published?[]:[note]}});
  if(path==='/api/issues')return route.fulfill({json:{issues:[issue],total:1,page:1}});
  if(path.startsWith('/api/'))return route.fulfill({json:issue});
  return route.fulfill({contentType:'text/html',body:`<!doctype html><meta charset="utf-8"><div id="target" style="margin:150px;padding:50px">Target</div><script>window.FeedbackPressConfig={api:'${base}/api/',home:'${base}',css:'${base}/review.css',nonce:'test',userName:'Owner',privateNotes:true}</script><script>${fs.readFileSync('assets/review.js','utf8')}</script>`})
 });
 const page=await context.newPage();await page.goto(base);await page.getByRole('button',{name:'View issues',exact:true}).click();await page.locator('.issue-open').click();await page.getByText('Private · Only you',{exact:true}).waitFor();
 assert.ok(!(await page.evaluate(()=>JSON.stringify([...Array(sessionStorage.length)].map((_,i)=>sessionStorage.getItem(sessionStorage.key(i)))))).includes(note.body));
 await page.locator('.private-note .note-actions-trigger').click();await page.locator('.note-actions:popover-open').getByRole('button',{name:'Make public',exact:true}).click();await page.locator('.note-confirm').getByRole('button',{name:'Make public',exact:true}).click();await page.getByRole('status').filter({hasText:'Now public to project reviewers.'}).waitFor();assert.equal(await page.locator('.private-note').count(),0);assert.equal(await page.getByText(note.body,{exact:true}).count(),1);assert.equal(await page.getByRole('button',{name:'Make public',exact:true}).count(),0);
 await page.reload();if(await page.getByRole('button',{name:'View issues',exact:true}).isVisible())await page.getByRole('button',{name:'View issues',exact:true}).click();await page.locator('.issue-open').click();await page.getByText(note.body,{exact:true}).waitFor();assert.equal(await page.locator('.private-note').count(),0);
 console.log('PASS Explicit shared conversion replaces private treatment with a shared human comment, preserves body/time, and never caches pre-conversion private notes.');
}finally{await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1});
