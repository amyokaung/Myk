import React from 'react';
import {Text, View} from 'react-native';

export default function App() {
  return (
    <View style={{flex: 1, alignItems: 'center', justifyContent: 'center'}}>
      <Text>Myk diagnostic screen</Text>
      <Text>React Native startup OK</Text>
      <Text>Native startup diagnostics enabled</Text>
    </View>
  );
}
