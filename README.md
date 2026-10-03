# Myanmar Offline AI

This project is a React Native 0.87 Android offline AI app.

## Native architecture

The app uses the same important architecture as the working `wear-llm` reference:

1. React Native stays in the normal application process.
2. `llama-server` is a separate native child process.
3. The server listens only on `127.0.0.1`.
4. JavaScript talks to it through HTTP `/completion`.
5. A native crash in llama.cpp is isolated from the React Native runtime.

The app does **not** build llama.cpp directly into a React Native JNI bridge.

## Build

The GitHub Actions workflow:

1. installs Android SDK/NDK,
2. installs npm dependencies,
3. downloads the current llama.cpp source,
4. builds `llama-server` for `arm64-v8a`,
5. packages it as `libllamaserver.so`,
6. builds the release APK.

## Model

Use the Models screen to import a `.gguf` file.

After selecting **Use Model**, the app starts the local llama-server against that model.

No cloud API is required for inference.
