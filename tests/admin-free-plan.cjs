// Intercepted dashboard onboarding/upgrade. No accounts, purchases, mail or saved WP options.
const {chromium}=require('playwright'),fs=require('node:fs'),assert=require('node:assert/strict');
(async()=>{const browser=await chromium.launch({channel:'chrome',headless:true});try{
 const base='https://feedbackpress.test',context=await browser.newContext({viewport:{width:1280,height:900}});let connected=false,project=null,paid=false;const calls=[],key='fp_fixture_key_only';
 await context.grantPermissions(['clipboard-read','clipboard-write'],{origin:base});
 await context.route(base+'/**',route=>{const req=route.request(),url=new URL(req.url()),path=url.pathname;
  if(path==='/admin.js')return route.fulfill({contentType:'application/javascript',body:fs.readFileSync('assets/admin.js','utf8')});
  if(path.includes('/admin/')){const action=path.split('/admin/')[1];calls.push({action,method:req.method()});
   if(action==='capabilities')return route.fulfill({json:{free_signup:true,upgrade:true}});
   if(action==='free'){connected=true;return route.fulfill({json:{connected:true,key}});}
   if(action==='connection')return route.fulfill({json:{account_connected:true,current_url:base,project}});
   if(action==='projects')return route.fulfill({json:project?[{id:project.id,name:project.name,site_count:1}]:[]});
   if(action==='plan')return route.fulfill({json:{plan_kind:paid?'paid':'free',project_limit:paid?null:1,storage_limit:100000000,allocated_bytes:0}});
   if(action==='project/new'){if(project&&!paid)return route.fulfill({status:403,json:{message:'Your free account includes one project. Upgrade to unlimited projects for $30/month; your account key stays the same.'}});const data=req.postDataJSON();project={id:data.id,name:data.name,sites:[{url:base}]};return route.fulfill({json:{account_connected:true,current_url:base,project}});}
   if(action==='checkout')return route.fulfill({json:{url:'https://store.lemonsqueezy.com/checkout/custom/test-only',test_mode:true}});
   return route.fulfill({json:{}});
  }
  return route.fulfill({contentType:'text/html',body:fs.readFileSync(connected?'/tmp/feedbackpress-free-admin.html':'/tmp/feedbackpress-disconnected-admin.html','utf8')});
 });
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(base);await page.getByRole('button',{name:'Start free',exact:true}).click();await page.getByRole('button',{name:'Copy key',exact:true}).click();await page.getByText('Account access key copied. Keep it private.',{exact:true}).waitFor();assert.equal(await page.evaluate(()=>navigator.clipboard.readText()),key);await page.getByRole('button',{name:"I've saved my key",exact:true}).click();await page.getByRole('button',{name:'Create a project',exact:true}).waitFor();await page.getByText('Free · 1 project · 100 MB attachments',{exact:true}).waitFor();
 assert.ok(!await page.evaluate(()=>document.documentElement.innerHTML.includes('fp_fixture_key_only')));
 await page.getByRole('button',{name:'Create a project',exact:true}).click();await page.getByLabel('Project name',{exact:true}).fill('My free project');await page.getByRole('button',{name:'Create and connect',exact:true}).click();await page.getByText('Created and connected to My free project.',{exact:true}).waitFor();
 await page.getByRole('button',{name:'Create a project',exact:true}).click();await page.getByLabel('Project name',{exact:true}).fill('A second project');await page.getByRole('button',{name:'Create and connect',exact:true}).click();await page.getByText(/Your free account includes one project/).waitFor();assert.equal(await page.getByLabel('Project name',{exact:true}).inputValue(),'A second project');
 await page.getByRole('button',{name:'Upgrade — $30/month',exact:true}).click();assert.equal(await page.getByRole('link',{name:'Open test checkout',exact:true}).getAttribute('href'),'https://store.lemonsqueezy.com/checkout/custom/test-only');
 paid=true;await page.getByRole('button',{name:'Refresh plan',exact:true}).click();await page.getByText('Unlimited projects',{exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:'Upgrade — $30/month',exact:true}).isVisible(),false);
 await page.getByRole('button',{name:'Create and connect',exact:true}).click();await page.getByText('Created and connected to A second project.',{exact:true}).waitFor();
 assert.equal(calls.filter(x=>x.action==='free').length,1);assert.equal(calls.filter(x=>x.action==='account').length,0);
 for(const width of [390,320]){await page.setViewportSize({width,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));}
 assert.deepEqual(errors,[]);console.log('PASS Start free, 100 MB display, one-time key privacy, first/second project limit, sandbox upgrade, retained draft and unchanged account key.');
 }finally{await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1});
