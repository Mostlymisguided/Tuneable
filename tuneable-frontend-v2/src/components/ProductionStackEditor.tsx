import React, { useId } from 'react';
import { Plus, Trash2, Disc3, Cpu, Piano } from 'lucide-react';
import {
  DAW_CATALOG,
  PLUGIN_CATALOG,
  HARDWARE_CATALOG,
  DAW_ROLE_LABELS,
  PLUGIN_CATEGORY_LABELS,
  PLUGIN_ROLE_LABELS,
  HARDWARE_CATEGORY_LABELS,
  HARDWARE_ROLE_LABELS,
} from '../data/gear';
import type {
  ProductionStack,
  DawEntry,
  PluginEntry,
  HardwareEntry,
  PluginCategory,
  HardwareCategory,
  DawRole,
  PluginRole,
  HardwareRole,
} from '../data/gear';

interface ProductionStackEditorProps {
  value: ProductionStack;
  onChange: (stack: ProductionStack) => void;
  disabled?: boolean;
}

const inputClass =
  'flex-1 min-w-0 bg-gray-800 border border-gray-600 rounded-lg p-2 text-white text-sm placeholder-gray-400 focus:outline-none focus:border-purple-500';
const selectClass =
  'bg-gray-800 border border-gray-600 rounded-lg p-2 text-white text-sm focus:outline-none focus:border-purple-500';

