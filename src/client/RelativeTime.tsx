import {useEffect,useState} from 'react'
import {relativeTime} from './relative-time.ts'
/** One clock per visible panel, shared by all its timestamp labels. */
export function useRelativeNow():number {
 const [now,setNow]=useState(()=>Date.now())
 useEffect(()=>{const timer=setInterval(()=>setNow(Date.now()),30000);return()=>clearInterval(timer)},[])
 return now
}
export function RelativeTime({timestamp,now}:{timestamp:number;now:number}):React.ReactNode{
 const value=relativeTime(timestamp,now)
 return <time data-relative-time={timestamp} dateTime={value.dateTime} title={value.title} aria-label={`${value.label}，${value.title}`}>{value.label}</time>
}
