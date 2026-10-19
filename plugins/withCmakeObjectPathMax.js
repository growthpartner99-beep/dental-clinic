const { withAppBuildGradle } = require('@expo/config-plugins');

// Windows caps file paths at MAX_PATH (260), and ninja enforces that cap with
// its own hardcoded check. React Native's autolinked codegen sources live deep
// inside node_modules; where a source sits outside its module's CMakeLists dir
// (react-native-gesture-handler's shared/shadowNodes), CMake mirrors the
// absolute path into the object path and blows past 260.
//
// CMake only hashes an object path when it exceeds this value, so the value
// has to sit above the object *directory* length (~169 here) or CMake refuses
// to shorten anything, but below 260 or ninja still rejects it. 128 is too
// low: it trips "cannot be safely placed under this directory" and leaves the
// long path in place.
const OBJECT_PATH_MAX = '250';

module.exports = function withCmakeObjectPathMax(config) {
  return withAppBuildGradle(config, (mod) => {
    if (mod.modResults.contents.includes('CMAKE_OBJECT_PATH_MAX')) {
      return mod;
    }

    // arguments() lives on defaultConfig.externalNativeBuild.cmake
    // (ExternalNativeCmakeOptions). It does NOT exist on the top-level
    // android.externalNativeBuild.cmake block, which is a CmakeOptions
    // exposing only path and buildStagingDirectory.
    const updated = mod.modResults.contents.replace(
      /^(\s*)defaultConfig \{$/m,
      (match, indent) =>
        `${indent}defaultConfig {\n` +
        `${indent}    externalNativeBuild {\n` +
        `${indent}        cmake {\n` +
        `${indent}            arguments "-DCMAKE_OBJECT_PATH_MAX=${OBJECT_PATH_MAX}"\n` +
        `${indent}        }\n` +
        `${indent}    }\n`
    );

    if (updated === mod.modResults.contents) {
      throw new Error(
        'withCmakeObjectPathMax: could not find a "defaultConfig {" block in android/app/build.gradle'
      );
    }
    mod.modResults.contents = updated;
    return mod;
  });
};
