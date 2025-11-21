import Component from '@glimmer/component';

export default class AssessingRevaluationsSheetViewComponent extends Component {
  // Args:
  // @sheet - The analysis sheet object
  // @sales - Array of sales with adjustments for this sheet
  // @globalSettings - Global revaluation settings

  get sheetType() {
    return this.args.sheet?.sheet_type;
  }

  get sheetName() {
    return this.args.sheet?.sheet_name || 'Untitled Sheet';
  }

  get salesCount() {
    return this.args.sales?.length || 0;
  }

  get averageRate() {
    return this.args.sheet?.results?.average_rate || 0;
  }

  get medianRate() {
    return this.args.sheet?.results?.median_rate || 0;
  }
}
