'use client';
import {useState} from 'react';
import {Eye,EyeOff} from 'lucide-react';
import {LogoMark} from '@/components/logo-mark';
export function LoginForm({returnTo,error}:{returnTo:string;error?:string}){
 const [show,setShow]=useState(false),[busy,setBusy]=useState(false);
 return <main className="login-page"><form className="login-card" method="post" action="/api/auth/login" onSubmit={()=>setBusy(true)}>
  <div className="login-brand"><span className="app-logo brand-mark"><LogoMark/></span><div><h1>Photon</h1><p>Private home dashboard</p></div></div>
  <input type="hidden" name="return_to" value={returnTo}/>
  <label htmlFor="password">Password</label>
  <div className="login-field"><input id="password" type={show?'text':'password'} name="password" autoComplete="current-password" autoFocus required aria-invalid={error?true:undefined} aria-describedby={error?'login-error':undefined}/><button type="button" className="icon-button" aria-label={show?'Hide password':'Show password'} aria-pressed={show} onClick={()=>setShow(value=>!value)}>{show?<EyeOff/>:<Eye/>}</button></div>
  {error&&<p id="login-error" className="login-error" role="alert">{error}</p>}
  <button className="primary-action" type="submit" disabled={busy}>{busy?'Signing in…':'Sign in'}</button>
 </form></main>;
}
