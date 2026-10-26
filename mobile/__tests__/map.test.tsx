import React from 'react';
import {fireEvent, render} from '@testing-library/react-native';
import {RideMap} from '../src/RideMap';

jest.mock('react-native-webview',()=>{
  const React=require('react');
  const {View}=require('react-native');
  return {WebView:(props:unknown)=>React.createElement(View,{testID:'map',...(props as object)})};
});

test('bundled map shows server geometry and accepts a valid Lviv tap',async()=>{
  const onPick=jest.fn();
  const pickup={latitude:49.84085,longitude:23.99436,address:'Вокзал'};
  const destination={latitude:49.84405,longitude:24.02626,address:'Опера'};
  const route={distanceKm:3.2,durationSeconds:660,isDemo:true,attribution:'Демомаршрут',geometry:[
    {latitude:49.84085,longitude:23.99436},{latitude:49.83948,longitude:23.99718},{latitude:49.84405,longitude:24.02626},
  ]};
  const ui=await render(<RideMap pickup={pickup} destination={destination} route={route} locations={[]} onPick={onPick}/>);
  const map=ui.getByTestId('map');
  expect(map.props.source.html).toContain('Leaflet 1.9.4');
  expect(map.props.source.html).toContain('49.83948');
  expect(ui.getByText(/Демомаршрут/)).toBeTruthy();
  expect(map.props.source.html).not.toContain('tile.openstreetmap.org');
  await fireEvent(map,'onMessage',{nativeEvent:{data:JSON.stringify({type:'pick',latitude:49.84,longitude:24.02})}});
  expect(onPick).toHaveBeenCalledWith({latitude:49.84,longitude:24.02});
  await fireEvent(map,'onMessage',{nativeEvent:{data:JSON.stringify({type:'pick',latitude:0,longitude:0})}});
  expect(onPick).toHaveBeenCalledTimes(1);
});
