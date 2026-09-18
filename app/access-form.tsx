'use client';
import {useState} from 'react';
import {LockKeyhole} from 'lucide-react';
import {Input} from '@/components/ui/input';
import {Button} from '@/components/ui/button';
export default function AccessForm({reviewId,onSuccess}:{reviewId?:string;onSuccess:()=>Promise<void>}){
 const [email,setEmail]=useState(''),[password,setPassword]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 async function submit(e:React.FormEvent){e.preventDefault();setBusy(true);setError('');try{const r=await fetch('/api/auth',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(reviewId?{action:'unlock',project_id:reviewId,password}:{action:'login',email,password})});const result=await r.json();if(!r.ok)throw Error(result.error);setPassword('');await onSuccess();}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 return <section className="access-card"><LockKeyhole size={26}/><h2>{reviewId?'Your photos are waiting':'Manager sign-in'}</h2><p>{reviewId?'Enter the project password Natalia shared with you.':'Sign in with your management email and password.'}</p><form onSubmit={submit}>{!reviewId&&<label>Email<Input required type="email" autoComplete="username" value={email} onChange={e=>setEmail(e.target.value)}/></label>}<label>{reviewId?'Project password':'Password'}<Input required type="password" autoComplete={reviewId?'off':'current-password'} maxLength={reviewId?128:256} value={password} onChange={e=>setPassword(e.target.value)}/></label>{error&&<p className="error" role="alert">{error}</p>}<Button type="submit" disabled={busy}>{busy?'Opening…':reviewId?'Open project':'Sign in'}</Button></form><p className="muted">{reviewId?'No account needed.':'Reviewers: open the project link shared with you.'}</p></section>;
}
