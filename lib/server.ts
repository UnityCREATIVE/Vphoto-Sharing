import { cookies } from 'next/headers';
import { verifySession } from './security.mjs';
export class AppError extends Error { constructor(message:string,public status=400){super(message);} }
export function setting(key:string){const value=process.env[key];if(!value)throw new AppError('The workspace needs configuration. Check the setup guide.',503);return value;}
export async function rest(path:string,method='GET',body?:unknown){
 const key=setting('SUPABASE_SERVICE_ROLE_KEY');
 const r=await fetch(`${setting('SUPABASE_URL')}/rest/v1/${path}`,{method,headers:{apikey:key,Authorization:`Bearer ${key}`,'Content-Type':'application/json',Prefer:'return=representation'},body:body===undefined?undefined:JSON.stringify(body),cache:'no-store'});
 if(!r.ok){console.error('Database request failed',r.status,path.split('?')[0]);throw new AppError('Could not save or load data. Please try again; if it continues, check the database setup.',503);}
 const text=await r.text();return text?JSON.parse(text):null;
}
export async function authRequest(path:string,body?:unknown,token?:string){return fetch(`${setting('SUPABASE_URL')}/auth/v1/${path}`,{method:body===undefined?'GET':'POST',headers:{apikey:setting('SUPABASE_ANON_KEY'),'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},body:body===undefined?undefined:JSON.stringify(body),cache:'no-store'});}
export const options={httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'lax' as const,path:'/'};
export async function storeAdmin(session:{access_token:string;refresh_token:string;expires_in:number}){const jar=await cookies();jar.set('pr_access',session.access_token,{...options,maxAge:session.expires_in});jar.set('pr_refresh',session.refresh_token,{...options,maxAge:7*86400});}
export async function isAdmin(){
 const jar=await cookies(),access=jar.get('pr_access')?.value,refresh=jar.get('pr_refresh')?.value;
 if(!access&&!refresh)return false;
 if(access){const r=await authRequest('user',undefined,access);if(r.ok){const u=await r.json();return u.email?.toLowerCase()===setting('ADMIN_EMAIL').toLowerCase();}if(r.status!==401&&r.status!==403)throw new AppError('Sign-in verification is unavailable. Please retry.',503);}
 if(refresh){const r=await authRequest('token?grant_type=refresh_token',{refresh_token:refresh});if(r.ok){const session=await r.json();if(session.user?.email?.toLowerCase()!==setting('ADMIN_EMAIL').toLowerCase())return false;await storeAdmin(session);return true;}}
 return false;
}
export function identifier(x:unknown){if(typeof x!=='string'||!/^[0-9a-f-]{36}$/i.test(x))throw new AppError('Invalid project or album.');return x;}
export async function projectById(id:string){return (await rest(`projects?id=eq.${identifier(id)}&select=*`))[0];}
export async function canReview(project:any){if(!project?.password_hash)return false;return verifySession((await cookies()).get(`pr_${project.id}`)?.value,project.id,project.password_version);}
export async function rateLimit(key:string){const allowed=await rest('rpc/consume_login_attempt','POST',{bucket_key:key});if(!allowed)throw new AppError('Too many attempts. Please wait 15 minutes before trying again.',429);}
export function text(x:unknown,max=300){return typeof x==='string'?x.trim().slice(0,max):'';}
export async function requestBody(req:Request){const origin=req.headers.get('origin');let originHost='';try{originHost=new URL(origin||'').host;}catch{}if(!originHost||originHost!==req.headers.get('host'))throw new AppError('Request not allowed.',403);const raw=await req.text();if(raw.length>150000)throw new AppError('Please submit fewer albums at once.',413);try{return JSON.parse(raw);}catch{throw new AppError('Invalid request.');}}
export const reply=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
export function failure(e:unknown){if(e instanceof AppError)return reply({error:e.message},e.status);console.error('Workspace operation failed',e instanceof Error?e.name:'Unknown');return reply({error:'Could not complete the request. Please try again.'},500);}
