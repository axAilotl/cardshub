'use client';

/**
 * Display Preferences Panel
 *
 * Uses AutoForm to render display settings.
 * Values are stored in localStorage via the Settings context.
 */

import { AutoForm } from '@character-foundry/app-framework';
import { useSettings } from '@/lib/settings';
import { settingsRegistry, widgetRegistry } from '@/lib/settings/registry';
import { DisplayPreferencesSchema, type DisplayPreferences } from '@/lib/settings/schemas';

export function DisplayPreferencesPanel() {
  const { settings, updateSettings } = useSettings();
  const panel = settingsRegistry.getPanel('display');

  if (!panel) return null;

  // Map settings context to panel schema shape
  const values: DisplayPreferences = {
    blurNsfwContent: settings.blurNsfwContent,
    showImagesInGreetings: settings.showImagesInGreetings,
    cardSize: settings.cardSize,
    sidebarExpanded: settings.sidebarExpanded,
  };

  const handleChange = (newValues: DisplayPreferences) => {
    updateSettings(newValues);
  };

  return (
    <div data-settings-panel>
      <h2 data-settings-panel-title>{panel.title}</h2>
      {panel.description && (
        <p className="text-sm text-text-muted mb-4">{panel.description}</p>
      )}
      <AutoForm
        schema={DisplayPreferencesSchema}
        values={values}
        onChange={handleChange}
        uiHints={panel.uiHints}
        widgetRegistry={widgetRegistry}
      />
    </div>
  );
}
