import { helper } from '@ember/component/helper';
import { htmlSafe } from '@ember/template';

/**
 * Helper to generate linearicons with optional size and color classes
 *
 * Usage:
 * {{lnr-icon "pencil"}} - Basic icon
 * {{lnr-icon "pencil" size="lg"}} - Large icon
 * {{lnr-icon "pencil" color="primary"}} - Primary colored icon
 * {{lnr-icon "pencil" size="lg" color="primary"}} - Large primary icon
 * {{lnr-icon "pencil" class="custom-class"}} - Custom classes
 */
export function lnrIcon(
  [iconName],
  { size, color, class: additionalClasses } = {},
) {
  if (!iconName) {
    return htmlSafe('');
  }

  const classes = ['lnr', `lnr-${iconName}`];

  // Add size class if specified
  if (size) {
    classes.push(`lnr-${size}`);
  }

  // Add color class if specified
  if (color) {
    classes.push(`lnr-${color}`);
  }

  // Add any additional classes
  if (additionalClasses) {
    classes.push(additionalClasses);
  }

  return htmlSafe(`<i class="${classes.join(' ')}" aria-hidden="true"></i>`);
}

export default helper(lnrIcon);
