import React, {useEffect, useState} from 'react';
import {Alert, Button, FlatList, Text, View} from 'react-native';
import {deleteConversation, getConversations} from '../services/database';

export default function ChatHistoryScreen() {
  const [items, setItems] = useState<any[]>([]);

  async function load() {
    setItems(await getConversations());
  }

  useEffect(() => {
    load().catch(console.error);
  }, []);

  async function remove(id: string) {
    Alert.alert('Delete conversation?', 'This cannot be undone.', [
      {text: 'Cancel'},
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await deleteConversation(id);
          await load();
        },
      },
    ]);
  }

  return (
    <FlatList
      data={items}
      keyExtractor={item => String(item.id)}
      renderItem={({item}) => (
        <View style={{padding: 16}}>
          <Text style={{fontSize: 16}}>{item.title}</Text>
          <Button title="Delete" onPress={() => remove(item.id)} />
        </View>
      )}
    />
  );
}
