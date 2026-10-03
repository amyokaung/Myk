# Android native overlay

This folder contains the project-specific Android native configuration for the
React Native app. A complete React Native CLI-generated Android project is
required for Gradle wrapper/build-plugin files.

Generate it with React Native Community CLI 0.87, then retain:
- app/src/main/cpp/
- app/src/main/java/com/myanmarofflineai/
- app/src/main/AndroidManifest.xml changes
- gradle.properties changes

The GitHub Actions workflow assumes a complete RN-generated android directory.
