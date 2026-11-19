// Current native settings markup, isolated HTTP; no account, links or email are changed.
const {chromium}=require('playwright'),fs=require('node:fs'),assert=require('node:assert/strict');
(async()=>{const browser=await chromium.launch({channel:'chrome',headless:true});try{
 const base='https://feedbackpress.test',id='11111111-1111-4111-8111-111111111111';
 for(const width of [1280,390,320]){
  const context=await browser.newContext({viewport:{width,height:1000}}),posts=[],errors=[];let enabled=false,deny=false;
  const state=()=>({account_connected:true,current_url:base,project:{id,name:'Review project',invitation_accounts:enabled,notification_email:null,review_site:null,sites:[{url:'https://review.example.com',notification_eligible:true}],notification_site:'https://review.example.com'}});
  await context.route(base+'/**',async route=>{const req=route.request(),url=new URL(req.url());if(url.pathname==='/admin.js')return route.fulfill({contentType:'text/javascript',body:fs.readFileSync('assets/admin.js','utf8')});
   if(url.pathname.startsWith('/adminapi/')){const action=url.pathname.split('/admin/')[1];if(action==='capabilities')return route.fulfill({json:{}});if(action==='plan')return route.fulfill({json:{}});if(action==='connection')return route.fulfill({json:state()});if(action==='projects')return route.fulfill({json:[{id,name:'Review project',site_count:1}]});
    posts.push({action,body:req.postDataJSON()});if(action==='shared-links'){assert.equal(req.postDataJSON().project,id);enabled=req.postDataJSON().create_accounts;return route.fulfill({json:state()});}if(action==='shared-links/revoke'){assert.deepEqual(req.postDataJSON(),{project:id});return route.fulfill(deny?{status:403,json:{message:'Administrator access required.'}}:{json:{revoked:true}});}throw Error('Unexpected action '+action);
   }
   return route.fulfill({contentType:'text/html',body:fs.readFileSync('/tmp/feedbackpress-copy-admin.html','utf8')});
  });
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto(base+'/settings');const checkbox=page.getByRole('checkbox',{name:'Create WordPress accounts for invited reviewers',exact:true});await checkbox.waitFor();assert.equal(await checkbox.isChecked(),false);
  await checkbox.check();await page.getByRole('button',{name:'Save invitation setting',exact:true}).click();await page.getByText('Invitation setting saved.',{exact:true}).waitFor();assert.equal(await checkbox.isChecked(),true);assert.deepEqual(posts[0],{action:'shared-links',body:{project:id,create_accounts:true}});
  const revoke=page.getByRole('button',{name:'Revoke all shared links',exact:true});await revoke.click();await page.getByText('All existing shared links revoked. Copy a new link or send a new invitation to share again.',{exact:true}).waitFor();assert.equal(posts[1].action,'shared-links/revoke');assert.equal(await checkbox.isChecked(),true);deny=true;await revoke.click();await page.getByText('Administrator access required.',{exact:true}).waitFor();assert.equal(await revoke.isEnabled(),true);assert.deepEqual(errors,[]);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.locator('#fp-shared-access').screenshot({path:'/tmp/fp-shared-settings-'+width+'.png'});await context.close();
 }
 console.log('PASS project-scoped opt-in account setting, one-click link revocation, preserved preference, denial/retry state and 1280/390/320px settings layouts; HTTP intercepted.');
}finally{await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1});
