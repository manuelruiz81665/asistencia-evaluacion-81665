const KEYS={config:"edutrack_config",records:"edutrack_records"};
function read(key,fallback){try{return JSON.parse(localStorage.getItem(key))??fallback}catch{return fallback}}
function write(key,value){localStorage.setItem(key,JSON.stringify(value))}
export const storage={
  getConfig:()=>read(KEYS.config,{apiUrl:"",apiKey:""}),
  setConfig:v=>write(KEYS.config,v),
  getRecords:()=>read(KEYS.records,[]),
  addRecord:r=>write(KEYS.records,[...read(KEYS.records,[]),r]),
  removeRecord:id=>write(KEYS.records,read(KEYS.records,[]).filter(r=>r.id!==id)),
  markSynced:(id,response)=>write(KEYS.records,read(KEYS.records,[]).map(r=>r.id===id?{...r,status:"synced",response}:r)),
  clearRecords:()=>write(KEYS.records,[]),
  setCache:(name,data)=>write(`edutrack_cache_${name}`,data),
  getCache:name=>read(`edutrack_cache_${name}`,null)
};