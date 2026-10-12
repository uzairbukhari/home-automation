import {getOwnerUser,sameOrigin} from '@/lib/owner-auth';
import {providerPolicy} from '@/lib/provider-policy';
import {database,dueWork} from '@/lib/jobs';
import {TuyaProvider} from '@/lib/providers/tuya';
import {applyRoomOverrides,collectTuya} from '@/lib/tuya-store';
import {reconcileCommands} from '@/lib/commands';
import {evaluateAutomations} from '@/lib/automations';
export async function POST(request:Request){
 if(!await getOwnerUser())return Response.json({error:'Unauthorized'},{status:401});if(!sameOrigin(request))return Response.json({error:'Invalid request origin'},{status:403});
 const policy=providerPolicy('tuya');if(!policy.foreground)return Response.json({status:'scheduled',...policy});
 try{const now=new Date(),cutoff=new Date(+now-30000).toISOString();await database().prepare('UPDATE app_jobs SET next_due=? WHERE id=? AND error IS NULL AND last_success<=? AND next_due>? AND (lease_until IS NULL OR lease_until<=?)').bind(now.toISOString(),'tuya-live',cutoff,now.toISOString(),now.toISOString()).run();const result=await dueWork('tuya-live',30000,async()=>{await collectTuya(await applyRoomOverrides(await new TuyaProvider().getDevices()));await reconcileCommands();await evaluateAutomations();return{status:'updated'};});return Response.json(result);}
 catch{return Response.json({error:'Refresh unavailable; scheduled updates will retry.'},{status:503});}
}
