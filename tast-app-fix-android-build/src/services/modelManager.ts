import DocumentPicker from 'react-native-document-picker';
import RNFS from 'react-native-fs';
import AsyncStorage from '@react-native-async-storage/async-storage';

const MODEL_DIR = `${RNFS.DocumentDirectoryPath}/models`;
const ACTIVE_MODEL_KEY = '@active_model';

export async function initModelDirectory() {
  if (!(await RNFS.exists(MODEL_DIR))) {
    await RNFS.mkdir(MODEL_DIR);
  }
}

export async function importGGUFModel() {
  await initModelDirectory();

  const result = await DocumentPicker.pickSingle({
    type: ['application/octet-stream', 'application/octet-stream'],
    copyTo: 'documentDirectory',
  });

  const fileName = result.name ?? '';

  if (!fileName.toLowerCase().endsWith('.gguf')) {
    throw new Error('Only .gguf model files are supported.');
  }

  if (!result.fileCopyUri) {
    throw new Error('Unable to access the selected model file.');
  }

  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
  const destination = `${MODEL_DIR}/${safeName}`;

  if (destination !== result.fileCopyUri) {
    await RNFS.copyFile(result.fileCopyUri, destination);
  }

  const stat = await RNFS.stat(destination);

  return {
    id: `${safeName}-${stat.size}`,
    name: safeName,
    path: destination,
    size: Number(stat.size),
    createdAt: Date.now(),
    active: false,
  };
}

export async function listModels() {
  await initModelDirectory();
  const files = await RNFS.readDir(MODEL_DIR);

  return files
    .filter(file => file.isFile() && file.name.toLowerCase().endsWith('.gguf'))
    .map(file => ({
      id: `${file.name}-${file.size}`,
      name: file.name,
      path: file.path,
      size: Number(file.size),
      createdAt: file.mtime ? new Date(file.mtime).getTime() : Date.now(),
      active: false,
    }));
}

export async function setActiveModel(path: string) {
  await AsyncStorage.setItem(ACTIVE_MODEL_KEY, path);
}

export async function getActiveModel() {
  return AsyncStorage.getItem(ACTIVE_MODEL_KEY);
}

export async function deleteModel(path: string) {
  if (await RNFS.exists(path)) {
    await RNFS.unlink(path);
  }

  if ((await getActiveModel()) === path) {
    await AsyncStorage.removeItem(ACTIVE_MODEL_KEY);
  }
}
