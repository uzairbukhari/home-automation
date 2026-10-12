import { database } from './jobs';

export type LedgerRow={provider:string;entity_id:string;dataset:string;oldest_covered:string|null;covered_through:string|null;cursor:string|null;status:string;rows_total:number;error:string|null;updated_at:string};
// The Turso free plan allows 5 GB; above this the oldest verified raw days are pruned instead of kept.
export const STORAGE_PRUNE_BYTES=4*1024**3;
export async function ledgerRow(provider:string,entity:string,dataset:string){return database().prepare('SELECT * FROM provider_backfill WHERE provider=? AND entity_id=? AND dataset=?').bind(provider,entity,dataset).first<LedgerRow>();}
export async function saveLedger(provider:string,entity:string,dataset:string,patch:Partial<Pick<LedgerRow,'oldest_covered'|'covered_through'|'cursor'|'status'|'error'>>&{addRows?:number}){
  const now=new Date().toISOString(),previous=await ledgerRow(provider,entity,dataset),next={oldest_covered:previous?.oldest_covered??null,covered_through:previous?.covered_through??null,cursor:previous?.cursor??null,status:previous?.status??'pending',error:previous?.error??null,...patch};
  await database().prepare('INSERT INTO provider_backfill(provider,entity_id,dataset,oldest_covered,covered_through,cursor,status,rows_total,error,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?) ON CONFLICT(provider,entity_id,dataset) DO UPDATE SET oldest_covered=excluded.oldest_covered,covered_through=excluded.covered_through,cursor=excluded.cursor,status=excluded.status,rows_total=provider_backfill.rows_total+?,error=excluded.error,updated_at=excluded.updated_at')
    .bind(provider,entity,dataset,next.oldest_covered,next.covered_through,next.cursor,next.status,patch.addRows??0,next.error,now,patch.addRows??0).run();
}
export async function storageBytes(){try{const db=database(),pages=await db.prepare('PRAGMA page_count').first<{page_count:number}>(),size=await db.prepare('PRAGMA page_size').first<{page_size:number}>();return pages&&size?pages.page_count*size.page_size:null;}catch{return null;}}
// Store a provider document only when its content changed, so daily refreshes cost one read.
export async function saveDocument(provider:string,entity:string,dataset:string,value:unknown){
  const db=database(),data=JSON.stringify(value),now=new Date().toISOString(),current=await db.prepare('SELECT data FROM provider_documents WHERE provider=? AND entity_id=? AND dataset=?').bind(provider,entity,dataset).first<{data:string}>();
  if(current?.data===data)return false;
  await db.prepare('INSERT INTO provider_documents(provider,entity_id,dataset,data,first_seen_at,updated_at) VALUES (?,?,?,?,?,?) ON CONFLICT(provider,entity_id,dataset) DO UPDATE SET data=excluded.data,updated_at=excluded.updated_at').bind(provider,entity,dataset,data,now,now).run();
  if(current)await db.prepare('INSERT OR IGNORE INTO upgrade_backup(kind,record_key,data) VALUES (?,?,?)').bind(`provider_document:${provider}:${dataset}`,`${entity}@${now}`,current.data).run();
  return true;
}
