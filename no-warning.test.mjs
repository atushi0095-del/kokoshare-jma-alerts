import test from 'node:test';
import assert from 'node:assert/strict';
import {parseBulletin,transition} from './jma.mjs';
test('real VPWW53 Kind.Status without Name clears previous warning',()=>{
  const bulletin=parseBulletin('<Report><Control><Title>気象特別警報・警報・注意報</Title><Status>通常</Status></Control><Head><ReportDateTime>2026-10-07T16:57:00+09:00</ReportDateTime><InfoType>発表</InfoType></Head><Body><Warning><Item><Kind><Status>発表警報・注意報はなし</Status></Kind><Area><Name>千代田区</Name><Code>1310100</Code></Area></Item></Warning></Body></Report>');
  assert.equal(bulletin.observations.length,5);
  const previous={initialized:true,records:{'1310100:大雨':{...bulletin.observations[0],active:true,issuedAt:'2026-10-07T15:00:00+09:00'}}};
  const result=transition(previous,[bulletin]);
  assert.equal(result.events.length,1);
  assert.equal(result.events[0].active,false);
  assert.equal(transition(result.state,[bulletin]).events.length,0);
});
