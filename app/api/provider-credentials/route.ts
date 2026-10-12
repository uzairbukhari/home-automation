import { env } from "cloudflare:workers";
import { getOwnerUser,sameOrigin } from "@/lib/owner-auth";
import { encryptCredential } from "@/lib/credential-vault";

const provider="dessmonitor";
function database(){if(!env.DB)throw new Error("Credential storage is unavailable");return env.DB}
function required(value:unknown,label:string,max=256){const text=String(value??"").trim();if(!text||text.length>max)throw new Error(`${label} is required`);return text}

export async function GET(){
  const user=await getOwnerUser();
  if(!user)return Response.json({error:"Unauthorized"},{status:401});
  const row=await database().prepare("SELECT updated_at FROM provider_credentials WHERE user_id = ? AND provider = ?").bind(user.userId,provider).first<{updated_at:string}>();
  return Response.json({provider,configured:Boolean(row),updatedAt:row?.updated_at??null});
}

export async function PUT(request:Request){
  if(!sameOrigin(request))return Response.json({error:'Invalid request origin'},{status:403});
  const user=await getOwnerUser();
  if(!user)return Response.json({error:"Unauthorized"},{status:401});
  try{
    const body=await request.json() as Record<string,unknown>;
    const credentials={username:required(body.username,"Username"),password:required(body.password,"Password",512),companyKey:required(body.companyKey,"Company key")};
    const encrypted=await encryptCredential(credentials,`${user.userId}:${provider}`);
    await database().prepare("INSERT INTO provider_credentials (user_id,provider,ciphertext,iv,updated_at) VALUES (?,?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(user_id,provider) DO UPDATE SET ciphertext=excluded.ciphertext,iv=excluded.iv,updated_at=CURRENT_TIMESTAMP").bind(user.userId,provider,encrypted.ciphertext,encrypted.iv).run();
    await database().prepare("INSERT INTO connection_state (provider,status,last_success_at,last_error_code,updated_at) VALUES (?,'credentials_saved',NULL,NULL,CURRENT_TIMESTAMP) ON CONFLICT(provider) DO UPDATE SET status='credentials_saved',last_error_code=NULL,updated_at=CURRENT_TIMESTAMP").bind(provider).run();
    return Response.json({saved:true,provider,configured:true});
  }catch(error){return Response.json({error:error instanceof Error?error.message:"Unable to save credentials"},{status:400})}
}

export async function DELETE(request:Request){
  if(!sameOrigin(request))return Response.json({error:'Invalid request origin'},{status:403});
  const user=await getOwnerUser();
  if(!user)return Response.json({error:"Unauthorized"},{status:401});
  await database().prepare("DELETE FROM provider_credentials WHERE user_id = ? AND provider = ?").bind(user.userId,provider).run();
  await database().prepare("UPDATE connection_state SET status='not_configured',last_success_at=NULL,last_error_code=NULL,updated_at=CURRENT_TIMESTAMP WHERE provider = ?").bind(provider).run();
  return Response.json({removed:true,provider,configured:false});
}
