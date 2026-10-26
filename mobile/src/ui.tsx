import React, {useRef,useState} from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';
export const colors = {bg:'#F4F6F3',ink:'#162C27',green:'#147D64',lime:'#D8F275',muted:'#63756D',border:'#DCE5DD',danger:'#A63232'};
export function Button({title,onPress,disabled=false,secondary=false,danger=false}:{title:string;onPress:()=>void|Promise<void>;disabled?:boolean;secondary?:boolean;danger?:boolean}) {
  const locked=useRef(false);const[busy,setBusy]=useState(false);
  return <Pressable accessibilityRole="button" accessibilityLabel={title} disabled={disabled||busy} onPress={async()=>{if(locked.current)return;locked.current=true;setBusy(true);try{await onPress();}finally{locked.current=false;setBusy(false);}}} style={({pressed})=>[styles.button,secondary&&styles.secondary,danger&&styles.danger,(disabled||busy)&&styles.disabled,pressed&&{opacity:.75}]}>
    {busy?<ActivityIndicator color={secondary?colors.ink:'#fff'}/>:<Text style={[styles.buttonText,secondary&&{color:colors.ink}]}>{title}</Text>}
  </Pressable>;
}
export function Field({label,...props}:TextInputProps&{label:string}) {return <View style={{gap:6}}><Text style={styles.label}>{label}</Text><TextInput accessibilityLabel={label} placeholderTextColor={colors.muted} {...props} style={[styles.input,props.style]}/></View>;}
export function Card({children}:{children:React.ReactNode}) {return <View style={styles.card}>{children}</View>;}
export function Notice({text,error=false}:{text:string;error?:boolean}) {return <View accessibilityRole={error?'alert':undefined} style={[styles.notice,error&&{backgroundColor:'#FFF0ED'}]}><Text style={{color:error?colors.danger:colors.ink,lineHeight:21}}>{text}</Text></View>;}
export const styles=StyleSheet.create({
  screen:{flex:1,backgroundColor:colors.bg}, content:{padding:20,paddingBottom:32,gap:16}, card:{padding:18,borderRadius:22,backgroundColor:'#fff',borderWidth:1,borderColor:colors.border,gap:12},
  heading:{fontSize:27,fontWeight:'800',color:colors.ink,letterSpacing:-.5},title:{fontSize:20,fontWeight:'700',color:colors.ink},text:{fontSize:16,color:colors.ink,lineHeight:23},muted:{fontSize:14,color:colors.muted,lineHeight:21},price:{fontSize:34,fontWeight:'800',color:colors.green},
  label:{fontSize:14,color:colors.ink,fontWeight:'600'},input:{minHeight:50,borderWidth:1,borderColor:colors.border,borderRadius:13,paddingHorizontal:14,paddingVertical:12,backgroundColor:'#fff',fontSize:16,color:colors.ink},
  button:{minHeight:51,borderRadius:14,paddingHorizontal:16,paddingVertical:14,backgroundColor:colors.green,alignItems:'center',justifyContent:'center'},buttonText:{fontSize:16,fontWeight:'700',color:'#fff'},secondary:{backgroundColor:'#EEF3ED',borderWidth:1,borderColor:colors.border},danger:{backgroundColor:colors.danger},disabled:{opacity:.45},notice:{padding:14,borderRadius:14,backgroundColor:'#EAF2E4'},row:{flexDirection:'row',gap:10,alignItems:'center'},pill:{paddingHorizontal:12,paddingVertical:7,borderRadius:20,backgroundColor:colors.lime},
});
