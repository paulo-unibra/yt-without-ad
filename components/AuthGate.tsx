import { useEffect, useState, type ReactNode } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { authRequest, clearAuth, isAuthenticated, login, restoreAuth, subscribeAuth } from '../services/auth';
import * as SplashScreen from 'expo-splash-screen';
export default function AuthGate({children}: {children:ReactNode}) {
  const [ready,setReady]=useState(false);
  const [authenticated,setAuthenticated]=useState(false);
  const [email,setEmail]=useState('');
  const [password,setPassword]=useState('');
  const [nextPassword,setNextPassword]=useState('');
  const [mustChange,setMustChange]=useState(false);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  useEffect(()=>{const unsubscribe=subscribeAuth(()=>setAuthenticated(isAuthenticated()));void restoreAuth().finally(()=>{setReady(true);void SplashScreen.hideAsync();});return unsubscribe;},[]);
  const submit=async()=>{
    setBusy(true);setError('');
    try {
      if(mustChange){await authRequest('password',{current:password,password:nextPassword});await clearAuth();setMustChange(false);setPassword('');setNextPassword('');setError('Senha alterada. Entre com a nova senha.');}
      else {const result=await login(email,password);setMustChange(result.mustChange);if(!result.mustChange)setPassword('');}
    } catch(e){setError(e instanceof Error?e.message:'Falha de conexão.');} finally {setBusy(false);}
  };
  if(ready&&authenticated&&!mustChange)return children;
  return <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled"><View style={styles.form}>
    <Text style={styles.title}>{mustChange?'Alterar senha temporária':'Entrar no aplicativo'}</Text>
    {!ready?<Text style={styles.text}>Carregando...</Text>:<>
    <Text style={styles.text}>{mustChange?'Crie uma senha de 12 a 128 caracteres para continuar.':'Use a conta criada pelo administrador.'}</Text>
    {!mustChange&&<><Text style={styles.text}>E-mail</Text><TextInput style={styles.input} value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" accessibilityLabel="E-mail" /></>}
    <Text style={styles.text}>{mustChange?'Senha atual':'Senha'}</Text><TextInput style={styles.input} value={password} onChangeText={setPassword} secureTextEntry maxLength={128} accessibilityLabel="Senha" />
    {mustChange&&<><Text style={styles.text}>Nova senha</Text><TextInput style={styles.input} value={nextPassword} onChangeText={setNextPassword} secureTextEntry maxLength={128} accessibilityLabel="Nova senha" /></>}
    {!!error&&<Text style={styles.text} accessibilityRole="alert">{error}</Text>}
    <TouchableOpacity disabled={busy} onPress={submit} style={styles.button} accessibilityRole="button"><Text style={styles.text}>{busy?'Aguarde…':mustChange?'Salvar nova senha':'Entrar'}</Text></TouchableOpacity>
    </>}
  </View></ScrollView>;
}
const styles=StyleSheet.create({container:{flexGrow:1,justifyContent:'center',padding:24,backgroundColor:'#0F0F0F'},form:{width:'100%',maxWidth:440,alignSelf:'center',gap:12},title:{fontSize:24,fontWeight:'700',color:'#FFF'},text:{fontSize:16,lineHeight:24,color:'#FFF'},input:{minHeight:48,padding:12,borderWidth:1,borderColor:'#AAA',borderRadius:8,color:'#FFF',fontSize:16},button:{minHeight:48,alignItems:'center',justifyContent:'center',backgroundColor:'#333',borderRadius:8,marginTop:12}});
