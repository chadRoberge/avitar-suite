import Component from '@glimmer/component';

export default class AssessingRevaluationsSheetExcessAcreageComponent extends Component {
  // Args:
  // @sheet - The analysis sheet object
  // @sales - Array of sales with adjustments for this sheet
  // @globalSettings - Global revaluation settings

  get settings() {
    return this.args.sheet?.sheet_settings || {};
  }

  get minAcreage() {
    return this.settings.min_acreage || 0;
  }

  get salesData() {
    return (this.args.sales || []).map((sale) => ({
      ...sale,
      excessAcreage:
        sale.acreage > this.minAcreage ? sale.acreage - this.minAcreage : 0,
      excessValue: this.calculateExcessValue(sale),
    }));
  }

  calculateExcessValue(sale) {
    if (!sale.acreage || sale.acreage <= this.minAcreage) {
      return 0;
    }
    const excessAcreage = sale.acreage - this.minAcreage;
    return excessAcreage * (sale.sale_price / sale.acreage);
  }

  get averageExcessRate() {
    const salesWithExcess = this.salesData.filter((s) => s.excessAcreage > 0);
    if (salesWithExcess.length === 0) return 0;

    const sum = salesWithExcess.reduce((total, sale) => {
      return total + sale.excessValue / sale.excessAcreage;
    }, 0);

    return sum / salesWithExcess.length;
  }
}
