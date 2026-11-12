// Intercepted transport abort after pagehide must leave shared uploads resumable.
const {chromium}=require('playwright'),fs=require('node:fs'),assert=require('node:assert/strict');
(async()=>{const browser=await chromium.launch({channel:'chrome',headless:true});try{
 const base='https://feedbackpress.test',context=await browser.newContext({viewport:{width:1280,height:900}}),keys=[];let abortUpload,uploadStarted,replies=0,uploads=0;const started=new Promise(resolve=>uploadStarted=resolve);
 const issue={id:'11111111-1111-4111-8111-111111111111',number:1,title:'Interrupted upload',body:'Shared issue',author:'Owner',status:'todo',revision:1,path:'/',target:{selector:'body',x:.5,y:.5},files:[],activity:[]};
 await context.route(base+'/**',async route=>{const request=route.request(),path=new URL(request.url()).pathname;
  if(path.endsWith('.css'))return route.fulfill({contentType:'text/css',body:fs.readFileSync('assets/review.css','utf8')});
  if(path.endsWith('/replies')){replies++;issue.revision++;issue.activity=[{id:'reply-1',kind:'reply',created_at:new Date().toISOString(),payload:{author:'Owner',body:request.postDataJSON().body}}];return route.fulfill({json:{...issue,reply_id:'reply-1'}})}
  if(path.endsWith('/files')){keys.push(request.headers()['idempotency-key']);if(keys.length===1)return new Promise(resolve=>{abortUpload=async()=>{await route.abort('aborted');resolve()};uploadStarted()});uploads++;return route.fulfill({json:{id:'file-1'}})}
  if(path==='/api/issues')return route.fulfill({json:{issues:[issue],total:1,page:1}});
  if(path.startsWith('/api/'))return route.fulfill({json:issue});
  return route.fulfill({contentType:'text/html',body:`<!doctype html><body><script>window.FeedbackPressConfig={api:'${base}/api/',home:'${base}',css:'${base}/review.css',nonce:'fixture',userName:'Owner',network:'upload-navigation',maxBytes:5242880}</script><script>${fs.readFileSync('assets/review.js','utf8')}</script>`});
 });
 const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));await page.goto(base);await page.getByRole('button',{name:'View issues',exact:true}).click();await page.locator('.issue-open').click();const popup=page.getByRole('region',{name:'Issue details',exact:true});await popup.getByRole('textbox',{name:'Reply',exact:true}).fill('One reply across navigation');await popup.getByLabel('Issue attachments',{exact:true}).setInputFiles({name:'proof.pdf',mimeType:'application/pdf',buffer:Buffer.from('%PDF-1.4\nfixture\n%%EOF')});await popup.getByRole('button',{name:'Reply',exact:true}).click();
 await started;assert.ok(abortUpload);await page.evaluate(()=>dispatchEvent(new PageTransitionEvent('pagehide')));await abortUpload();await page.waitForTimeout(100);
 const pending=await page.evaluate(()=>JSON.parse(Object.keys(sessionStorage).map(key=>key.endsWith(':work')?sessionStorage.getItem(key):null).find(Boolean)));assert.equal(pending.length,1);assert.equal(pending[0].error,undefined,'Navigation abort was persisted as a permanent upload failure');
 await page.goto(base+'/next/');await page.getByRole('status').filter({hasText:'Saved'}).waitFor();assert.equal(replies,1);assert.equal(uploads,1);assert.equal(keys.length,2);assert.equal(keys[0],keys[1]);assert.deepEqual(errors,[]);
 console.log('PASS Navigation-aborted shared upload resumes from browser storage with its original key, one reply/file, and no persisted transport error.');
}finally{await browser.close()}})().catch(error=>{console.error(error);process.exitCode=1});
