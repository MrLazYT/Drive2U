import AsyncStorage from '@react-native-async-storage/async-storage';
import type {Point} from './types';

const key=(userId:string)=>`drive2u.recent.${userId.replace(/[^a-zA-Z0-9-]/g,'_')}`;
export async function loadRecent(userId:string):Promise<Point[]> {
  try {
    const value=await AsyncStorage.getItem(key(userId));
    const items=value?JSON.parse(value):[];
    return Array.isArray(items)?items.filter((p:Point)=>Number.isFinite(p.latitude)&&Number.isFinite(p.longitude)&&typeof p.address==='string').slice(0,8):[];
  }catch{return [];}
}
export async function saveRecent(userId:string,point:Point):Promise<Point[]> {
  const old=await loadRecent(userId);
  const items=[point,...old.filter(p=>p.latitude!==point.latitude||p.longitude!==point.longitude)].slice(0,8);
  await AsyncStorage.setItem(key(userId),JSON.stringify(items));
  return items;
}
export async function clearRecent(userId:string):Promise<void> {await AsyncStorage.removeItem(key(userId));}
