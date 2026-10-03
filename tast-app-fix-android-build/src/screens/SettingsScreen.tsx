import React from 'react';
import {Text, TextInput, View} from 'react-native';
import {useSettingsStore} from '../store/settingsStore';

export default function SettingsScreen() {
  const {
    temperature,
    contextSize,
    maxTokens,
    setTemperature,
    setContextSize,
    setMaxTokens,
  } = useSettingsStore();

  return (
    <View style={{flex: 1, padding: 20, gap: 10}}>
      <Text>Temperature</Text>
      <TextInput
        value={String(temperature)}
        keyboardType="decimal-pad"
        onChangeText={v => setTemperature(Number(v))}
        style={{borderWidth: 1, padding: 10}}
      />

      <Text>Context Size</Text>
      <TextInput
        value={String(contextSize)}
        keyboardType="number-pad"
        onChangeText={v => setContextSize(Number(v))}
        style={{borderWidth: 1, padding: 10}}
      />

      <Text>Max Tokens</Text>
      <TextInput
        value={String(maxTokens)}
        keyboardType="number-pad"
        onChangeText={v => setMaxTokens(Number(v))}
        style={{borderWidth: 1, padding: 10}}
      />
    </View>
  );
}
