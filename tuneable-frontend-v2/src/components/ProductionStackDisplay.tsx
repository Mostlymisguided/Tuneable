import React from 'react';
import { Link } from 'react-router-dom';
import { Disc3, Cpu, Piano } from 'lucide-react';
import {
  hasProductionStack,
  getGearProfilePath,
  DAW_ROLE_LABELS,
  PLUGIN_CATEGORY_LABELS,
  PLUGIN_ROLE_LABELS,
  HARDWARE_CATEGORY_LABELS,
  HARDWARE_ROLE_LABELS,
} from '../data/gear';
import type {
  ProductionStack,
  DawRole,
  PluginCategory,
  PluginRole,
  HardwareCategory,
  HardwareRole,
} from '../data/gear';

interface ProductionStackDisplayProps {
  stack?: ProductionStack | null;
  className?: string;
}

const chipClass =
  'inline-flex items-center gap-1.5 rounded-full bg-gray-800 border border-gray-700 px-3 py-1 text-sm text-gray-200 hover:border-purple-500/60 hover:text-purple-200 transition-colors no-underline';
const metaClass = 'text-xs text-gray-400';

const ProductionStackDisplay: React.FC<ProductionStackDisplayProps> = ({ stack, className = '' }) => {
  if (!hasProductionStack(stack)) return null;

  const daws = stack?.daws || [];
  const plugins = stack?.plugins || [];
  const hardware = stack?.hardware || [];

  return (
    <div className={`space-y-4 ${className}`}>
      {daws.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Disc3 className="h-4 w-4 text-purple-400" />
            <span className="text-sm font-medium text-gray-300">DAWs</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {daws.map((d, i) => (
              <Link key={i} to={getGearProfilePath(d, 'daw')} className={chipClass}>
                <span className="font-medium">{d.name}</span>
                {d.version && <span className={metaClass}>v{d.version}</span>}
                {d.role && <span className={metaClass}>· {DAW_ROLE_LABELS[d.role as DawRole] || d.role}</span>}
              </Link>
            ))}
          </div>
        </div>
      )}

      {plugins.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Cpu className="h-4 w-4 text-purple-400" />
            <span className="text-sm font-medium text-gray-300">Plugins</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {plugins.map((p, i) => (
              <Link key={i} to={getGearProfilePath(p, 'plugin')} className={chipClass}>
                <span className="font-medium">{p.name}</span>
                {p.manufacturer && <span className={metaClass}>{p.manufacturer}</span>}
                {p.category && (
                  <span className={metaClass}>
                    · {PLUGIN_CATEGORY_LABELS[p.category as PluginCategory] || p.category}
                  </span>
                )}
                {p.role && <span className={metaClass}>· {PLUGIN_ROLE_LABELS[p.role as PluginRole] || p.role}</span>}
              </Link>
            ))}
          </div>
        </div>
      )}

      {hardware.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Piano className="h-4 w-4 text-purple-400" />
            <span className="text-sm font-medium text-gray-300">Hardware</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {hardware.map((h, i) => (
              <Link key={i} to={getGearProfilePath(h, 'hardware')} className={chipClass}>
                <span className="font-medium">{h.name}</span>
                {h.manufacturer && <span className={metaClass}>{h.manufacturer}</span>}
                {h.category && (
                  <span className={metaClass}>
                    · {HARDWARE_CATEGORY_LABELS[h.category as HardwareCategory] || h.category}
                  </span>
                )}
                {h.role && <span className={metaClass}>· {HARDWARE_ROLE_LABELS[h.role as HardwareRole] || h.role}</span>}
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default ProductionStackDisplay;
