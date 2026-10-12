import { env } from "cloudflare:workers";

function toBytes(value:string){
  const binary=atob(value);
  return Uint8Array.from(binary,character=>character.charCodeAt(0));
}

function toBase64(value:ArrayBuffer|Uint8Array){
  const bytes=value instanceof Uint8Array?value:new Uint8Array(value);
  let binary="";
  for(const byte of bytes)binary+=String.fromCharCode(byte);
  return btoa(binary);
}

async function key(){
  const secret=(env as unknown as Record<string,unknown>).CREDENTIAL_ENCRYPTION_KEY;
  if(typeof secret!=="string"||!secret)throw new Error("Credential encryption is unavailable");
  const raw=toBytes(secret);
  if(raw.byteLength!==32)throw new Error("Credential encryption is misconfigured");
  return crypto.subtle.importKey("raw",raw,"AES-GCM",false,["encrypt","decrypt"]);
}

export async function encryptCredential(value:unknown,aad:string){
  const iv=crypto.getRandomValues(new Uint8Array(12));
  const plaintext=new TextEncoder().encode(JSON.stringify(value));
  const ciphertext=await crypto.subtle.encrypt({name:"AES-GCM",iv,additionalData:new TextEncoder().encode(aad)},await key(),plaintext);
  return {ciphertext:toBase64(ciphertext),iv:toBase64(iv)};
}
