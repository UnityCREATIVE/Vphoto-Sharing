import {randomUUID} from 'node:crypto';
import {hashPassword,galleryUrl} from '@/lib/security.mjs';
import {rest,isAdmin,canReview,projectById,identifier,requestBody,text,reply,failure,AppError} from '@/lib/server';
export const runtime='nodejs';
export const dynamic='force-dynamic';
const publicProject=(p:any)=>({id:p.id,name:p.name,description:p.description,instructions:p.instructions,password_set:!!p.password_hash});
export async function GET(req:Request){try{
 const id=new URL(req.url).searchParams.get('review');
 if(id){const p=await projectById(id);if(!p||!await canReview(p))return reply({error:'Enter the project password to continue.',locked:true},401);return reply({admin:false,projects:[publicProject(p)],albums:await rest(`albums?project_id=eq.${p.id}&order=sort,id`)});}
 if(!await isAdmin())return reply({error:'Sign in to manage your projects.'},401);
 const [projects,albums]=await Promise.all([rest('projects?order=created,id'),rest('albums?order=sort,id')]);return reply({admin:true,projects:projects.map(publicProject),albums});
}catch(e){return failure(e);}}
export async function POST(req:Request){try{
 const b=await requestBody(req),admin=await isAdmin();
 if(b.action==='complete'){
  const id=identifier(b.id),a=(await rest(`albums?id=eq.${id}`))[0];if(!a)throw new AppError('Album not found.',404);
  if(!admin){const p=await projectById(identifier(b.token));if(!p||a.project_id!==p.id||!await canReview(p))throw new AppError('Your project session expired. Unlock the project again.',401);}
  if(!a.url)throw new AppError('This gallery is still being edited.');
  if(typeof b.complete!=='boolean'||!Number.isInteger(b.version))throw new AppError('Invalid completion update.');
  const reviewer=text(b.reviewer,100);if(!reviewer)throw new AppError('Enter your name before marking a selection.');
  const updated=await rest(`albums?id=eq.${id}&version=eq.${b.version}`,'PATCH',{complete:b.complete?1:0,reviewer,updated:new Date().toISOString(),version:b.version+1});
  if(!updated.length)throw new AppError('Someone just updated this album. Please refresh and try again.',409);return reply({ok:true});
 }
 if(!admin)throw new AppError('Please sign in as the manager.',401);
 if(b.action==='project'){
  const name=text(b.name);if(!name)throw new AppError('Enter a project name.');
  const fields:any={name,description:text(b.description,1000),instructions:text(b.instructions,3000)};
  if(b.password){try{fields.password_hash=await hashPassword(b.password);}catch(e){throw new AppError((e as Error).message);}fields.password_version=randomUUID();}
  if(b.id){const id=identifier(b.id);const result=await rest(`projects?id=eq.${id}`,'PATCH',fields);if(!result.length)throw new AppError('Project not found.',404);return reply({ok:true,id});}
  if(!fields.password_hash)throw new AppError('Assign a password before creating the project.');const id=randomUUID();await rest('projects','POST',{...fields,id});return reply({ok:true,id});
 }
 if(b.action==='album'){
  const title=text(b.title);if(!title)throw new AppError('Enter an album name.');
  let url;try{url=galleryUrl(text(b.url,2000));}catch(e){throw new AppError((e as Error).message);}
  const fields:any={section:text(b.section)||'Galleries',number:text(b.number,30),title,teacher:text(b.teacher),url};
  if(b.id){const id=identifier(b.id),old=(await rest(`albums?id=eq.${id}`))[0];if(!old)throw new AppError('Album not found.',404);fields.version=old.version+1;if(old.url!==url){fields.complete=0;fields.reviewer='';fields.updated=null;}const result=await rest(`albums?id=eq.${id}&version=eq.${old.version}`,'PATCH',fields);if(!result.length)throw new AppError('This album changed while you were editing. Reopen it and try again.',409);}
  else{const project_id=identifier(b.project_id);if(!await projectById(project_id))throw new AppError('Project not found.',404);const top=await rest(`albums?project_id=eq.${project_id}&order=sort.desc&limit=1&select=sort`);await rest('albums','POST',{...fields,id:randomUUID(),project_id,sort:(top[0]?.sort||0)+1});}
  return reply({ok:true});
 }
 if(b.action==='bulk'){
  const project_id=identifier(b.project_id);if(!await projectById(project_id))throw new AppError('Project not found.',404);const lines=text(b.lines,100000).split('\n').filter(s=>s.trim());if(!lines.length||lines.length>150)throw new AppError('Add between 1 and 150 lines.');const top=await rest(`albums?project_id=eq.${project_id}&order=sort.desc&limit=1&select=sort`);
  const rows=lines.map((line,i)=>{const [section,number,title,url='',teacher='']=line.split('|').map(s=>s.trim());if(!title)throw new AppError('Use Section | Number | Album name | Gallery link | Teacher on each line.');let link;try{link=galleryUrl(url);}catch{throw new AppError(`Invalid gallery link on line ${i+1}.`);}return {id:randomUUID(),project_id,section:text(section)||'Galleries',number:text(number,30),title:text(title),url:link,teacher:text(teacher),sort:(top[0]?.sort||0)+i+1};});await rest('albums','POST',rows);return reply({ok:true});
 }
 throw new AppError('Unknown action.');
}catch(e){return failure(e);}}
