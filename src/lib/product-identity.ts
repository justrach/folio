export type ProductIdentity = {id:string;name:string;aliases:string[];urls:string[]};
// Deliberately small reviewed registry. A shared hosting domain is never a product ID.
export const REVIEWED_PRODUCTS:ProductIdentity[]=[
  {id:"cline",name:"Cline",aliases:["cline"],urls:["https://cline.bot/","https://github.com/cline/cline"]},
  {id:"goose",name:"Goose",aliases:["goose","block goose"],urls:["https://block.github.io/goose/","https://github.com/block/goose"]},
];
const normalized=(value:string)=>{try{const u=new URL(value);return `${u.hostname.toLowerCase().replace(/^www\./,"")}${u.pathname.replace(/\/$/,"")}`;}catch{return null;}};
export function identifyProduct(name:string,url:string|null,registry=REVIEWED_PRODUCTS){
  const observed=normalized(url??"");
  const names=registry.filter(p=>p.aliases.includes(name.trim().toLowerCase()));
  const urls=observed?registry.filter(p=>p.urls.some(v=>{const canonical=normalized(v)!;return observed===canonical||observed.startsWith(`${canonical}/`);})):[];
  const candidates=urls.length?urls:names;
  if(candidates.length!==1||names.some(p=>p.id!==candidates[0].id))return null;
  return {...candidates[0],matchingMethod:urls.length?"reviewed_url":"reviewed_alias"};
}
