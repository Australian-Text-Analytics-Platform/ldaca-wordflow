/**
 * The model each AI provider starts with in an Annotation tab.
 *
 * Layers, later ones winning, empty names skipped:
 *   1. the server's default for its own providers;
 *   2. the person's default, set in Settings, Servers;
 *   3. the model last chosen or run with that provider in this Project;
 *   4. the model chosen in this tab.
 * So a default in Settings can be left empty: the first model used in a
 * Project is then that Project's, and a choice in a Project never changes
 * the default in Settings.
 */
export const layerProviderModels = (
  ...layers: (Record<string, string> | undefined)[]
): Record<string, string> => {
  const models: Record<string, string> = {};
  for (const layer of layers) {
    for (const [configurationId, model] of Object.entries(layer ?? {})) {
      const name = model.trim();
      if (name) models[configurationId] = name;
    }
  }
  return models;
};
