import { helper } from '@ember/component/helper';
import { htmlSafe } from '@ember/template';

/**
 * Helper to generate icomoon icons with optional size and color classes
 *
 * Usage:
 * {{lnr-icon "pencil"}} - Basic icon
 * {{lnr-icon "pencil" size="24"}} - Icon with specific size
 * {{lnr-icon "pencil" class="avitar-text-primary"}} - Custom classes for color
 * {{lnr-icon "pencil" size="24" class="avitar-text-primary"}} - Size with custom classes
 */
export function lnrIcon([iconName], { size, class: additionalClasses } = {}) {
  if (!iconName) {
    return htmlSafe('');
  }

  // Use icon- prefix for icomoon fonts
  const classes = [`icon-${iconName}`];

  // Add any additional classes
  if (additionalClasses) {
    classes.push(additionalClasses);
  }

  // Build style attribute for size if specified
  let styleAttr = '';
  if (size) {
    styleAttr = ` style="font-size: ${size}px;"`;
  }

  return htmlSafe(
    `<i class="${classes.join(' ')}"${styleAttr} aria-hidden="true"></i>`,
  );
}

export default helper(lnrIcon);
