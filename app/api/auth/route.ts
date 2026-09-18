import {cookies} from 'next/headers';
import {verifyPassword,signSession} from '@/lib/security.mjs';
import {requestBody,rateLimit,authRequest,setting,storeAdmin,options,projectById,identifier,reply,failure,AppError} from '@/lib/server';
export const runtime='nodejs';
export async function POST(req:Request){try{
 const b=await requestBody(req),jar=await cookies();
 if(b.action==='login'){
  await rateLimit('manager');
  if(typeof b.email!=='string'||typeof b.password!=='string'||b.password.length>256||b.email.toLowerCase().trim()!==setting('ADMIN_EMAIL').toLowerCase())throw new AppError('Email or password is incorrect.',401);
  const r=await authRequest('token?grant_type=password',{email:b.email.trim(),password:b.password});
  if(!r.ok)throw new AppError('Email or password is incorrect.',401);
  const session=await r.json();if(session.user?.email?.toLowerCase()!==setting('ADMIN_EMAIL').toLowerCase())throw new AppError('Access denied.',403);
  await storeAdmin(session);return reply({ok:true});
 }
 if(b.action==='unlock'){
  const id=identifier(b.project_id);await rateLimit('project:'+id);const p=await projectById(id);
  if(!p||!await verifyPassword(b.password,p.password_hash))throw new AppError('Incorrect password, or this project is not available for review yet.',401);
  jar.set(`pr_${id}`,signSession(id,p.password_version),{...options,maxAge:7*86400});return reply({ok:true});
 }
 if(b.action==='logout'){
  if(b.project_id){jar.delete('pr_'+identifier(b.project_id));}else{
   const access=jar.get('pr_access')?.value;if(access)await authRequest('logout?scope=local',{},access);
   jar.delete('pr_access');jar.delete('pr_refresh');
  }
  return reply({ok:true});
 }
 throw new AppError('Unknown action.');
}catch(e){return failure(e);}}
