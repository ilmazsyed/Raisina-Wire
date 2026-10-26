const { chromium } = require('playwright');
(async()=>{const b=await chromium.launch({proxy:process.env.HTTPS_PROXY?{server:process.env.HTTPS_PROXY}:undefined});const p=await b.newPage({viewport:{width:1200,height:630},deviceScaleFactor:1});
for(const l of ['en','hi','bn']){await p.goto('file://'+__dirname+'/og-'+l+'.html');await p.evaluate(()=>document.fonts.ready);await p.waitForTimeout(1500);await p.screenshot({path:__dirname+'/out-'+l+'.png'});}
await b.close();
const { execFileSync } = require('child_process'); // JPEG for the site (smaller than PNG)
for (const [l, name] of [['en','og-image.jpg'],['hi','og-image-hi.jpg'],['bn','og-image-bn.jpg']]) execFileSync('python3', ['-c', `from PIL import Image; Image.open('${__dirname}/out-${l}.png').convert('RGB').save('${__dirname}/../../public/${name}', quality=86, optimize=True, progressive=True)`]);
})();
