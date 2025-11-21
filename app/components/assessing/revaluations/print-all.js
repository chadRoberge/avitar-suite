import Component from '@glimmer/component';
import { action } from '@ember/object';

export default class AssessingRevaluationsPrintAllComponent extends Component {
  // Args:
  // @revaluation - The revaluation object
  // @sheets - Array of all sheets
  // @sales - All sales data
  // @globalSettings - Global revaluation settings

  get effectiveYear() {
    return this.args.revaluation?.effective_year || new Date().getFullYear();
  }

  get municipality() {
    return this.args.revaluation?.municipality_name || '';
  }

  get sheetsWithSales() {
    return (this.args.sheets || []).map((sheet) => {
      // Filter sales for this specific sheet
      const sheetSales = (this.args.sales || []).filter((sale) =>
        sale.sheet_ids?.includes(sheet._id),
      );

      return {
        sheet,
        sales: sheetSales,
      };
    });
  }

  @action
  print() {
    window.print();
  }
}
