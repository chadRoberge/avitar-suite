import Helper from '@ember/component/helper';
import { getOwner } from '@ember/application';
import { inject as service } from '@ember/service';

/**
 * Helper to safely resolve a component from a string path
 * Replaces the deprecated {{component}} helper
 *
 * Usage: {{#let (ensure-safe-component "path/to/component") as |Component|}}
 */
export default class EnsureSafeComponentHelper extends Helper {
  compute([componentPath]) {
    if (!componentPath) {
      return null;
    }

    // If it's already a component class, return it
    if (typeof componentPath !== 'string') {
      return componentPath;
    }

    // Get the owner (application instance) to look up the component
    const owner = getOwner(this);

    if (!owner) {
      console.warn('Could not get owner for component lookup:', componentPath);
      return null;
    }

    // Try to look up the component
    // First try with 'component:' prefix (standard Ember lookup)
    let component = owner.factoryFor(`component:${componentPath}`);

    if (component) {
      return component.class;
    }

    // If not found, log warning
    console.warn(`Component not found: ${componentPath}`);
    return null;
  }
}
