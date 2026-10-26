const { chromium } = require('playwright');
(async()=>{require('fs').mkdirSync(__dirname+'/shots',{recursive:true});const b=await chromium.launch({proxy:process.env.HTTPS_PROXY?{server:process.env.HTTPS_PROXY}:undefined});
for(const [name,path,theme] of [['en-light','/','light'],['en-dark','/','dark'],['hi-dark','/hi','dark'],['bn-light','/bn','light'],['hi-light','/hi','light'],['bn-dark','/bn','dark']]){
 const c=await b.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true,colorScheme:theme,ignoreHTTPSErrors:true});
 await c.addInitScript(t=>{try{localStorage.setItem('rw-theme',JSON.stringify(t));localStorage.setItem('rw-lang-asked','1');localStorage.setItem('rw-install-dismissed',JSON.stringify(Date.now()))}catch{}},theme);
 const p=await c.newPage();await p.goto('https://raisinawire.calibrex.org'+path,{waitUntil:'networkidle',timeout:60000}).catch(e=>console.log('nav',e.message));await p.waitForTimeout(4000);
 await p.evaluate(t=>{document.documentElement.dataset.theme=t;document.querySelectorAll('.sheet,.update-bar,.install-sheet,#installSheet,.lang-suggest,.alert-banner,#newPill,.toast').forEach(e=>e.remove())},theme);await p.waitForTimeout(600);
 await p.screenshot({path:__dirname+'/shots/'+name+'.png'});console.log(name, await p.evaluate(()=>document.documentElement.dataset.theme));await c.close()}
await b.close()})();
