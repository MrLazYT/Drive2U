import React from 'react';
import {cleanup, fireEvent, render, waitFor} from '@testing-library/react-native';
import App from '../App';
import {Api,ApiError} from '../src/api';

jest.mock('expo-secure-store',()=>({
  WHEN_UNLOCKED_THIS_DEVICE_ONLY:1,
  getItemAsync:jest.fn().mockResolvedValue(null),
  setItemAsync:jest.fn().mockResolvedValue(undefined),
  deleteItemAsync:jest.fn().mockResolvedValue(undefined),
}));
jest.mock('expo-location',()=>({requestForegroundPermissionsAsync:jest.fn(),getCurrentPositionAsync:jest.fn(),Accuracy:{Balanced:3}}));
jest.mock('react-native-safe-area-context',()=>{
  const React=require('react');const {View}=require('react-native');
  return {SafeAreaProvider:({children}:any)=>React.createElement(View,null,children),
    SafeAreaView:({children,style}:any)=>React.createElement(View,{style},children)};
});
jest.mock('react-native-webview',()=>{
  const React=require('react');const {View}=require('react-native');
  return {WebView:(props:unknown)=>React.createElement(View,{testID:'map',...(props as object)})};
});
jest.mock('@microsoft/signalr',()=>({
  LogLevel:{None:0},
  HubConnectionBuilder:jest.fn().mockImplementation(()=>({
    withUrl(){return this;},configureLogging(){return this;},withAutomaticReconnect(){return this;},
    build(){return {state:'Disconnected',on:jest.fn(),onreconnecting:jest.fn(),onreconnected:jest.fn(),onclose:jest.fn(),
      start:jest.fn().mockRejectedValue(new Error('offline')),stop:jest.fn().mockResolvedValue(undefined)};},
  })),
}));

const passenger={id:'p',name:'Олена Демо',email:'passenger@drive2u.test',role:'Passenger' as const,driverProfile:null};
const places=[{id:'station',name:'Головний залізничний вокзал',latitude:49.84085,longitude:23.99436},
  {id:'opera',name:'Львівська опера',latitude:49.84405,longitude:24.02626}];
const route={distanceKm:3.2,durationSeconds:660,geometry:[{latitude:49.84085,longitude:23.99436},
  {latitude:49.83948,longitude:23.99718},{latitude:49.84405,longitude:24.02626}],isDemo:true,
  attribution:'Drive2U — демонстраційний маршрут'};
const quote={id:'q1',pickup:{...places[0],address:places[0].name,locationId:places[0].id},
  destination:{...places[1],address:places[1].name,locationId:places[1].id},route,amount:184.4,currency:'UAH' as const,
  expiresAt:new Date(Date.now()+180000).toISOString()};

beforeEach(()=>{
  jest.spyOn(Api.prototype,'login').mockResolvedValue({accessToken:'sample',expiresAt:new Date(Date.now()+3600000).toISOString(),user:passenger});
  jest.spyOn(Api.prototype,'me').mockResolvedValue(passenger);
  jest.spyOn(Api.prototype,'active').mockResolvedValue(null);
  jest.spyOn(Api.prototype,'history').mockResolvedValue({items:[],page:1,pageSize:20,total:0});
  jest.spyOn(Api.prototype,'locations').mockResolvedValue(places);
  jest.spyOn(Api.prototype,'config').mockResolvedValue({routingMode:'Demo',quoteLifetimeSeconds:180});
  jest.spyOn(Api.prototype,'quote').mockResolvedValue(quote);
});
afterEach(async()=>{await cleanup();jest.restoreAllMocks();});

async function signIn(ui:Awaited<ReturnType<typeof render>>) {
  await waitFor(()=>expect(ui.getByLabelText('Електронна пошта')).toBeTruthy());
  await fireEvent.changeText(ui.getByLabelText('Електронна пошта'),'passenger@drive2u.test');
  await fireEvent.changeText(ui.getByLabelText('Пароль'),'Drive2U!Demo2026');
  await fireEvent.press(ui.getByRole('button',{name:'Увійти'}));
  await waitFor(()=>expect(ui.getByText('Куди поїдемо?')).toBeTruthy());
}

test('passenger signs in, selects two known places and requests server quote',async()=>{
  const ui=await render(<App/>);
  await signIn(ui);
  await fireEvent.press(ui.getByRole('button',{name:'Головний залізничний вокзал'}));
  await fireEvent.press(ui.getByRole('button',{name:'Львівська опера'}));
  await fireEvent.press(ui.getByRole('button',{name:'Розрахувати маршрут і ціну'}));
  await waitFor(()=>expect(Api.prototype.quote).toHaveBeenCalledWith(
    expect.objectContaining({locationId:'station'}),expect.objectContaining({locationId:'opera'}),'Live'));
  expect(ui.getByText('184.40 ₴')).toBeTruthy();
  expect(ui.getAllByText(/Готівка — демонстрація/).length).toBeGreaterThan(0);
});

test('backend errors are presented as readable messages without stack traces',async()=>{
  jest.spyOn(Api.prototype,'login').mockRejectedValue(new Error('network failed with stack'));
  const ui=await render(<App/>);
  await waitFor(()=>expect(ui.getByLabelText('Електронна пошта')).toBeTruthy());
  await fireEvent.changeText(ui.getByLabelText('Електронна пошта'),'bad@drive2u.test');
  await fireEvent.changeText(ui.getByLabelText('Пароль'),'longpassword');
  await fireEvent.press(ui.getByRole('button',{name:'Увійти'}));
  await waitFor(()=>expect(ui.getByText('Немає зв’язку із сервером. Перевірте мережу та спробуйте ще раз.')).toBeTruthy());
  expect(ui.queryByText(/network failed with stack/)).toBeNull();
});

test('unavailable road route shows no price and offers an explicit demo fixture',async()=>{
  const request=jest.spyOn(Api.prototype,'quote');
  request.mockRejectedValueOnce(new ApiError(503,'Маршрутизація недоступна')).mockResolvedValueOnce(quote);
  const ui=await render(<App/>);
  await signIn(ui);
  await fireEvent.press(ui.getByRole('button',{name:'Головний залізничний вокзал'}));
  await fireEvent.press(ui.getByRole('button',{name:'Львівська опера'}));
  await fireEvent.press(ui.getByRole('button',{name:'Розрахувати маршрут і ціну'}));
  await waitFor(()=>expect(ui.getByText(/Ціну не розраховано/)).toBeTruthy());
  expect(ui.queryByText('184.40 ₴')).toBeNull();
  await fireEvent.press(ui.getByRole('button',{name:'Використати маршрут вокзал → Оперний'}));
  await waitFor(()=>expect(request).toHaveBeenLastCalledWith(
    expect.objectContaining({locationId:'station'}),expect.objectContaining({locationId:'opera'}),'Demo'));
  expect(ui.getByText('184.40 ₴')).toBeTruthy();
});
