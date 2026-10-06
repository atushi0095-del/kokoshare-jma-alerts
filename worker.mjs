import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {GoogleAuth} from 'google-auth-library';
import {FEED,SHORT_FEED,feedEntries,parseBulletin,transition,topic,semanticState} from './jma.mjs';
async function get(url) {
  const r = await fetch(url,{signal:AbortSignal.timeout(20000),redirect:'error'});
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const text = await r.text();
  if(text.length>12000000) throw new Error('Response too large');
  return text;
}
async function main(){
if(process.argv.includes('--send')) {
  const state=JSON.parse(await fs.readFile('state.json','utf8'));
  const events=state.pending||[];
  if(!events.length){console.log('No pending changes');process.exit(0);}
  const credentials=JSON.parse(process.env.FCM_SERVICE_ACCOUNT || '{}');
  if(!credentials.project_id) throw new Error('FCM_SERVICE_ACCOUNT is required');
  const auth=new GoogleAuth({credentials,scopes:['https://www.googleapis.com/auth/firebase.messaging']});
  const client=await auth.getClient();
  let delivered=0;
  try { for(const event of events) {
    if(Date.now()-Date.parse(event.issuedAt)>86400000){delivered++;continue;}
    const {notifyLevel,...publicEvent}=event;
    const eventId=createHash('sha256').update(JSON.stringify(publicEvent)).digest('hex');
    const title=`${event.name}${event.active?'':' 解除'}｜${event.area}`;
    await client.request({url:`https://fcm.googleapis.com/v1/projects/${credentials.project_id}/messages:send`,method:'POST',retry:false,data:{message:{topic:topic(event.code,event.notifyLevel),data:{eventId,areaCode:event.code,areaName:event.area,title,issuedAt:event.issuedAt,url:event.url,level:event.notifyLevel,active:String(event.active)},android:{priority:'normal',ttl:'1800s'}}}});
    delivered++;
  }} finally {state.pending=events.slice(delivered);await fs.writeFile('state.json',JSON.stringify(state,null,2)+'\n');}
  console.log(`Dispatch completed: ${events.length}`);
} else {
  let previous;
  try {previous=JSON.parse(await fs.readFile('state.json','utf8'));} catch(e) {if(e.code!=='ENOENT')throw e;}
  const entries=[...feedEntries(await get(FEED)),...feedEntries(await get(SHORT_FEED))];
  // Keep the newest bulletin per product/office; the long feed covers scheduler delays.
  const newest=new Map();
  for(const e of entries) {
    const key=e.url.match(/_VPWW\d+_[^/]+\.xml$/)?.[0];
    if(key && (!newest.has(key)||e.updated>newest.get(key).updated)) newest.set(key,e);
  }
  if(!newest.size)throw new Error('No supported bulletins; retaining last known state');
  let cache={};
  try{cache=JSON.parse(await fs.readFile('fetch-cache.json','utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
  const nextCache={},bulletins=[];
  for(const e of newest.values()) {
    const text=cache[e.url]||await get(e.url);
    nextCache[e.url]=text;
    bulletins.push(parseBulletin(text));
    if(!cache[e.url])await new Promise(resolve=>setTimeout(resolve,150));
  }
  const result=transition(previous,bulletins);
  const pending=new Map((previous?.pending||[]).map(e=>[`${e.code}:${e.phenomenon}:${e.notifyLevel}`,e]));
  for(const event of result.events)pending.set(`${event.code}:${event.phenomenon}:${event.notifyLevel}`,event);
  result.state.pending=[...pending.values()].filter(e=>Date.now()-Date.parse(e.issuedAt)<86400000);
  if(!previous?.initialized||semanticState(previous)!==semanticState(result.state)||JSON.stringify(previous.pending||[])!==JSON.stringify(result.state.pending))await fs.writeFile('state.json',JSON.stringify(result.state,null,2)+'\n');
  await fs.writeFile('fetch-cache.json',JSON.stringify(nextCache));
  await fs.writeFile('outbox.json',JSON.stringify(result.events));
  console.log(`Bulletins ${bulletins.length}, changes ${result.events.length}`);
}
}
main().catch(error=>{
  // Gaxios errors can contain request headers. Never log the error/config object.
  console.error('Alert worker failed. Status:',Number(error?.response?.status)||'unavailable');
  process.exitCode=1;
});
