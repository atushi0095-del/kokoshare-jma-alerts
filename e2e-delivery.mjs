import {createHash} from 'node:crypto';
import {GoogleAuth} from 'google-auth-library';
import {FEED,SHORT_FEED,feedEntries,parseBulletin,topic,officialUrl} from './jma.mjs';

async function get(url){
  const response=await fetch(url,{signal:AbortSignal.timeout(20000),redirect:'error'});
  if(!response.ok)throw new Error('JMA unavailable');
  const text=await response.text();
  if(text.length>12000000)throw new Error('Oversized bulletin');
  return text;
}
try {
  if(process.env.CONFIRM!=='SEND_ONE_CHIYODA_TEST')throw new Error('Explicit test confirmation required');
  const entries=[...feedEntries(await get(SHORT_FEED)),...feedEntries(await get(FEED))];
  const entry=entries.filter(e=>e.url.endsWith('_VPWW53_130000.xml')).sort((a,b)=>b.updated.localeCompare(a.updated))[0];
  if(!entry)throw new Error('No Tokyo bulletin');
  const bulletin=parseBulletin(await get(entry.url));
  const observation=bulletin?.observations.find(r=>r.code==='1310100'&&r.phenomenon==='大雨');
  if(!observation||Math.abs(Date.now()-Date.parse(observation.issuedAt))>86400000)throw new Error('No fresh Chiyoda observation; do not fabricate one');
  const credentials=JSON.parse(process.env.FCM_SERVICE_ACCOUNT||'{}');
  if(credentials.project_id!=='annpinote-62e79')throw new Error('Wrong project');
  const client=await new GoogleAuth({credentials,scopes:['https://www.googleapis.com/auth/firebase.messaging']}).getClient();
  const eventId=createHash('sha256').update(`e2e:${process.env.GITHUB_RUN_ID}:${entry.url}`).digest('hex');
  const target=topic('1310100','warning');
  const title=`【配信試験】千代田区:大雨${observation.active?'情報あり':'発表なし'}（原文）`;
  const response=await client.request({url:`https://fcm.googleapis.com/v1/projects/${credentials.project_id}/messages:send`,method:'POST',retry:false,data:{message:{topic:target,data:{eventId,areaCode:'1310100',areaName:'千代田区',title,issuedAt:observation.issuedAt,url:officialUrl('1310100'),level:'warning',active:String(observation.active)},android:{priority:'normal',ttl:'600s'}}}});
  console.log(JSON.stringify({source:entry.url,issuedAt:observation.issuedAt,active:observation.active,topic:target,eventId,title,fcmMessage:response.data.name,accepted:response.status===200,deviceReceiptVerified:false}));
}catch(error){console.error('E2E delivery failed. Status:',Number(error?.response?.status)||'unavailable');process.exitCode=1;}
