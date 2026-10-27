import type {Point} from './types';

const root=(process.env.EXPO_PUBLIC_PHOTON_URL || 'https://photon.komoot.io').replace(/\/$/,'');
type Feature={geometry:{coordinates:number[]};properties:Record<string,string|number|undefined>};

function point(feature:Feature):Point|null {
  const [longitude,latitude]=feature.geometry?.coordinates??[];
  if(!Number.isFinite(latitude)||!Number.isFinite(longitude))return null;
  const p=feature.properties;
  const address=[p.name,p.street,p.housenumber,p.city||p.locality,p.state,p.country]
    .filter((value,index,items)=>value&&items.indexOf(value)===index).join(', ');
  return address?{latitude,longitude,address:address.slice(0,200)}:null;
}
async function read(url:string,signal?:AbortSignal):Promise<Point[]> {
  const response=await fetch(url,{signal,headers:{Accept:'application/json'}});
  if(!response.ok)throw new Error('GEOCODER_UNAVAILABLE');
  const data=await response.json() as {features?:Feature[]};
  if(!Array.isArray(data.features))throw new Error('GEOCODER_UNAVAILABLE');
  return data.features.map(point).filter((item):item is Point=>!!item);
}
export function searchAddresses(query:string,signal?:AbortSignal):Promise<Point[]> {
  return read(`${root}/api/?q=${encodeURIComponent(query.trim())}&limit=8&lat=49.84&lon=24.03`,signal);
}
export async function reverseAddress(latitude:number,longitude:number,signal?:AbortSignal):Promise<Point|null> {
  const results=await read(`${root}/reverse?lat=${latitude}&lon=${longitude}&limit=1`,signal);
  return results[0]??null;
}
