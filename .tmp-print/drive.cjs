const http=require('http'),fs=require('fs'),path=require('path'),{spawn}=require('child_process');
const root=path.resolve('dist');
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png'};
const server=http.createServer((req,res)=>{let p=path.join(root,decodeURIComponent(req.url.split('?')[0]));if(!p.startsWith(root)||!fs.existsSync(p)||fs.statSync(p).isDirectory())p=path.join(root,'index.html');res.writeHead(200,{'Content-Type':types[path.extname(p)]||'application/octet-stream'});fs.createReadStream(p).pipe(res);}).listen(4180);
const [,, hash, outName, waitSel, clickText] = process.argv;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
  const chr=spawn('/usr/bin/chromium',['--headless=new','--no-sandbox','--disable-gpu','--remote-debugging-port=9333','--user-data-dir=/tmp/chr-prof-'+Date.now(),'--window-size=1400,1000','about:blank'],{stdio:'ignore'});
  let ver; for(let i=0;i<50;i++){try{ver=await (await fetch('http://127.0.0.1:9333/json/list')).json();if(ver.length)break;}catch{} await sleep(200);}
  const ws=new WebSocket(ver.find(t=>t.type==='page').webSocketDebuggerUrl);
  await new Promise(r=>ws.onopen=r);
  let id=0;const pending=new Map();
  ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id&&pending.has(m.id)){pending.get(m.id)(m);pending.delete(m.id);}};
  const send=(method,params={})=>new Promise(r=>{const i=++id;pending.set(i,r);ws.send(JSON.stringify({id:i,method,params}));});
  const ev=async expr=>{const r=await send('Runtime.evaluate',{expression:expr,awaitPromise:true,returnByValue:true});return r.result?.result?.value ?? r.result?.exceptionDetails?.exception?.description;};
  await send('Page.enable');await send('Runtime.enable');
  await send('Page.navigate',{url:'http://127.0.0.1:4180/'+hash});
  const t0=Date.now();
  for(let i=0;i<240;i++){ if(await ev(`!!document.querySelector(${JSON.stringify(waitSel)})`)) break; await sleep(500);}
  console.log('ready after ms',Date.now()-t0);
  if(clickText){ await ev(`(()=>{const b=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(clickText)});b&&b.click();return !!b})()`); await sleep(8000); }
  await sleep(4000);
  if(process.env.INSPECT){console.log(await ev(`JSON.stringify([...document.querySelectorAll('svg.recharts-surface')].slice(0,3).map(s=>({cls:s.getAttribute('class'),w:s.getAttribute('width'),h:s.getAttribute('height'),vb:s.getAttribute('viewBox'),style:s.getAttribute('style'),parent:s.parentElement.className,pstyle:s.parentElement.getAttribute('style'),gp:s.parentElement.parentElement.className,gpstyle:s.parentElement.parentElement.getAttribute('style')})))`));}
  // Keep the print clone in the page so it can be inspected and rendered.
  console.log('print', await ev(`(()=>{const orig=document.body.removeChild.bind(document.body);window.print=()=>{document.body.removeChild=n=>n;};const b=[...document.querySelectorAll('button')].find(b=>new RegExp(${JSON.stringify(process.env.PRINT_BTN||'Print')}).test(b.textContent));if(!b)return 'no print button';b.click();document.body.removeChild=orig;return !!document.querySelector('.print-clone')})()`));
  await send('Emulation.setEmulatedMedia',{media:'print'});
  await sleep(500);
  console.log('check', await ev(`(()=>{const c=document.querySelector('.print-clone');if(!c)return 'no clone';
    const svgs=[...c.querySelectorAll('.recharts-wrapper > svg.recharts-surface')];
    const charts=svgs.map(s=>{const r=s.getBoundingClientRect();const shapes=s.querySelectorAll('.recharts-bar-rectangle path, .recharts-line-curve, .recharts-rectangle').length;
      const broken=[...s.querySelectorAll('[clip-path]')].filter(e=>{const m=e.getAttribute('clip-path').match(/#([^)'"]+)/);return m&&!c.querySelector('#'+CSS.escape(m[1]));}).length;
      return Math.round(r.width)+'x'+Math.round(r.height)+' shapes='+shapes+' brokenClip='+broken;});
    const heat=c.querySelectorAll('.heat-cell').length; const tables=c.querySelectorAll('table').length;
    const wide=[...c.querySelectorAll('*')].filter(e=>e.getBoundingClientRect().right>c.getBoundingClientRect().right+2).length;
    return JSON.stringify({charts,heat,tables,overflowingElements:wide,cloneWidth:Math.round(c.getBoundingClientRect().width)});})()`));
  if(process.env.EXTRA)console.log('extra',await ev(process.env.EXTRA));
  const pdf=await send('Page.printToPDF',{printBackground:true,preferCSSPageSize:true});
  fs.writeFileSync(`.tmp-print/${outName}.pdf`,Buffer.from(pdf.result.data,'base64'));
  await send('Emulation.setDeviceMetricsOverride',{width:1047,height:718,deviceScaleFactor:1,mobile:false});
  await sleep(800);
  const h=await ev(`Math.ceil(document.querySelector('.print-clone')?.getBoundingClientRect().height||1123)`);
  if(process.env.MEASURE)console.log('measure',await ev(`JSON.stringify([...document.querySelector('.print-clone').querySelectorAll('section, .grid, h1, .rounded-xl')].filter(e=>e.getBoundingClientRect().height>40).map(e=>[(e.querySelector('h3')||e).textContent.slice(0,25),Math.round(e.getBoundingClientRect().top),Math.round(e.getBoundingClientRect().height)]))`));
  const shot=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true,clip:{x:0,y:0,width:1047,height:Math.min(h,9000),scale:1}});
  fs.writeFileSync(`.tmp-print/${outName}.png`,Buffer.from(shot.result.data,'base64'));
  console.log('pdf bytes',fs.statSync(`.tmp-print/${outName}.pdf`).size,'pages',(fs.readFileSync(`.tmp-print/${outName}.pdf`,'latin1').match(/\/Type\s*\/Page[^s]/g)||[]).length,'png height',h);
  chr.kill();server.close();process.exit(0);
})().catch(e=>{console.error(e);process.exit(1);});
