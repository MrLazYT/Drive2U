import React,{useCallback,useEffect,useRef,useState} from 'react';
import {ActivityIndicator,Alert,AppState,KeyboardAvoidingView,Linking,Platform,RefreshControl,ScrollView,Text,View} from 'react-native';
import {SafeAreaProvider,SafeAreaView} from 'react-native-safe-area-context';
import {StatusBar} from 'expo-status-bar';
import * as LocationService from 'expo-location';
import {HubConnectionBuilder,LogLevel} from '@microsoft/signalr';
import {Api,API_URL,errorMessage} from './src/api';
import {clearSession,loadSession,saveSession} from './src/session';
import {canCancel,money,nextStatus,statusText,terminal} from './src/domain';
import {Button,Card,colors,Field,Notice,styles} from './src/ui';
import {RideMap} from './src/RideMap';
import type {History,Location,Point,Quote,Ride,RoutingMode,Session} from './src/types';

type Tab='home'|'history'|'profile';
function AppContent(){
 const[session,setSession]=useState<Session|null>(null);const sessionRef=useRef<Session|null>(null);
 const[starting,setStarting]=useState(true);const[error,setError]=useState('');const[offline,setOffline]=useState(false);const[working,setWorking]=useState(false);const actionLock=useRef(false);
 const[tab,setTab]=useState<Tab>('home');const[active,setActive]=useState<Ride|null>(null);const[orders,setOrders]=useState<Ride[]>([]);const[history,setHistory]=useState<History>({items:[],page:1,pageSize:20,total:0});
 const[detail,setDetail]=useState<Ride|null>(null);const detailRef=useRef<Ride|null>(null);const[locations,setLocations]=useState<Location[]>([]);const[mode,setMode]=useState<RoutingMode>('Demo');const[realtime,setRealtime]=useState(false);const[refreshing,setRefreshing]=useState(false);
 const[pickup,setPickup]=useState<Point|null>(null);const[destination,setDestination]=useState<Point|null>(null);const[editing,setEditing]=useState<'pickup'|'destination'>('pickup');const[search,setSearch]=useState('');const[quote,setQuote]=useState<Quote|null>(null);const confirmationKey=useRef('');
 const[email,setEmail]=useState('');const[password,setPassword]=useState('');const[name,setName]=useState('');const[register,setRegister]=useState(false);const[reason,setReason]=useState('');const[now,setNow]=useState(Date.now());
 const invalidate=useCallback(()=>{sessionRef.current=null;setSession(null);setActive(null);setOrders([]);setDetail(null);detailRef.current=null;setQuote(null);setHistory({items:[],page:1,pageSize:20,total:0});void clearSession().catch(()=>{});},[]);
 const apiRef=useRef<Api|null>(null);if(!apiRef.current)apiRef.current=new Api(()=>sessionRef.current?.accessToken??null,invalidate);const api=apiRef.current;
 const installSession=useCallback(async(value:Session)=>{await saveSession(value);sessionRef.current=value;setSession(value);setPassword('');setTab('home');setError('');},[]);
 const refreshingLock=useRef(false);
 const refresh=useCallback(async(showSpinner=false)=>{
  if(!sessionRef.current||refreshingLock.current)return;refreshingLock.current=true;if(showSpinner)setRefreshing(true);
  const expected=sessionRef.current.accessToken;
  try{
   const user=await api.me();const[current,previous,list]=await Promise.all([api.active(),api.history(),user.role==='Driver'?api.orders():Promise.resolve([])]);
   if(sessionRef.current?.accessToken!==expected)return;
   const updated={...sessionRef.current,user};sessionRef.current=updated;setSession(updated);setActive(old=>old&&current&&old.id===current.id&&old.version>current.version?old:current);setHistory(previous);setOrders(list);setOffline(false);
   if(detailRef.current){const fresh=await api.ride(detailRef.current.id);if(sessionRef.current?.accessToken===expected){setDetail(fresh);detailRef.current=fresh;}}
  }catch(e){if(sessionRef.current?.accessToken===expected){setOffline(true);if(showSpinner)setError(errorMessage(e));}}
  finally{refreshingLock.current=false;setRefreshing(false);}
 },[api]);
 useEffect(()=>{let alive=true;void(async()=>{try{const stored=await loadSession();if(stored&&alive){sessionRef.current=stored;setSession(stored);}}catch{if(alive)setError('Не вдалося відкрити захищене сховище. Спробуйте перезапустити застосунок.');}finally{if(alive)setStarting(false);}})();return()=>{alive=false;};},[]);
 useEffect(()=>{if(!session?.accessToken)return;void refresh(true);void Promise.all([api.locations(),api.config()]).then(([places,config])=>{setLocations(places);setMode(config.routingMode);}).catch(e=>setError(errorMessage(e)));},[session?.accessToken,api,refresh]);
 useEffect(()=>{if(!session?.accessToken)return;const timer=setInterval(()=>{setNow(Date.now());if(Date.parse(sessionRef.current?.expiresAt??'')<=Date.now()){invalidate();setError('Термін сесії закінчився. Увійдіть знову.');}},1000);const poll=setInterval(()=>{if(AppState.currentState==='active')void refresh();},8000);const subscription=AppState.addEventListener('change',state=>{if(state==='active')void refresh(true);});return()=>{clearInterval(timer);clearInterval(poll);subscription.remove();};},[session?.accessToken,invalidate,refresh]);
 useEffect(()=>{
  if(!session?.accessToken)return;let disposed=false;let connecting=false;
  const connection=new HubConnectionBuilder().withUrl(API_URL+'/hubs/rides',{accessTokenFactory:()=>sessionRef.current?.accessToken??''}).configureLogging(LogLevel.None).withAutomaticReconnect([0,2000,5000,15000]).build();
  connection.on('RideChanged',()=>{void refresh();});connection.onreconnecting(()=>setRealtime(false));connection.onreconnected(()=>{setRealtime(true);void refresh(true);});connection.onclose(()=>{if(!disposed)setRealtime(false);});
  const connect=async()=>{if(disposed||connecting||connection.state!=='Disconnected')return;connecting=true;try{await connection.start();if(disposed)await connection.stop();else{setRealtime(true);void refresh();}}catch{if(!disposed)setRealtime(false);}finally{connecting=false;}};
  void connect();const timer=setInterval(()=>{if(AppState.currentState==='active')void connect();},15000);
  return()=>{disposed=true;clearInterval(timer);setRealtime(false);void connection.stop();};
 },[session?.accessToken,refresh]);
 async function action(work:()=>Promise<void>){if(actionLock.current)return;actionLock.current=true;setWorking(true);setError('');try{await work();setOffline(false);}catch(e){setError(errorMessage(e));await refresh();}finally{actionLock.current=false;setWorking(false);}}
 function choose(point:Point){if(editing==='pickup'){setPickup(point);setEditing('destination');}else setDestination(point);setQuote(null);confirmationKey.current='';setSearch('');}
 function openDetail(ride:Ride){setDetail(ride);detailRef.current=ride;setReason('');}
 const dismissDetail=()=>{setDetail(null);detailRef.current=null;};
 async function locate(){const permission=await LocationService.requestForegroundPermissionsAsync();if(permission.status!=='granted'){setError('Доступ до геолокації не надано. Виберіть місце зі списку або на мапі.');return;}const result=await LocationService.getCurrentPositionAsync({accuracy:LocationService.Accuracy.Balanced});choose({latitude:result.coords.latitude,longitude:result.coords.longitude,address:'Моє місцеперебування'});}
 const remaining=quote?Math.max(0,Math.ceil((Date.parse(quote.expiresAt)-now)/1000)):0;
 if(starting)return <View style={[styles.screen,{justifyContent:'center',alignItems:'center'}]}><ActivityIndicator size="large" color={colors.green}/><Text style={styles.text}>Відкриваємо Drive2U…</Text></View>;
 if(!session)return <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS==='ios'?'padding':'height'}><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={[styles.content,{flexGrow:1,justifyContent:'center'}]}>
  <Text style={{fontSize:39,fontWeight:'900',color:colors.green}}>Drive2U<Text style={{color:colors.ink}}>↗</Text></Text><Text style={styles.heading}>Львів. Ваша поїздка.</Text><Text style={styles.muted}>Зручна подача, погоджена ціна та актуальний стан поїздки.</Text>
  <Card><Text style={styles.title}>{register?'Новий пасажир':'Раді бачити вас'}</Text>{register&&<Field label="Ваше ім’я" value={name} onChangeText={setName} autoComplete="name"/>}<Field label="Електронна пошта" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoComplete="email"/><Field label="Пароль" value={password} onChangeText={setPassword} secureTextEntry autoComplete={register?'new-password':'current-password'}/>
   <Button title={register?'Зареєструватися':'Увійти'} disabled={working||!email.trim()||!password||(register&&!name.trim())} onPress={()=>action(async()=>installSession(await(register?api.register(name.trim(),email.trim(),password):api.login(email.trim(),password))))}/><Button secondary title={register?'Уже маєте обліковий запис? Увійти':'Створити обліковий запис пасажира'} onPress={()=>{setRegister(!register);setError('');}}/>
  </Card>{error&&<Notice text={error} error/>}<Notice text="Демонстрація: усі профілі й поїздки вигадані. Готівка — демонстрація, без списань."/>
 </ScrollView></KeyboardAvoidingView>;
 const user=session.user;
 function renderRideCard(ride:Ride,controls=true){
  const next=nextStatus(ride.status);return <>
   <Card><View style={styles.row}><Text style={[styles.title,{flex:1}]}>{statusText[ride.status]}</Text><Text style={styles.price}>{money(ride.amount)}</Text></View><Text style={styles.muted}>{new Date(ride.createdAt).toLocaleString('uk-UA')} · {ride.id.slice(0,8)}</Text>
    <Text style={styles.text}>● {ride.pickup.address}</Text><Text style={styles.text}>◆ {ride.destination.address}</Text><Text style={styles.muted}>{ride.route.distanceKm.toFixed(2)} км · ≈ {Math.ceil(ride.route.durationSeconds/60)} хв · Готівка — демонстрація</Text>
    {ride.route.isDemo&&<Notice text="Демонстраційний маршрут і час. Не використовувати для реальної навігації."/>}
    {ride.driver&&<View style={{gap:4}}><Text style={styles.title}>Ваш водій: {ride.driver.name}</Text>{ride.driver.vehicle&&<Text style={styles.text}>{ride.driver.vehicle.make} {ride.driver.vehicle.model} · {ride.driver.vehicle.plate}</Text>}</View>}
    {user.role==='Driver'&&ride.passenger&&<Text style={styles.text}>Пасажир: {ride.passenger.name}</Text>}
    {ride.cancellation&&<Notice text={`Скасовано: ${ride.cancellation.reason} · ${new Date(ride.cancellation.at).toLocaleString('uk-UA')}`}/>}
   </Card>
   <RideMap pickup={ride.pickup} destination={ride.destination} route={ride.route} locations={locations}/>
   {user.role==='Driver'&&<View style={styles.row}><View style={{flex:1}}><Button secondary title="Навігація до подачі" onPress={()=>action(async()=>{await Linking.openURL(`geo:${ride.pickup.latitude},${ride.pickup.longitude}?q=${ride.pickup.latitude},${ride.pickup.longitude}`);})}/></View><View style={{flex:1}}><Button secondary title="До призначення" onPress={()=>action(async()=>{await Linking.openURL(`geo:${ride.destination.latitude},${ride.destination.longitude}?q=${ride.destination.latitude},${ride.destination.longitude}`);})}/></View></View>}
   {controls&&!terminal(ride)&&<Card>
    {user.role==='Driver'&&next&&<Button title={next.label} disabled={working} onPress={()=>action(async()=>{await api.status(ride.id,next.status);await refresh(true);})}/>}
    {canCancel(ride,user)&&<><Field label={user.role==='Driver'?'Причина скасування (обов’язкова)':'Причина скасування (необов’язкова)'} value={reason} onChangeText={setReason} maxLength={300}/><Button danger title="Скасувати поїздку" disabled={working||(user.role==='Driver'&&!reason.trim())} onPress={()=>{Alert.alert('Скасувати поїздку?','Цю дію неможливо скасувати.',[{text:'Залишити',style:'cancel'},{text:'Скасувати поїздку',style:'destructive',onPress:()=>void action(async()=>{await api.cancel(ride.id,reason.trim()||'Пасажир скасував замовлення');setReason('');await refresh(true);})}]);}}/></>}
   </Card>}
  </>;
 }
 return <View style={styles.screen}><View style={{paddingHorizontal:20,paddingVertical:12,flexDirection:'row',justifyContent:'space-between',alignItems:'center'}}><Text style={{fontSize:26,fontWeight:'900',color:colors.green}}>Drive2U↗</Text><Text style={styles.muted}>{user.role==='Driver'?'Водій':'Пасажир'} · Львів</Text></View>
 <KeyboardAvoidingView style={{flex:1}} behavior={Platform.OS==='ios'?'padding':'height'}><ScrollView keyboardShouldPersistTaps="handled" refreshControl={<RefreshControl refreshing={refreshing} onRefresh={()=>void refresh(true)} tintColor={colors.green}/>} contentContainerStyle={styles.content}>
  {offline&&<Notice error text="Немає підтвердженого зв’язку. Показано останній збережений стан; потягніть вниз для оновлення."/>}{error&&<Notice text={error} error/>}
  <Text style={styles.muted}>{realtime?'● Оновлення наживо':'◌ Резервне оновлення кожні 8 с'}</Text>
  {detail?<><Button secondary title="← Назад" onPress={dismissDetail}/>{renderRideCard(detail,false)}</>:tab==='profile'?<>
   <Text style={styles.heading}>Ваш профіль</Text><Card><Text style={styles.title}>{user.name}</Text><Text style={styles.text}>{user.email}</Text><Text style={styles.muted}>{user.role==='Driver'?'Допущений водій':'Пасажир'}</Text>{user.driverProfile&&<>{user.driverProfile.vehicle&&<><Text style={styles.text}>{user.driverProfile.vehicle.make} {user.driverProfile.vehicle.model}</Text><Text style={styles.title}>{user.driverProfile.vehicle.plate}</Text></>}<Notice text={user.driverProfile.approved?'Профіль водія допущений':'Профіль очікує допуску'}/></>}<Text style={styles.muted}>Сесія до {new Date(session.expiresAt).toLocaleString('uk-UA')}</Text></Card>
   <Button danger title="Вийти з облікового запису" disabled={working} onPress={()=>action(async()=>{await api.logout();await clearSession();invalidate();})}/><Text style={styles.muted}>Поїздка збережена на сервері й залишиться після повторного входу. Для зміни ролі увійдіть іншим обліковим записом.</Text>
  </>:tab==='history'?<>
   <Text style={styles.heading}>Історія поїздок</Text>{history.items.length===0?<Card><Text style={styles.title}>Ще немає завершених поїздок</Text><Text style={styles.muted}>Ваші завершені та скасовані поїздки з’являться тут.</Text></Card>:history.items.map(ride=><Card key={ride.id}><Text style={styles.title}>{statusText[ride.status]} · {money(ride.amount)}</Text><Text style={styles.muted}>{ride.pickup.address} → {ride.destination.address}</Text><Text style={styles.muted}>{new Date(ride.createdAt).toLocaleString('uk-UA')}</Text><Button secondary title="Деталі поїздки" onPress={()=>action(async()=>openDetail(await api.ride(ride.id)))}/></Card>)}
   {history.items.length<history.total&&<Button secondary title="Завантажити ще" disabled={working} onPress={()=>action(async()=>{const more=await api.history(history.page+1);setHistory({...more,items:[...history.items,...more.items]});})}/>}
  </>:active?<><Text style={styles.heading}>Ваша поїздка</Text>{renderRideCard(active)}</>:user.role==='Driver'?<>
   <Text style={styles.heading}>Вітаємо, {user.name.split(' ')[0]}</Text><Card><Text style={styles.title}>{user.driverProfile?.available?'Ви на лінії':'Ви не на лінії'}</Text>{user.driverProfile?.vehicle&&<Text style={styles.muted}>{user.driverProfile.vehicle.make} {user.driverProfile.vehicle.model} · {user.driverProfile.vehicle.plate}</Text>}<Button title={user.driverProfile?.available?'Завершити роботу на лінії':'Вийти на лінію'} disabled={working||!user.driverProfile?.approved||!user.driverProfile.vehicle} onPress={()=>action(async()=>{const updated=await api.availability(!user.driverProfile?.available);const value={...session,user:updated};sessionRef.current=value;setSession(value);await refresh(true);})}/></Card>
   <Text style={styles.title}>Доступні замовлення</Text>{orders.length===0?<Notice text={user.driverProfile?.available?'Поки немає замовлень. Список оновлюється автоматично.':'Увімкніть доступність, щоб побачити очікувані замовлення.'}/>:orders.map(order=><Card key={order.id}><Text style={styles.title}>{money(order.amount)} · {order.route.distanceKm.toFixed(2)} км</Text><Text style={styles.text}>● {order.pickup.address}</Text><Text style={styles.text}>◆ {order.destination.address}</Text><Text style={styles.muted}>{order.route.isDemo?'Демонстраційна поїздка · ':''}Готівка — демонстрація</Text><Button title="Прийняти замовлення" disabled={working} onPress={()=>action(async()=>{await api.accept(order.id);setReason('');await refresh(true);})}/></Card>)}
  </>:<>
   <Text style={styles.heading}>Куди поїдемо?</Text><Text style={styles.muted}>Виберіть точки на мапі або місця зі списку. Ціну та дорожню відстань визначить сервер.</Text>
   <View style={styles.row}><View style={{flex:1}}><Button title={mode==='Demo'?'✓ Демомаршрути':'Демомаршрути'} secondary={mode!=='Demo'} onPress={()=>{setMode('Demo');setQuote(null);}}/></View><View style={{flex:1}}><Button title={mode==='Live'?'✓ Живий маршрут':'Живий маршрут'} secondary={mode!=='Live'} onPress={()=>{setMode('Live');setQuote(null);}}/></View></View>
   <Notice text={mode==='Demo'?'Демонстраційний режим: лише маршрути між відомими місцями Львова. Дані синтетичні, не для реальних поїздок.':'Живий режим: сервер звернеться до налаштованого дорожнього провайдера. При недоступності замовлення не створюється.'}/>
   <RideMap pickup={pickup} destination={destination} route={quote?.route} locations={locations} onPick={coordinate=>choose({...coordinate,address:`Точка на мапі (${coordinate.latitude.toFixed(4)}, ${coordinate.longitude.toFixed(4)})`})}/>
   <Card><Button secondary title={`● Подача: ${pickup?.address??'вибрати'}`} onPress={()=>setEditing('pickup')}/><Button secondary title={`◆ Призначення: ${destination?.address??'вибрати'}`} onPress={()=>setEditing('destination')}/><Text style={styles.label}>Зараз вибираємо: {editing==='pickup'?'точку подачі':'призначення'}</Text><Button secondary title="Використати моє місцеперебування" disabled={working} onPress={()=>action(locate)}/><Field label="Знайти серед відомих місць Львова" value={search} onChangeText={setSearch} placeholder="Наприклад: вокзал"/>
    {locations.filter(place=>place.name.toLocaleLowerCase('uk').includes(search.toLocaleLowerCase('uk'))).map(place=><Button key={place.id} secondary title={place.name} onPress={()=>choose({latitude:place.latitude,longitude:place.longitude,address:place.name,locationId:place.id})}/>)}
    {locations.length===0&&<Button secondary title="Завантажити місця" onPress={()=>action(async()=>setLocations(await api.locations()))}/>}
   </Card>
   <Button title={quote?'Перерахувати маршрут':'Розрахувати маршрут і ціну'} disabled={working||!pickup||!destination||offline} onPress={()=>action(async()=>{const value=await api.quote(pickup!,destination!,mode);setQuote(value);confirmationKey.current=`${value.id}-${Date.now()}-${Math.random().toString(36).slice(2)}`;setNow(Date.now());})}/>
   {quote&&<Card><Text style={styles.title}>Ваша пропозиція</Text><Text style={styles.price}>{money(quote.amount)}</Text><Text style={styles.text}>{quote.route.distanceKm.toFixed(2)} км · ≈ {Math.ceil(quote.route.durationSeconds/60)} хв</Text><Text style={styles.muted}>Готівка — демонстрація · {remaining>0?`Чинна ще ${remaining} с`:'Строк дії закінчився — перерахуйте'}</Text><Button title="Підтвердити замовлення" disabled={working||remaining===0||offline} onPress={()=>action(async()=>{await api.confirm(quote.id,confirmationKey.current);setQuote(null);await refresh(true);})}/></Card>}
  </>}
 </ScrollView></KeyboardAvoidingView>
 <View style={{flexDirection:'row',paddingHorizontal:16,paddingTop:10,paddingBottom:8,gap:8,borderTopWidth:1,borderColor:colors.border,backgroundColor:'#fff'}}>{([{id:'home',label:user.role==='Driver'?'Замовлення':'Поїздка'},{id:'history',label:'Історія'},{id:'profile',label:'Профіль'}] as const).map(item=><View key={item.id} style={{flex:1}}><Button title={item.label} secondary={tab!==item.id} onPress={()=>{dismissDetail();setTab(item.id);setError('');}}/></View>)}</View>
 </View>;
}
export default function App(){return <SafeAreaProvider><SafeAreaView style={styles.screen}><StatusBar style="dark"/><AppContent/></SafeAreaView></SafeAreaProvider>;}
