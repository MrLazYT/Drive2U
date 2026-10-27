import React from 'react';
import {fireEvent, render} from '@testing-library/react-native';
import {RideMap} from '../src/RideMap';

jest.mock('react-native-webview',()=>{
  const React=require('react');
  const {View}=require('react-native');
  return {WebView:(props:unknown)=>React.createElement(View,{testID:'map',...(props as object)})};
});

test('full OSM map shows server geometry and accepts taps beyond Lviv',async()=>{
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
  expect(map.props.source.html).toContain('https://tile.openstreetmap.org/{z}/{x}/{y}.png');
  expect(map.props.source.html).toContain('OpenStreetMap contributors');
  expect(map.props.source.html).toContain('map.fitBounds');
  expect(map.props.userAgent).toContain('Drive2U/1.0');
  await fireEvent(map,'onMessage',{nativeEvent:{data:JSON.stringify({type:'pick',latitude:49.84,longitude:24.02})}});
  expect(onPick).toHaveBeenCalledWith({latitude:49.84,longitude:24.02});
  await fireEvent(map,'onMessage',{nativeEvent:{data:JSON.stringify({type:'pick',latitude:50.45,longitude:30.52})}});
  expect(onPick).toHaveBeenCalledWith({latitude:50.45,longitude:30.52});
  await fireEvent(map,'onMessage',{nativeEvent:{data:JSON.stringify({type:'pick',latitude:91,longitude:0})}});
  expect(onPick).toHaveBeenCalledTimes(2);
  await fireEvent(map,'onMessage',{nativeEvent:{data:JSON.stringify({type:'tiles-error'})}});
  expect(ui.getByText(/Мапа зараз недоступна/)).toBeTruthy();
});
test('full-screen route keeps gesture controls and fits around measured panels',async()=>{
  const pickup={latitude:49.84085,longitude:23.99436,address:'Вокзал'};
  const destination={latitude:49.84405,longitude:24.02626,address:'Опера'};
  const route={distanceKm:3.2,durationSeconds:660,isDemo:false,attribution:'OSRM',geometry:[pickup,destination]};
  const ui=await render(<RideMap fullScreen pickup={pickup} destination={destination} route={route} locations={[]} insets={{top:142,bottom:164}}/>);
  const html=ui.getByTestId('map').props.source.html as string;
  expect(html).toContain('zoomControl:false');
  expect(html).toContain('touchZoom:true,dragging:true');
  expect(html).toContain('"top":142,"bottom":164');
  expect(html).toContain('Math.floor(viewportHeight*0.42)');
  expect(html).toContain('paddingTopLeft');
  expect(html).toContain('paddingBottomRight');
  expect(html).toContain('map.fitBounds(L.latLngBounds(points),fitOptions)');
});
