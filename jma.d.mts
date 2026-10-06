export type Observation={code:string;area:string;name:string;level:string;phenomenon:string;active:boolean;issuedAt:string;url:string};
export function feedEntries(text:string):Array<{url:string;updated:string}>;
export function parseBulletin(text:string):{issuedAt:string;observations:Observation[]}|null;
export function officialUrl(code:string):string;
export function desiredTopics(regions:Array<{code:string}>,levels:Record<string,boolean>,enabled:boolean):string[];
