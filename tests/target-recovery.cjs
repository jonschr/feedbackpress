// DOM differences between authenticated and guest copies; all HTTP is intercepted.
const {chromium}=require('playwright'),fs=require('node:fs'),assert=require('node:assert/strict');
(async()=>{const browser=await chromium.launch({channel:'chrome',headless:true});try{
 const context=await browser.newContext({viewport:{width:1280,height:800},reducedMotion:'reduce'}),base='https://feedbackpress.test';
 const issue={id:'11111111-1111-4111-8111-111111111111',number:6,title:'I like this thing',body:'',author:'Reviewer',status:'todo',path:'/',revision:1,activity:[],files:[],target:{selector:'div:nth-of-type(2) > footer > h2 > a',text:'Same site title',x:.64,y:.58}};
 await context.route(base+'/**',r=>{const u=new URL(r.request().url());if(u.pathname.endsWith('.css'))return r.fulfill({contentType:'text/css',body:fs.readFileSync('assets/review.css','utf8')});if(u.pathname.startsWith('/api/issues/'))return r.fulfill({json:issue});if(u.pathname==='/api/issues')return r.fulfill({json:{issues:[issue],total:1,page:1}});return r.fulfill({contentType:'text/html',body:`<!doctype html><meta charset="utf-8"><style>body{margin:0}header{height:100px}main{height:900px}footer{padding:40px;height:150px}h2{margin:0}footer a{display:inline-block;width:350px;height:50px}</style><div class="wp-site-blocks"><header><a href="#">Same site title</a></header><main>Content</main><footer><h2><a href="#">Same site title</a></h2></footer></div><script>window.FeedbackPressConfig={api:'${base}/api/',home:'${base}',css:'${base}/review.css',nonce:'fixture',userName:'Reviewer'}</script><script>${fs.readFileSync('assets/review.js','utf8')}</script>`})});
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(base);
 const pin=page.getByRole('button',{name:/Issue 6,/});await pin.waitFor({state:'attached'});
 const check=async approximate=>{await page.waitForFunction(expected=>document.querySelector('#feedbackpress-root').shadowRoot.querySelector('.pins .pin')?.dataset.approximate===expected,String(approximate));assert.equal(await pin.count(),1)};
 await check(false);await page.getByRole('button',{name:'View issues',exact:true}).click();await page.locator('.issue-open').click();
 await page.waitForFunction(()=>Math.abs(document.querySelector('footer a').getBoundingClientRect().top+50*.58-parseFloat(document.querySelector('#feedbackpress-root').shadowRoot.querySelector('.pins .pin').style.top))<1);
 assert.equal(await page.getByText(/original element has changed/).count(),0);
 // Adding the administrator toolbar makes the original full selector valid again.
 await page.evaluate(()=>{const bar=document.createElement('div');bar.id='wpadminbar';document.body.prepend(bar)});await check(false);
 await page.evaluate(()=>document.querySelector('footer h2').remove());await check(true);assert.equal(await pin.getAttribute('data-tooltip'),'Approximate location · drag to refine');
 await page.evaluate(()=>document.querySelector('footer').innerHTML='<h2><a href="#">Same site title</a></h2>');await check(false);
 await page.setViewportSize({width:390,height:844});await check(false);
 await page.evaluate(()=>document.querySelector('footer a').style.display='none');await page.waitForFunction(()=>!document.querySelector('#feedbackpress-root').shadowRoot.querySelector('.pins .pin'));
 assert.deepEqual(errors,[]);console.log('PASS Cross-copy target recovery ignores changed body siblings, disambiguates identical header/footer text, retains an approximate pin after removal, reanchors after restoration, and respects hidden targets/mobile.');
}finally{await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1});
