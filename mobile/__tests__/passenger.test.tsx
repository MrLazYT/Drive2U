import React from 'react';
import {cleanup,fireEvent,render,waitFor} from '@testing-library/react-native';
import {PassengerHome,validPair} from '../src/PassengerHome';
import {Api} from '../src/api';
import {searchAddresses} from '../src/geocoding';
import {loadRecent,saveRecent} from '../src/recent';

jest.mock('@react-native-async-storage/async-storage',()=>({__esModule:true,default:{getItem:jest.fn(),setItem:jest.fn(),removeItem:jest.fn()}}));
jest.mock('expo-location',()=>({requestForegroundPermissionsAsync:jest.fn().mockResolvedValue({status:'denied'}),getCurrentPositionAsync:jest.fn(),Accuracy:{Balanced:3}}));
jest.mock('../src/geocoding',()=>({searchAddresses:jest.fn(),reverseAddress:jest.fn()}));
jest.mock('react-native-webview',()=>{const React=require('react');const {View}=require('react-native');return {WebView:(props:unknown)=>React.createElement(View,{testID:'map',...(props as object)})};});
const station={latitude:49.84085,longitude:23.99436,address:'Головний залізничний вокзал'};
const opera={latitude:49.84405,longitude:24.02626,address:'Львівська опера'};
const quote={id:'q',pickup:station,destination:opera,amount:181.01,currency:'UAH' as const,expiresAt:new Date(Date.now()+180000).toISOString(),route:{distanceKm:3.1194,durationSeconds:660,geometry:[station,opera],isDemo:false,attribution:'OSRM'}};
beforeEach(()=>{(searchAddresses as jest.Mock).mockImplementation(async(q:string)=>q.includes('вок')?[station]:[opera]);});
afterEach(async()=>{await cleanup();});
test('only valid distinct points enable a server quote and confirm once',async()=>{
 const api={quote:jest.fn().mockResolvedValue(quote),confirm:jest.fn().mockResolvedValue({})} as unknown as Api;
 const ui=await render(<PassengerHome api={api} userId="p" onProfile={jest.fn()} onOrdered={jest.fn().mockResolvedValue(undefined)}/>);
 expect(()=>ui.getByRole('button',{name:'Розрахувати'})).toThrow();
 for(const [field,query,address] of [['Звідки','вокзал',station.address],['Куди','опера',opera.address]]){
  await fireEvent.press(ui.getByRole('button',{name:field}));await fireEvent.changeText(ui.getByLabelText('Пошук адреси'),query);
  await waitFor(()=>expect(ui.getByRole('button',{name:address})).toBeTruthy());
  await fireEvent.press(ui.getByRole('button',{name:address}));
 }
 await fireEvent.press(ui.getByRole('button',{name:'Розрахувати'}));
 await waitFor(()=>expect(api.quote).toHaveBeenCalledWith(station,opera,'Live'));
 expect(ui.getByText('181.01 ₴')).toBeTruthy();
 expect(()=>ui.getByRole('button',{name:'Розрахувати'})).toThrow();
 expect(()=>ui.getByText('Вартість поїздки')).toThrow();
 expect(ui.getByText('Оплата готівкою')).toBeTruthy();
 expect(ui.getByRole('link',{name:'Атрибуція мапи та маршруту'})).toBeTruthy();
 expect(ui.getByText(/OpenStreetMap contributors.*OSRM/)).toBeTruthy();
 expect(ui.getByText(station.address).props.numberOfLines).toBe(1);
 expect(ui.getByText(opera.address).props.numberOfLines).toBe(1);
 await fireEvent(ui.getByTestId('route-top-panel'),'onLayout',{nativeEvent:{layout:{height:120}}});
 await fireEvent(ui.getByTestId('route-result-panel'),'onLayout',{nativeEvent:{layout:{height:150}}});
 await waitFor(()=>expect(ui.getByTestId('map').props.source.html).toContain('"top":142,"bottom":182'));
 await fireEvent.press(ui.getByRole('button',{name:'Замовити'}));
 await waitFor(()=>expect(api.confirm).toHaveBeenCalledTimes(1));
},15000);
test('editing either endpoint discards the old quote and orders only the recalculated route',async()=>{
 const newPickup={latitude:49.85,longitude:24.01,address:'Нова адреса подачі'};
 const newDestination={latitude:49.86,longitude:24.04,address:'Інша адреса призначення'};
 (searchAddresses as jest.Mock).mockImplementation(async(q:string)=>q.includes('нов')?[newPickup]:q.includes('інш')?[newDestination]:q.includes('вок')?[station]:[opera]);
 let sequence=0;
 const api={quote:jest.fn().mockImplementation(async(a:typeof station,b:typeof opera)=>({...quote,id:`q${++sequence}`,pickup:a,destination:b,amount:181+sequence})),confirm:jest.fn().mockResolvedValue({})} as unknown as Api;
 const ui=await render(<PassengerHome api={api} userId="p" onProfile={jest.fn()} onOrdered={jest.fn().mockResolvedValue(undefined)}/>);
 async function choose(field:string,query:string,address:string){
  await fireEvent.press(ui.getByRole('button',{name:field}));
  await fireEvent.changeText(ui.getByLabelText('Пошук адреси'),query);
  await waitFor(()=>expect(ui.getByRole('button',{name:address})).toBeTruthy());
  await fireEvent.press(ui.getByRole('button',{name:address}));
 }
 await choose('Звідки','вокзал',station.address);await choose('Куди','опера',opera.address);
 await fireEvent.press(ui.getByRole('button',{name:'Розрахувати'}));
 await waitFor(()=>expect(ui.getByText('182.00 ₴')).toBeTruthy());
 await choose('Звідки','нова',newPickup.address);
 expect(()=>ui.getByRole('button',{name:'Замовити'})).toThrow();
 expect(()=>ui.getByText('182.00 ₴')).toThrow();
 await fireEvent.press(ui.getByRole('button',{name:'Розрахувати'}));
 await waitFor(()=>expect(ui.getByText('183.00 ₴')).toBeTruthy());
 await choose('Куди','інша',newDestination.address);
 expect(()=>ui.getByRole('button',{name:'Замовити'})).toThrow();
 await fireEvent.press(ui.getByRole('button',{name:'Розрахувати'}));
 await waitFor(()=>expect(ui.getByText('184.00 ₴')).toBeTruthy());
 await fireEvent.press(ui.getByRole('button',{name:'Замовити'}));
 await waitFor(()=>expect(api.confirm).toHaveBeenCalledWith('q3',expect.any(String)));
 expect(api.quote).toHaveBeenNthCalledWith(3,newPickup,newDestination,'Live');
},20000);
test('recent addresses are isolated per account and can be cleared',async()=>{
 const storage=require('@react-native-async-storage/async-storage').default;const data=new Map<string,string>();
 storage.getItem.mockImplementation(async(k:string)=>data.get(k)??null);
 storage.setItem.mockImplementation(async(k:string,v:string)=>{data.set(k,v);});
 storage.removeItem.mockImplementation(async(k:string)=>{data.delete(k);});
 await saveRecent('a',station);await saveRecent('b',opera);
 expect(await loadRecent('a')).toEqual([station]);expect(await loadRecent('b')).toEqual([opera]);
 const {clearRecent}=require('../src/recent');await clearRecent('a');
 expect(await loadRecent('a')).toEqual([]);expect(await loadRecent('b')).toEqual([opera]);
});
test('invalid or identical points cannot be priced',()=>{
 expect(validPair(null,opera)).toBe(false);expect(validPair(station,station)).toBe(false);
 expect(validPair(station,opera)).toBe(true);
});
test('an older geocoder response cannot replace newer suggestions',async()=>{
 let finishFirst!:(value:typeof station[])=>void;
 (searchAddresses as jest.Mock).mockImplementationOnce(()=>new Promise(resolve=>{finishFirst=resolve;})).mockResolvedValueOnce([opera]);
 const ui=await render(<PassengerHome api={{} as Api} userId="p" onProfile={jest.fn()} onOrdered={jest.fn()}/>);
 await fireEvent.press(ui.getByRole('button',{name:'Звідки'}));
 await fireEvent.changeText(ui.getByLabelText('Пошук адреси'),'вокзал');
 await waitFor(()=>expect(searchAddresses).toHaveBeenCalledTimes(1));
 await fireEvent.changeText(ui.getByLabelText('Пошук адреси'),'опера');
 await waitFor(()=>expect(ui.getByRole('button',{name:opera.address})).toBeTruthy());
 finishFirst([station]);
 await waitFor(()=>expect(ui.getByRole('button',{name:opera.address})).toBeTruthy());
 expect(()=>ui.getByRole('button',{name:station.address})).toThrow();
});
test('route failure displays retry without inventing a price',async()=>{
 const api={quote:jest.fn().mockRejectedValue(new Error('offline'))} as unknown as Api;
 const ui=await render(<PassengerHome api={api} userId="p" onProfile={jest.fn()} onOrdered={jest.fn()}/>);
 for(const [field,query,address] of [['Звідки','вокзал',station.address],['Куди','опера',opera.address]]){
  await fireEvent.press(ui.getByRole('button',{name:field}));await fireEvent.changeText(ui.getByLabelText('Пошук адреси'),query);
  await waitFor(()=>expect(ui.getByRole('button',{name:address})).toBeTruthy());await fireEvent.press(ui.getByRole('button',{name:address}));
 }
 await fireEvent.press(ui.getByRole('button',{name:'Розрахувати'}));
 await waitFor(()=>expect(ui.getByRole('button',{name:'Повторити'})).toBeTruthy());
 expect(()=>ui.getByText('181.01 ₴')).toThrow();
});
test('denied location permission keeps manual address search usable',async()=>{
 const ui=await render(<PassengerHome api={{} as Api} userId="p" onProfile={jest.fn()} onOrdered={jest.fn()}/>);
 await fireEvent.press(ui.getByRole('button',{name:'Звідки'}));
 await fireEvent.press(ui.getByRole('button',{name:'Моє місцеперебування'}));
 await waitFor(()=>expect(ui.getByText(/Виберіть адресу вручну/)).toBeTruthy());
 expect(ui.getByLabelText('Пошук адреси')).toBeTruthy();
});
