import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';
import { inject as service } from '@ember/service';

/**
 * Bottom Tab Bar Component
 *
 * A fixed bottom navigation bar for mobile devices.
 * Displays the active module's sub-navigation items as tabs.
 *
 * @argument {Function} onOpenPIDSheet - Called when PID/Properties button is tapped
 * @argument {boolean} showPIDButton - Whether to show the PID tree access button
 */
export default class BottomTabBarComponent extends Component {
  @service municipality;
  @service router;

  @tracked showMoreMenu = false;

  // Maximum visible tabs before "More" button is shown
  maxVisibleTabs = 4;

  get activeModule() {
    const modules = this.municipality.moduleNavigation || [];
    return modules.find(
      (item) =>
        this.router.isActive(item.route) ||
        item.children?.some((child) => this.router.isActive(child.route)),
    );
  }

  get allTabs() {
    const active = this.activeModule;
    if (!active?.children) return [];

    // Filter out component-based children (they're for the desktop nav bar, not tabs)
    // and items that are marked as dropdown (like "Advanced" menu)
    return active.children.filter(
      (child) => child.route && !child.component && !child.isDropdown,
    );
  }

  get visibleTabs() {
    // If PID button is shown, we have one less slot for tabs
    const pidOffset = this.args.showPIDButton ? 1 : 0;
    const maxTabs = this.maxVisibleTabs - pidOffset;

    // If all tabs fit (including More button slot), show them all
    if (this.allTabs.length <= maxTabs + 1) {
      return this.allTabs;
    }

    // Otherwise, show maxTabs and use More for the rest
    return this.allTabs.slice(0, maxTabs);
  }

  get moreTabs() {
    const pidOffset = this.args.showPIDButton ? 1 : 0;
    const maxTabs = this.maxVisibleTabs - pidOffset;

    if (this.allTabs.length <= maxTabs + 1) {
      return [];
    }

    return this.allTabs.slice(maxTabs);
  }

  get hasMoreTabs() {
    return this.moreTabs.length > 0;
  }

  get showPIDButton() {
    // Show PID button for modules that use property selection
    // Mirrors the logic from municipality controller's shouldShowPropertySidebar
    if (this.args.showPIDButton === false) return false;

    const routeName = this.router.currentRouteName;
    if (!routeName) return false;

    // Show on assessing routes (excluding settings, reports, revaluation)
    const isAssessingRoute =
      routeName.startsWith('municipality.assessing') &&
      !routeName.startsWith('municipality.assessing.settings') &&
      !routeName.startsWith('municipality.assessing.reports') &&
      !routeName.startsWith('municipality.assessing.revaluation');

    // Show on building-permits find route
    const isBuildingPermitsFind =
      routeName === 'municipality.building-permits.find';

    // Show on tax-collection routes (future)
    const isTaxCollectionRoute = routeName.startsWith(
      'municipality.tax-collection',
    );

    return isAssessingRoute || isBuildingPermitsFind || isTaxCollectionRoute;
  }

  @action
  toggleMoreMenu(event) {
    event.stopPropagation();
    this.showMoreMenu = !this.showMoreMenu;
  }

  @action
  closeMoreMenu() {
    this.showMoreMenu = false;
  }

  @action
  navigateToTab(tab, event) {
    event?.stopPropagation();
    this.showMoreMenu = false;

    // Navigate to the tab's route
    if (tab.models && tab.models.length > 0) {
      this.router.transitionTo(tab.route, ...tab.models);
    } else {
      this.router.transitionTo(tab.route);
    }
  }

  @action
  openPIDSheet(event) {
    event?.stopPropagation();
    this.args.onOpenPIDSheet?.();
  }

  @action
  isTabActive(tab) {
    return this.router.isActive(tab.route);
  }

  @action
  getTabClass(tab) {
    let classes = 'bottom-tab-bar__tab';
    if (this.isTabActive(tab)) {
      classes += ' bottom-tab-bar__tab--active';
    }
    return classes;
  }
}
