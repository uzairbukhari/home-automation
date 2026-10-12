import {DessMonitorProvider,type DessSnapshot} from './providers/dessmonitor';
import {saveSnapshot} from './solar-store';
let pending:Promise<DessSnapshot>|null=null;
export function refreshSolarSnapshot(){
 if(!pending)pending=(async()=>{const snapshot=await new DessMonitorProvider().getSnapshot();await saveSnapshot(snapshot);return snapshot;})().finally(()=>{pending=null;});
 return pending;
}
