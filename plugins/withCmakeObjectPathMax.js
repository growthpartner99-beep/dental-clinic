const { withGradleProperties } = require('expo/config-plugins');

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
  return withGradleProperties(config, (mod) => {
    const property = mod.modResults.find(
      (item) => item.type === 'property' && item.key === 'expo.android.cmakeObjectPathMax'
    );

    if (property) {
      property.value = OBJECT_PATH_MAX;
    } else {
      mod.modResults.push({
        type: 'property',
        key: 'expo.android.cmakeObjectPathMax',
        value: OBJECT_PATH_MAX,
      });
    }

    return mod;
  });
};