const ProductionStackEditor: React.FC<ProductionStackEditorProps> = ({ value, onChange, disabled = false }) => {
  const uid = useId();
  const dawListId = `${uid}-daws`;
  const pluginListId = `${uid}-plugins`;
  const hardwareListId = `${uid}-hardware`;

  const daws = value.daws || [];
  const plugins = value.plugins || [];
  const hardware = value.hardware || [];

  // ---- DAW handlers ----
  const updateDaw = (index: number, patch: Partial<DawEntry>) => {
    const next = daws.map((d, i) => (i === index ? { ...d, ...patch } : d));
    onChange({ ...value, daws: next });
  };
  const addDaw = () => onChange({ ...value, daws: [...daws, { name: '', role: null }] });
  const removeDaw = (index: number) => onChange({ ...value, daws: daws.filter((_, i) => i !== index) });

  // ---- Plugin handlers ----
  const updatePlugin = (index: number, patch: Partial<PluginEntry>) => {
    const next = plugins.map((p, i) => (i === index ? { ...p, ...patch } : p));
    onChange({ ...value, plugins: next });
  };
  const onPluginNameChange = (index: number, name: string) => {
    // Auto-fill manufacturer/category when the name matches a catalog entry.
    const match = PLUGIN_CATALOG.find((p) => p.name.toLowerCase() === name.trim().toLowerCase());
    if (match) {
      updatePlugin(index, { name, manufacturer: match.manufacturer, category: match.category });
    } else {
      updatePlugin(index, { name });
    }
  };
  const addPlugin = () => onChange({ ...value, plugins: [...plugins, { name: '', category: 'other', role: null }] });
  const removePlugin = (index: number) => onChange({ ...value, plugins: plugins.filter((_, i) => i !== index) });

  // ---- Hardware handlers ----
  const updateHardware = (index: number, patch: Partial<HardwareEntry>) => {
    const next = hardware.map((h, i) => (i === index ? { ...h, ...patch } : h));
    onChange({ ...value, hardware: next });
  };
  const onHardwareNameChange = (index: number, name: string) => {
    const match = HARDWARE_CATALOG.find((h) => h.name.toLowerCase() === name.trim().toLowerCase());
    if (match) {
      updateHardware(index, { name, manufacturer: match.manufacturer, category: match.category });
    } else {
      updateHardware(index, { name });
    }
  };
  const addHardware = () => onChange({ ...value, hardware: [...hardware, { name: '', category: 'other', role: null }] });
  const removeHardware = (index: number) => onChange({ ...value, hardware: hardware.filter((_, i) => i !== index) });

  return (
    <div className="space-y-6">
      {/* Datalists power the autocomplete suggestions */}
      <datalist id={dawListId}>
        {DAW_CATALOG.map((name) => (
          <option key={name} value={name} />
        ))}
      </datalist>
      <datalist id={pluginListId}>
        {PLUGIN_CATALOG.map((p) => (
          <option key={p.name} value={p.name}>{p.manufacturer}</option>
        ))}
      </datalist>
      <datalist id={hardwareListId}>
        {HARDWARE_CATALOG.map((h) => (
          <option key={h.name} value={h.name}>{h.manufacturer}</option>
        ))}
      </datalist>

      {/* DAWs */}
      <div>
        <div className="flex items-center space-x-2 mb-2">
          <Disc3 className="h-4 w-4 text-purple-400" />
          <label className="text-white font-medium text-sm">DAWs</label>
        </div>
        {daws.map((daw, index) => (
          <div key={index} className="flex flex-wrap gap-2 mb-2">
            <input
              type="text"
              list={dawListId}
              placeholder="DAW (e.g., Ableton Live)"
              value={daw.name}
              disabled={disabled}
              onChange={(e) => updateDaw(index, { name: e.target.value })}
              className={inputClass}
            />
            <input
              type="text"
              placeholder="Version"
              value={daw.version || ''}
              disabled={disabled}
              onChange={(e) => updateDaw(index, { version: e.target.value })}
              className="w-24 bg-gray-800 border border-gray-600 rounded-lg p-2 text-white text-sm placeholder-gray-400 focus:outline-none focus:border-purple-500"
            />
            <select
              value={daw.role || ''}
              disabled={disabled}
              onChange={(e) => updateDaw(index, { role: (e.target.value || null) as DawRole | null })}
              className={selectClass}
            >
              <option value="">Role…</option>
              {(Object.keys(DAW_ROLE_LABELS) as DawRole[]).map((r) => (
                <option key={r} value={r}>{DAW_ROLE_LABELS[r]}</option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => removeDaw(index)}
              disabled={disabled}
              className="px-3 py-2 bg-red-600 hover:bg-red-700 rounded-lg text-white transition-colors"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={addDaw}
          disabled={disabled}
          className="flex items-center space-x-2 px-3 py-1.5 bg-purple-600 hover:bg-purple-700 rounded-lg text-white transition-colors text-sm"
        >
          <Plus className="h-4 w-4" />
          <span>Add DAW</span>
        </button>
      </div>

      {/* Plugins */}
      <div>
        <div className="flex items-center space-x-2 mb-2">
          <Cpu className="h-4 w-4 text-purple-400" />
          <label className="text-white font-medium text-sm">Plugins / Software Instruments</label>
        </div>
        {plugins.map((plugin, index) => (
          <div key={index} className="flex flex-wrap gap-2 mb-2">
            <input
              type="text"
              list={pluginListId}
              placeholder="Plugin (e.g., Serum)"
              value={plugin.name}
              disabled={disabled}
              onChange={(e) => onPluginNameChange(index, e.target.value)}
              className={inputClass}
            />
            <input
              type="text"
              placeholder="Manufacturer"
              value={plugin.manufacturer || ''}
              disabled={disabled}
              onChange={(e) => updatePlugin(index, { manufacturer: e.target.value })}
              className={inputClass}
            />
            <select
              value={plugin.category || 'other'}
              disabled={disabled}
              onChange={(e) => updatePlugin(index, { category: e.target.value as PluginCategory })}
              className={selectClass}
            >
              {(Object.keys(PLUGIN_CATEGORY_LABELS) as PluginCategory[]).map((c) => (
                <option key={c} value={c}>{PLUGIN_CATEGORY_LABELS[c]}</option>
              ))}
            </select>
            <select
              value={plugin.role || ''}
              disabled={disabled}
              onChange={(e) => updatePlugin(index, { role: (e.target.value || null) as PluginRole | null })}
              className={selectClass}
            >
              <option value="">Role…</option>
              {(Object.keys(PLUGIN_ROLE_LABELS) as PluginRole[]).map((r) => (
                <option key={r} value={r}>{PLUGIN_ROLE_LABELS[r]}</option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => removePlugin(index)}
              disabled={disabled}
              className="px-3 py-2 bg-red-600 hover:bg-red-700 rounded-lg text-white transition-colors"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={addPlugin}
          disabled={disabled}
          className="flex items-center space-x-2 px-3 py-1.5 bg-purple-600 hover:bg-purple-700 rounded-lg text-white transition-colors text-sm"
        >
          <Plus className="h-4 w-4" />
          <span>Add Plugin</span>
        </button>
      </div>

      {/* Hardware */}
      <div>
        <div className="flex items-center space-x-2 mb-2">
          <Piano className="h-4 w-4 text-purple-400" />
          <label className="text-white font-medium text-sm">Hardware (Synths, Controllers, Gear)</label>
        </div>
        {hardware.map((hw, index) => (
          <div key={index} className="flex flex-wrap gap-2 mb-2">
            <input
              type="text"
              list={hardwareListId}
              placeholder="Hardware (e.g., Moog Subsequent 37)"
              value={hw.name}
              disabled={disabled}
              onChange={(e) => onHardwareNameChange(index, e.target.value)}
              className={inputClass}
            />
            <input
              type="text"
              placeholder="Manufacturer"
              value={hw.manufacturer || ''}
              disabled={disabled}
              onChange={(e) => updateHardware(index, { manufacturer: e.target.value })}
              className={inputClass}
            />
            <select
              value={hw.category || 'other'}
              disabled={disabled}
              onChange={(e) => updateHardware(index, { category: e.target.value as HardwareCategory })}
              className={selectClass}
            >
              {(Object.keys(HARDWARE_CATEGORY_LABELS) as HardwareCategory[]).map((c) => (
                <option key={c} value={c}>{HARDWARE_CATEGORY_LABELS[c]}</option>
              ))}
            </select>
            <select
              value={hw.role || ''}
              disabled={disabled}
              onChange={(e) => updateHardware(index, { role: (e.target.value || null) as HardwareRole | null })}
              className={selectClass}
            >
              <option value="">Role…</option>
              {(Object.keys(HARDWARE_ROLE_LABELS) as HardwareRole[]).map((r) => (
                <option key={r} value={r}>{HARDWARE_ROLE_LABELS[r]}</option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => removeHardware(index)}
              disabled={disabled}
              className="px-3 py-2 bg-red-600 hover:bg-red-700 rounded-lg text-white transition-colors"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={addHardware}
          disabled={disabled}
          className="flex items-center space-x-2 px-3 py-1.5 bg-purple-600 hover:bg-purple-700 rounded-lg text-white transition-colors text-sm"
        >
          <Plus className="h-4 w-4" />
          <span>Add Hardware</span>
        </button>
      </div>
    </div>
  );
};

export default ProductionStackEditor;
