import { XMLParser, XMLValidator } from 'fast-xml-parser';
const list = x => x == null ? [] : Array.isArray(x) ? x : [x];
const parser = new XMLParser({ ignoreAttributes: false, removeNSPrefix: true, parseTagValue: false });
export const FEED = 'https://www.data.jma.go.jp/developer/xml/feed/extra_l.xml';
export const SHORT_FEED = 'https://www.data.jma.go.jp/developer/xml/feed/extra.xml';
export const officialUrl = code => `https://www.jma.go.jp/bosai/warning/#area_type=class20s&area_code=${code}`;
export function xml(text) {
  if (typeof text !== 'string' || text.length > 12000000 || /<!DOCTYPE|<!ENTITY/i.test(text) || XMLValidator.validate(text) !== true) throw new Error('Invalid XML');
  return parser.parse(text);
}
export function topic(code, level) {
  if (!/^\d{7}$/.test(code) || !['special','warning','advisory'].includes(level)) throw new Error('Invalid topic');
  return `kokoshare_jma_${code}_${level}`;
}
export function desiredTopics(regions, levels, enabled) {
  if (!enabled) return [];
  return [...new Set(regions.slice(0,3).flatMap(r => Object.keys(levels).filter(k => levels[k]).map(k => topic(r.code,k))))].sort();
}
export function topicDiff(current, desired) {
  return { remove: current.filter(x => !desired.includes(x)), add: desired.filter(x => !current.includes(x)) };
}
export function severity(name) {
  if (!/(大雨|洪水|暴風雪|暴風|大雪)/.test(name)) return null;
  if (name.includes('特別警報')) return 'special';
  if (name.includes('警報')) return 'warning';
  if (name.includes('注意報')) return 'advisory';
  return null;
}
export function feedEntries(text) {
  return list(xml(text).feed?.entry).map(e => ({url:String(e.id || ''), updated:e.updated || ''}))
    .filter(e => /^https:\/\/www\.data\.jma\.go\.jp\/developer\/xml\/data\/[a-zA-Z0-9_.-]+\.xml$/.test(e.url) && /_VPWW(?:53|55|58|60)_/.test(e.url));
}
export function parseBulletin(text) {
  const r = xml(text).Report;
  if (!r?.Control || !r?.Head || !r?.Body) throw new Error('Incomplete bulletin');
  if (r.Control.Status !== '通常' || r.Head.InfoType === '取消') return null;
  const issuedAt = r.Head.ReportDateTime;
  if (!Number.isFinite(Date.parse(issuedAt))) throw new Error('Invalid issue time');
  const observations = [];
  const title=String(r.Control.Title||'');
  const rank=title.includes('Ｒ０６')?1:0;
  for (const warning of list(r.Body.Warning)) for (const item of list(warning.Item)) {
    const areas = list(item.Area || item.Areas?.Area);
    for (const area of areas) {
      if (!/^\d{7}$/.test(String(area.Code))) continue;
      for (const kind of list(item.Kind)) {
        const name = String(kind.Name || '');
        const explicitNone = !name && kind.Status === '発表警報・注意報はなし';
        if(explicitNone || (String(kind.Code)==='00'&&['発表警報・注意報はなし','解除'].includes(name))) {
          const scoped=title.match(/（(暴風雪|大雨|洪水|暴風|大雪)）/);
          if(rank&&!scoped)continue;
          const phenomena=scoped?(scoped[1]==='暴風'?['暴風','暴風雪']:[scoped[1]]):['大雨','洪水','暴風','暴風雪','大雪'];
          for(const phenomenon of phenomena) observations.push({code:String(area.Code),area:area.Name,name:phenomenon+'警報',level:'warning',phenomenon,active:false,issuedAt,url:officialUrl(area.Code),rank});
          continue;
        }
        const level = severity(name);
        if (!level) continue;
        const phenomenon = name.match(/暴風雪|大雨|洪水|暴風|大雪/)[0];
        const active = !['解除','発表警報・注意報はなし'].includes(kind.Status);
        observations.push({code:String(area.Code), area:area.Name, name, level, phenomenon, active, issuedAt, url:officialUrl(area.Code),rank});
      }
    }
  }
  return { issuedAt, observations };
}
export function transition(previous, bulletins) {
  const state = structuredClone(previous || { initialized:false, records:{} });
  for (const b of bulletins.filter(Boolean).sort((a,b)=>Date.parse(a.issuedAt)-Date.parse(b.issuedAt))) {
    for (const next of b.observations) {
      const key = `${next.code}:${next.phenomenon}`;
      const old = state.records[key];
      if (old && Date.parse(old.issuedAt) > Date.parse(next.issuedAt)) continue;
      if(old&&old.issuedAt===next.issuedAt&&(old.rank||0)>(next.rank||0))continue;
      state.records[key] = next;
    }
  }
  const events=[];
  for(const [key,next] of Object.entries(state.records)) {
    const old=previous?.records?.[key];
    if(previous?.initialized && (!old||old.active!==next.active||old.name!==next.name) && (next.active||old?.active)) {
      // A downgrade also informs subscribers of the former, more severe level.
      const levels=new Set([next.active?next.level:old.level]);
      if(old?.active&&old.level!==next.level)levels.add(old.level);
      for(const notifyLevel of levels)events.push({...next,notifyLevel});
    }
  }
  state.initialized = true;
  return {state,events};
}
export function semanticState(state) {
  return JSON.stringify(Object.entries(state?.records||{}).sort(([a],[b])=>a.localeCompare(b)).map(([key,r])=>[key,r.active,r.name]));
}
