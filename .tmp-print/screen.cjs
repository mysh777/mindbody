const http=require('http'),fs=require('fs'),path=require('path'),{spawn}=require('child_process');
const root=path.resolve('dist');
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml'};
const server=http.createServer((req,res)=>{let p=path.join(root,decodeURIComponent(req.url.split('?')[0]));if(!p.startsWith(root)||!fs.existsSync(p)||fs.statSync(p).isDirectory())p=path.join(root,'index.html');res.writeHead(200,{'Content-Type':types[path.extname(p)]||'application/octet-stream'});fs.createReadStream(p).pipe(res);}).listen(4181);
const [,, hash, outName, waitSel, js] = process.argv;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
  const chr=spawn('/usr/bin/chromium',['--headless=new','--no-sandbox','--disable-gpu','--remote-debugging-port=9334','--user-data-dir=/tmp/chr-s-'+Date.now(),'--window-size=1400,1000','about:blank'],{stdio:'ignore'});
  let ver; for(let i=0;i<50;i++){try{ver=await (await fetch('http://127.0.0.1:9334/json/list')).json();if(ver.length)break;}catch{} await sleep(200);}
  const ws=new WebSocket(ver.find(t=>t.type==='page').webSocketDebuggerUrl); await new Promise(r=>ws.onopen=r);
  let id=0;const pending=new Map(); ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id&&pending.has(m.id)){pending.get(m.id)(m);pending.delete(m.id);}};
  const send=(method,params={})=>new Promise(r=>{const i=++id;pending.set(i,r);ws.send(JSON.stringify({id:i,method,params}));});
  const ev=async expr=>{const r=await send('Runtime.evaluate',{expression:expr,awaitPromise:true,returnByValue:true});return r.result?.result?.value ?? r.result?.exceptionDetails?.exception?.description;};
  await send('Page.enable');await send('Runtime.enable');
  await send('Page.navigate',{url:'http://127.0.0.1:4181/'+hash});
  for(let i=0;i<240;i++){ if(await ev(`!!document.querySelector(${JSON.stringify(waitSel)})`)) break; await sleep(500);}
  await sleep(4000);
  if(js){ console.log('js', await ev(js)); await sleep(6000); }
  console.log('url', await ev('location.hash'));
  const h=await ev('Math.min(document.documentElement.scrollHeight,6000)');
  const shot=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true,clip:{x:0,y:0,width:1400,height:h,scale:1}});
  fs.writeFileSync(`.tmp-print/${outName}.png`,Buffer.from(shot.result.data,'base64'));
  console.log('h',h); chr.kill();server.close();process.exit(0);
})().catch(e=>{console.error(e);process.exit(1);});
