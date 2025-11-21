import Component from '@glimmer/component';
import { action } from '@ember/object';

export default class AssessingRevaluationsSheetsPrintComponent extends Component {
  // Args:
  // @sheet - Single sheet object OR
  // @sheets - Array of sheet objects
  // @revaluation - Revaluation object
  // @municipality - Municipality object

  get sheetsArray() {
    if (this.args.sheets) {
      return Array.isArray(this.args.sheets)
        ? this.args.sheets
        : [this.args.sheets];
    }
    if (this.args.sheet) {
      return [this.args.sheet];
    }
    return [];
  }

  @action
  print() {
    window.print();
  }
}
