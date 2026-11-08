"use client";
import {useEffect,useRef,useState} from 'react';
import {usePathname,useSearchParams} from 'next/navigation';
import {analyticsArea,analyticsSurface} from '@/lib/product-analytics-schema';
import './product-analytics.css';
import {initializeProductAnalytics,trackProductEvent} from '@/lib/product-analytics-client';
export function ProductAnalytics(){const pathname=usePathname(),query=useSearchParams();const area=analyticsArea(pathname),surface=analyticsSurface(query);
 const [sandbox,setSandbox]=useState(false);const lastView=useRef('');
 useEffect(()=>initializeProductAnalytics(()=>setSandbox(true)),[]);
 useEffect(()=>{const key=`${area}:${surface}`;if(lastView.current===key)return;lastView.current=key;trackProductEvent('page_view',{area,surface});},[area,surface]);
 useEffect(()=>{const error=()=>trackProductEvent('ui_error',{error_code:'unhandled_error'});const rejection=()=>trackProductEvent('ui_error',{error_code:'unhandled_rejection'});window.addEventListener('error',error);window.addEventListener('unhandledrejection',rejection);return()=>{window.removeEventListener('error',error);window.removeEventListener('unhandledrejection',rejection);};},[]);return sandbox?<aside className="product-analytics-sandbox" aria-label="Local analytics sandbox"><details><summary>Local sandbox <span aria-hidden="true">⌃</span></summary><div><strong>Fixture admin · Local events</strong><p>Records clicks in this preview, including automated walkthroughs. No production traffic or provider work.</p><a href="/overview?view=demo">Open content demo ↗</a><a href="/patches?view=demo">Open repair demo ↗</a></div></details><a href="/analytics?includeDemo=true&live=true">Inspect events ↗</a></aside>:null;}
