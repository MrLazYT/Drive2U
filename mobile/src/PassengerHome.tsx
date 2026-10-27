import React,{useEffect,useRef,useState} from 'react';
import {ActivityIndicator,Keyboard,Pressable,ScrollView,Text,TextInput,View} from 'react-native';
import * as LocationService from 'expo-location';
import {Api,errorMessage} from './api';
import {searchAddresses,reverseAddress} from './geocoding';
import {loadRecent,saveRecent} from './recent';
import {RideMap} from './RideMap';
import {Button,colors,styles} from './ui';
import {money} from './domain';
import type {Point,Quote} from './types';

export const validPair=(a:Point|null,b:Point|null)=>!!a&&!!b&&
  Number.isFinite(a.latitude)&&Number.isFinite(a.longitude)&&Number.isFinite(b.latitude)&&Number.isFinite(b.longitude)&&
  Math.abs(a.latitude-b.latitude)+Math.abs(a.longitude-b.longitude)>0.0002;

export function PassengerHome({api,userId,onProfile,onOrdered}:{api:Api;userId:string;onProfile:()=>void;onOrdered:()=>Promise<void>}) {
  const[pickup,setPickup]=useState<Point|null>(null),[destination,setDestination]=useState<Point|null>(null);
  const[screen,setScreen]=useState<'map'|'search'|'pick'>('map');
  const[editing,setEditing]=useState<'pickup'|'destination'>('pickup');
  const[query,setQuery]=useState(''),[results,setResults]=useState<Point[]>([]),[recent,setRecent]=useState<Point[]>([]);
  const[searching,setSearching]=useState(false),[searchError,setSearchError]=useState('');
  const[error,setError]=useState(''),[quote,setQuote]=useState<Quote|null>(null),[busy,setBusy]=useState(false);
  const[now,setNow]=useState(Date.now());
  const lock=useRef(false),request=useRef(0),confirmKey=useRef('');
  useEffect(()=>{let alive=true;void loadRecent(userId).then(items=>{if(alive)setRecent(items);});return()=>{alive=false;};},[userId]);
  useEffect(()=>{const timer=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(timer);},[]);
  useEffect(()=>{
    if(screen!=='search'||query.trim().length<2){request.current++;setResults([]);setSearching(false);setSearchError('');return;}
    const id=++request.current;const controller=new AbortController();setResults([]);setSearching(true);setSearchError('');
    const timer=setTimeout(()=>{void searchAddresses(query,controller.signal).then(items=>{if(request.current===id)setResults(items);}).catch(e=>{if(request.current===id&&e?.name!=='AbortError')setSearchError('Пошук адрес недоступний. Спробуйте ще раз.');}).finally(()=>{if(request.current===id)setSearching(false);});},350);
    return()=>{clearTimeout(timer);controller.abort();};
  },[query,screen]);
  function open(which:'pickup'|'destination'){setEditing(which);setQuery('');setResults([]);setSearchError('');setScreen('search');}
  async function select(point:Point){
    if(editing==='pickup')setPickup(point);else setDestination(point);
    setQuote(null);setError('');setScreen('map');Keyboard.dismiss();
    try{setRecent(await saveRecent(userId,point));}catch{/* Address remains selected if local storage fails. */}
  }
  async function locate(){
    if(lock.current)return;lock.current=true;setBusy(true);setSearchError('');
    try{
      const permission=await LocationService.requestForegroundPermissionsAsync();
      if(permission.status!=='granted'){setSearchError('Доступ до місцеперебування не надано. Виберіть адресу вручну.');return;}
      const position=await LocationService.getCurrentPositionAsync({accuracy:LocationService.Accuracy.Balanced});
      let address:Point|null=null;
      try{address=await reverseAddress(position.coords.latitude,position.coords.longitude);}catch{/* Coordinates remain usable. */}
      await select({latitude:position.coords.latitude,longitude:position.coords.longitude,address:address?.address??'Моє місцеперебування'});
    }catch{setSearchError('Не вдалося визначити місцеперебування. Виберіть адресу вручну.');}
    finally{lock.current=false;setBusy(false);}
  }
  async function calculate(){
    if(lock.current||!validPair(pickup,destination))return;lock.current=true;setBusy(true);setError('');setQuote(null);
    try{const value=await api.quote(pickup!,destination!,'Live');setQuote(value);confirmKey.current=`${value.id}-${Date.now()}-${Math.random().toString(36).slice(2)}`;}
    catch(e){setError(errorMessage(e));}finally{lock.current=false;setBusy(false);}
  }
  async function order(){
    if(lock.current||!quote)return;lock.current=true;setBusy(true);setError('');
    try{await api.confirm(quote.id,confirmKey.current);setQuote(null);await onOrdered();}
    catch(e){setError(errorMessage(e));}finally{lock.current=false;setBusy(false);}
  }
  if(screen==='search')return <View style={[styles.screen,{padding:18,gap:14}]}>
    <Button secondary title="← Назад" onPress={()=>{request.current++;setScreen('map');}}/>
    <Text style={styles.heading}>{editing==='pickup'?'Звідки':'Куди'}</Text>
    <View style={{flexDirection:'row',gap:8}}><TextInput autoFocus accessibilityLabel="Пошук адреси" placeholder="Введіть адресу" placeholderTextColor={colors.muted} value={query} onChangeText={setQuery} style={[styles.input,{flex:1}]}/><Button secondary title="Очистити" onPress={()=>setQuery('')}/></View>
    {editing==='pickup'&&<Button secondary title="Моє місцеперебування" disabled={busy} onPress={locate}/>}
    <Button secondary title="Обрати на мапі" onPress={()=>{request.current++;setScreen('pick');Keyboard.dismiss();}}/>
    {searching&&<ActivityIndicator color={colors.green}/>}
    {!!searchError&&<Text accessibilityRole="alert" style={{color:colors.danger}}>{searchError}</Text>}
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{gap:8,paddingBottom:24}}>
      {!query.trim()&&<Text style={styles.label}>Нещодавні адреси</Text>}
      {!query.trim()&&recent.length===0&&<Text style={styles.muted}>Нещодавніх адрес немає.</Text>}
      {!!query.trim()&&!searching&&!searchError&&results.length===0&&query.trim().length>=2&&<Text style={styles.muted}>Адрес не знайдено.</Text>}
      {(query.trim()?results:recent).map((item,index)=><Pressable key={`${item.latitude}-${item.longitude}-${index}`} accessibilityRole="button" accessibilityLabel={item.address} onPress={()=>void select(item)} style={styles.card}><Text style={styles.text}>{item.address}</Text></Pressable>)}
    </ScrollView>
    <Text style={styles.muted}>Адреси: Photon · © OpenStreetMap contributors</Text>
  </View>;
  if(screen==='pick')return <View style={{flex:1}}><RideMap fullScreen pickup={pickup} destination={destination} locations={[]} onPick={coordinate=>void select({...coordinate,address:`Точка на мапі (${coordinate.latitude.toFixed(5)}, ${coordinate.longitude.toFixed(5)})`})}/><View style={{position:'absolute',top:16,left:16,right:16}}><Button secondary title="← Назад до пошуку" onPress={()=>setScreen('search')}/></View></View>;
  return <View style={{flex:1}}>
    <RideMap fullScreen pickup={pickup} destination={destination} route={quote?.route} locations={[]}/>
    <View style={{position:'absolute',top:14,left:16,right:16,gap:10}}>
      <View style={{flexDirection:'row',justifyContent:'space-between',alignItems:'center'}}><Text style={{fontSize:27,fontWeight:'900',color:colors.green}}>Drive2U↗</Text><Button secondary title="Профіль" onPress={onProfile}/></View>
      <View style={styles.card}>
        <Pressable accessibilityRole="button" accessibilityLabel="Звідки" onPress={()=>open('pickup')}><Text style={styles.label}>Звідки</Text><Text numberOfLines={1} style={styles.text}>{pickup?.address??'Оберіть адресу'}</Text></Pressable>
        <View style={{height:1,backgroundColor:colors.border}}/>
        <Pressable accessibilityRole="button" accessibilityLabel="Куди" onPress={()=>open('destination')}><Text style={styles.label}>Куди</Text><Text numberOfLines={1} style={styles.text}>{destination?.address??'Оберіть адресу'}</Text></Pressable>
        {validPair(pickup,destination)&&<Button title={busy?'Розраховуємо…':'Розрахувати'} disabled={busy} onPress={calculate}/>}
      </View>
      {!!error&&<View style={styles.card}><Text accessibilityRole="alert" style={{color:colors.danger}}>{error}</Text><Button secondary title="Повторити" disabled={busy} onPress={calculate}/></View>}
    </View>
    {quote&&<View style={{position:'absolute',bottom:0,left:0,right:0,backgroundColor:'#fff',borderTopLeftRadius:24,borderTopRightRadius:24,padding:20,gap:8}}>
      <Text style={styles.label}>Вартість поїздки</Text><Text style={styles.price}>{money(quote.amount)}</Text>
      <Text style={styles.text}>{quote.route.distanceKm.toFixed(2)} км · ≈ {Math.ceil(quote.route.durationSeconds/60)} хв</Text>
      <Text style={styles.muted}>Оплата готівкою · {quote.route.attribution}</Text>
      <Button title="Замовити" disabled={busy||Date.parse(quote.expiresAt)<=now} onPress={order}/>
    </View>}
  </View>;
}
