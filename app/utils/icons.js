import { createIcons, icons } from 'lucide';

function toPascal(str) {
  return str.split('-').map(s => s.charAt(0).toUpperCase() + s.slice(1)).join('');
}

export function iconSvg(name, attrs = {}) {
  const pascal = toPascal(name);
  const def = icons[name] || icons[pascal];
  if (!def) {
    console.warn(`[Lucide] Icon not found: ${name}`);
    return '';
  }

  const defaultAttrs = {
    xmlns: 'http://www.w3.org/2000/svg',
    width: 16,
    height: 16,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    'stroke-width': 2,
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round',
    class: `lucide lucide-${name}`
  };
  const finalAttrs = { ...defaultAttrs, ...attrs };
  if (attrs.class && attrs.class !== defaultAttrs.class) {
    finalAttrs.class = `${defaultAttrs.class} ${attrs.class}`;
  }
  const attrStr = Object.entries(finalAttrs).map(([k, v]) => `${k}="${v}"`).join(' ');
  const inner = def.map(([tag, childAttrs]) => {
    const cStr = Object.entries(childAttrs).map(([k, v]) => `${k}="${v}"`).join(' ');
    return `<${tag} ${cStr}></${tag}>`;
  }).join('');
  return `<svg ${attrStr}>${inner}</svg>`;
}

export function renderLucideIcons(root = typeof document !== 'undefined' ? document : null) {
  if (typeof document === 'undefined' || !root) return;
  try {
    createIcons({
      icons,
      root: root || document,
      attrs: {
        'stroke-width': 2
      }
    });
  } catch (err) {
    console.error('Error rendering Lucide icons:', err);
  }
}

export { icons };
