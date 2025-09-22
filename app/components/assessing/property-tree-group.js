import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { action } from '@ember/object';

export default class PropertyTreeGroupComponent extends Component {
  @tracked isExpanded = false;

  get groupIcon() {
    switch (this.args.groupBy) {
      case 'pid':
        return 'map-marked-alt';
      case 'street':
        return 'road';
      case 'lastname':
        return 'user';
      default:
        return 'folder';
    }
  }

  get groupTitle() {
    const key = this.args.groupKey;
    switch (this.args.groupBy) {
      case 'pid':
        return `Map ${key}`;
      case 'street':
        return key === 'Unknown/Vacant' ? 'Unknown/Vacant' : `${key} St`;
      case 'lastname':
        return `${key} Names`;
      default:
        return key;
    }
  }

  @action
  toggleExpanded() {
    this.isExpanded = !this.isExpanded;
  }

  @action
  selectProperty(property) {
    this.args.onSelectProperty(property);
  }
}
