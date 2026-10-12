import { getOwnerUser } from "@/lib/owner-auth";

import { deviceHistory } from "@/lib/tuya-store";

export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){if(!(await getOwnerUser()))return Response.json({error:"Unauthorized"},{status:401});try{const {id}=await params;const url=new URL(request.url),to=url.searchParams.get("to")??new Date().toISOString(),from=url.searchParams.get("from")??new Date(Date.now()-7*86_400_000).toISOString();if(!Number.isFinite(Date.parse(from))||!Number.isFinite(Date.parse(to))||Date.parse(from)>Date.parse(to)||Date.parse(to)-Date.parse(from)>3660*86400000)throw new Error("Choose a valid history range");return Response.json(await deviceHistory(id,new Date(from).toISOString(),new Date(to).toISOString(),url.searchParams.get("cursor")??""),{headers:{"cache-control":"private, no-store"}})}catch(error){return Response.json({error:error instanceof Error?error.message:"History is unavailable"},{status:400})}}
