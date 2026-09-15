const fs=require("fs");
const src=fs.readFileSync("constants/i18n/dictionaries.ts","utf8");
function block(name){
  const i=src.indexOf("export const "+name+" = {");
  if(i<0) throw new Error("no block "+name);
  let j=src.indexOf("{",i),d=0;
  for(let k=j;k<src.length;k++){if(src[k]==="{")d++;else if(src[k]==="}"){d--;if(!d)return src.slice(j+1,k);}}
}
function keys(t){const set=new Set();const re=/([A-Za-z0-9_]+)\s*:/g;let m;while((m=re.exec(t)))set.add(m[1]);return set;}
const en=keys(block("en")),hi=keys(block("hi")),ne=keys(block("ne"));
console.log("en",en.size,"hi",hi.size,"ne",ne.size);
console.log("missing hi:",[...en].filter(k=>!hi.has(k)).join(", ")||"none");
console.log("missing ne:",[...en].filter(k=>!ne.has(k)).join(", ")||"none");
console.log("extra hi:",[...hi].filter(k=>!en.has(k)).join(", ")||"none");
console.log("extra ne:",[...ne].filter(k=>!en.has(k)).join(", ")||"none");
