// Expo config plugin: force ENABLE_USER_SCRIPT_SANDBOXING = NO on every iOS
// build configuration.
//
// Why this exists: Xcode 15+ defaults user script sandboxing to YES, which
// blocks React Native's "Bundle React Native code and images" script phase
// from writing `ip.txt` into the .app bundle. That fails the build with:
//   Sandbox: bash(...) deny(1) file-write-create .../costcomobile.app/ip.txt
//
// Setting it by hand in Xcode (or by editing project.pbxproj) works until the
// next `expo prebuild`, which regenerates ios/ from scratch and silently
// reverts it. `expo-build-properties` does NOT expose this setting, so a
// custom plugin is the supported way to make it stick.
//
// Registered in app.json as "./plugins/withScriptSandboxDisabled".

const { withXcodeProject } = require('expo/config-plugins');

const withScriptSandboxDisabled = (config) =>
  withXcodeProject(config, (cfg) => {
    const project = cfg.modResults;
    const buildConfigs = project.pbxXCBuildConfigurationSection();

    for (const key of Object.keys(buildConfigs)) {
      const entry = buildConfigs[key];
      // Skip the comment entries pbxproj interleaves with real objects.
      if (!entry || typeof entry !== 'object' || !entry.buildSettings) continue;
      entry.buildSettings.ENABLE_USER_SCRIPT_SANDBOXING = 'NO';
    }

    return cfg;
  });

module.exports = withScriptSandboxDisabled;
