// Run after tests/render-admin.php creates the current connected-account markup.
const {chromium}=require('playwright'),fs=require('node:fs'),assert=require('node:assert/strict');
(async()=>{const browser=await chromium.launch({channel:'chrome',headless:true});try{
 const context=await browser.newContext({viewport:{width:1280,height:900}}),base='https://feedbackpress.test';
 const projects=[{id:'alpha',name:'Alpha project',site_count:2},{id:'beta',name:'Beta project',site_count:1}];
 let selected='alpha',sites={alpha:[{url:base},{url:'https://other.example.test'}],beta:[{url:'https://beta.example.test'}]},fail=false,posts=[];
 const connection=()=>({account_connected:true,current_url:base,project:{...projects.find(p=>p.id===selected),sites:sites[selected]}});
 await context.route(base+'/**',async route=>{const request=route.request(),url=new URL(request.url()),path=url.searchParams.get('rest_route')||url.pathname;
  if(path.endsWith('/admin.js'))return route.fulfill({contentType:'text/javascript',body:fs.readFileSync('assets/admin.js','utf8')});
  if(path.includes('/admin/')){const action=path.split('/admin/')[1];if(action==='projects')return route.fulfill({json:projects});if(action==='connection')return route.fulfill({json:connection()});const body=request.postDataJSON();posts.push({action,body});
   if(action==='project'){if(fail){fail=false;return route.fulfill({status:503,json:{message:'Temporary fixture outage. Try again.'}})}sites[selected]=sites[selected].filter(s=>s.url!==base);selected=body.project;sites[selected].push({url:base});}
   else if(action==='site/remove')sites[selected]=sites[selected].filter(s=>s.url!==body.url);
   return route.fulfill({json:connection()});
  }
  return route.fulfill({contentType:'text/html',body:fs.readFileSync('/tmp/feedbackpress-copy-admin.html','utf8').replace('https://feedbackpress.test/adminapi/',base+'/?rest_route=/feedbackpress/v1/')});
 });
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(base);
 const picker=page.getByRole('combobox',{name:'Project',exact:true});await page.getByRole('button',{name:'Remove https://other.example.test',exact:true}).waitFor();
 assert.equal(await picker.inputValue(),'Alpha project');assert.equal(await page.getByRole('button',{name:'Copy connection code'}).count(),0);assert.equal(await page.locator('#fp-account-key').getAttribute('data-1p-ignore'),'');
 await picker.fill('bEtA');assert.equal(await page.locator('#fp-project-options [role=option]').count(),1);await picker.press('Enter');await page.getByText('Connected to Beta project.',{exact:true}).waitFor();assert.equal(await picker.inputValue(),'Beta project');assert.equal(await page.getByRole('button',{name:'Remove https://beta.example.test',exact:true}).count(),1);assert.equal(sites.alpha.length,1);
 await picker.fill('no match');await page.getByText('No projects match this search.',{exact:true}).waitFor();await picker.press('Escape');assert.equal(await picker.inputValue(),'Beta project');
 fail=true;await picker.fill('Alpha');await picker.press('ArrowDown');await picker.press('Enter');await page.getByText('Temporary fixture outage. Try again.',{exact:true}).waitFor();assert.equal(await picker.inputValue(),'Beta project');
 await page.getByRole('button',{name:'Remove https://beta.example.test',exact:true}).click();await page.getByText('Site removed from this project. An administrator can reconnect it through project selection.',{exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:'Remove https://beta.example.test',exact:true}).count(),0);
 await page.setViewportSize({width:390,height:844});await picker.click();await page.getByRole('option',{name:'Alpha project 2 sites',exact:true}).click();await page.getByText('Connected to Alpha project.',{exact:true}).waitFor();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);assert.deepEqual(errors,[]);assert.equal(posts.filter(p=>p.action==='project').length,3);
 console.log('PASS Searchable account projects: keyboard/click selection, current selection, site-list refresh/removal, failed-switch recovery, plain REST URLs, 1Password opt-out and mobile overflow.');
}finally{await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1});
