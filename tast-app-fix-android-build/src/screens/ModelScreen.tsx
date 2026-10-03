import React, {useEffect, useState} from 'react';
import {Alert, Button, FlatList, Text, View} from 'react-native';
import {
  importGGUFModel,
  listModels,
  setActiveModel,
} from '../services/modelManager';
import {startServer, stopGeneration} from '../services/llama';
import {useModelStore} from '../store/modelStore';
import {useSettingsStore} from '../store/settingsStore';

export default function ModelScreen() {
  const {
    models,
    activeModel,
    setModels,
    setActiveModel: setStoreActive,
  } = useModelStore();

  const {contextSize} = useSettingsStore();
  const [busy, setBusy] = useState(false);

  async function refresh() {
    setModels(await listModels());
  }

  useEffect(() => {
    refresh().catch(console.error);
  }, []);

  async function importModel() {
    try {
      setBusy(true);
      await importGGUFModel();
      await refresh();
    } catch (e) {
      Alert.alert('Import failed', String(e));
    } finally {
      setBusy(false);
    }
  }

  async function activate(model: any) {
    try {
      setBusy(true);

      await stopGeneration();

      // The model is loaded by the standalone llama-server process.
      // This keeps llama.cpp outside the React Native process.
      await startServer(model.path, contextSize);

      await setActiveModel(model.path);
      setStoreActive(model);

      Alert.alert(
        'Ready',
        `${model.name} is active and the local AI server is ready.`,
      );
    } catch (e) {
      Alert.alert(
        'Model error',
        String(e),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={{flex: 1, padding: 16}}>
      <Button
        title={busy ? 'Starting local AI...' : 'Import GGUF Model'}
        onPress={importModel}
        disabled={busy}
      />

      <FlatList
        data={models}
        keyExtractor={item => item.id}
        renderItem={({item}) => (
          <View style={{paddingVertical: 16}}>
            <Text
              style={{
                fontSize: 17,
                fontWeight: '600',
              }}>
              {item.name}
            </Text>

            <Text>
              {(item.size / 1024 / 1024).toFixed(1)} MB
            </Text>

            <Button
              title={
                activeModel?.path === item.path
                  ? 'Active'
                  : 'Use Model'
              }
              onPress={() => activate(item)}
              disabled={busy}
            />
          </View>
        )}
      />
    </View>
  );
}
