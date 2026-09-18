import Hub from '@/app/hub';
export default async function Review({params}:{params:Promise<{id:string}>}){const {id}=await params;return <Hub reviewId={id}/>;}
