export type DataQuality = "good" | "stale" | "missing" | "estimated";
export type Reading = { entityId:string; metric:string; value:number|null; unit:string; sourceTimestamp:string; quality:DataQuality };
export type ProviderStatus = { provider:"dessmonitor"|"tuya"; status:"connected"|"degraded"|"not_configured"; lastSuccessAt:string|null; blocker:string|null };
export interface MonitoringProvider { getStatus():Promise<ProviderStatus>; getLatest():Promise<Reading[]>; }
