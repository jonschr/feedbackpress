// All requests intercepted. Busy conversion keeps one saved reply and retries the same raw file/key.
const {chromium}=require('playwright'),fs=require('node:fs'),assert=require('node:assert/strict');
(async()=>{const browser=await chromium.launch({channel:'chrome',headless:true});try{
 const base='https://attachment-retry.feedbackpress.test',context=await browser.newContext({viewport:{width:1280,height:900}}),errors=[],uploads=[],replies=[];
 const issue={id:'11111111-1111-4111-8111-111111111111',number:1,title:'Conversion retry',body:'Original issue',author:'Reviewer',status:'todo',revision:1,path:'/',target:{selector:'#target',x:.5,y:.5},files:[],activity:[]};
 await context.route(base+'/**',route=>{const request=route.request(),path=new URL(request.url()).pathname;
  if(path.endsWith('.css'))return route.fulfill({contentType:'text/css',body:fs.readFileSync('assets/review.css','utf8')});
  if(path.endsWith('.woff2'))return route.fulfill({contentType:'font/woff2',body:fs.readFileSync('assets/fonts/InterVariable.woff2')});
  if(path==='/api/issues')return route.fulfill({json:{issues:[issue],total:1,page:1}});
  if(path.endsWith('/replies')){replies.push(request.postDataJSON());issue.revision++;return route.fulfill({json:{...issue,reply_id:'reply-'+replies.length}})}
  if(path.endsWith('/files')){uploads.push({key:request.headers()['idempotency-key'],bytes:request.postDataBuffer()});if(uploads.length===1)return route.fulfill({status:429,headers:{'Retry-After':'5'},json:{code:'media_processing_busy',message:'Another attachment is being processed. Your text is saved. Retry in a few seconds.',data:{status:429,retry_after:5}}});if(uploads.length===3)return route.fulfill({status:415,json:{code:'invalid_document',message:'This document could not be read. Use a supported, unencrypted file without macros.',data:{status:415}}});return route.fulfill({json:{id:'uploaded'}})}
  if(path==='/api/mentions')return route.fulfill({json:{people:[],delivery:'capture'}});
  if(path.startsWith('/api/'))return route.fulfill({json:issue});
  return route.fulfill({contentType:'text/html',body:`<!doctype html><meta charset="utf-8"><div id="target" style="margin:180px">Target</div><script>window.FeedbackPressConfig={home:'${base}',api:'${base}/api/',css:'${base}/review.css',nonce:'test',userName:'Reviewer',maxBytes:15728640}</script><script>${fs.readFileSync('assets/review.js','utf8')}</script>`});
 });
 const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));await page.clock.install();await page.goto(base);await page.getByRole('button',{name:'View issues',exact:true}).click();await page.locator('.issue-open').click();const popup=page.getByRole('region',{name:'Issue details'});
 const attach=async(name,buffer)=>{await popup.getByLabel('Issue attachments').setInputFiles({name,mimeType:'application/zip',buffer});await popup.getByRole('button',{name:'Reply',exact:true}).click()};
 const bytes=Buffer.from('unchanged-original-attachment');await attach('workbook.xlsx',bytes);const failure=page.locator('.work-item[data-state=error]');await failure.filter({hasText:'Retry in a few seconds.'}).waitFor();assert.equal(replies.length,1);assert.equal(uploads.length,1);
 await failure.getByRole('button',{name:'Retry',exact:true}).click();await page.clock.runFor(1000);assert.equal(uploads.length,1,'Busy retry ignored the five-second cooldown');await page.clock.fastForward(5000);await page.getByRole('status').filter({hasText:'Saved'}).waitFor();assert.equal(replies.length,1);assert.equal(uploads.length,2);assert.equal(uploads[0].key,uploads[1].key);assert.ok(uploads[1].bytes.includes(bytes));
 await attach('broken.docx',Buffer.from('invalid-document-fixture'));await failure.filter({hasText:'supported, unencrypted file without macros.'}).waitFor();await page.clock.fastForward(10000);assert.equal(uploads.length,3,'Invalid document retried without a user action');assert.equal(replies.length,2);assert.equal(await failure.getByRole('button',{name:'Retry',exact:true}).count(),1);
 assert.deepEqual(errors,[]);console.log('PASS Busy attachment conversion shows saved-text explanation, honors five-second retry cooldown, preserves raw bytes/key and one reply, and leaves invalid documents available for explicit retry.');
}finally{await browser.close()}})().catch(error=>{console.error(error);process.exitCode=1});
