import Component from '@glimmer/component';

export default class AssessingRevaluationsSheetViewBaseRateComponent extends Component {
  // Args:
  // @sheet - The analysis sheet object
  // @sales - Array of sales with adjustments for this sheet
  // @globalSettings - Global revaluation settings

  get salesData() {
    return (this.args.sales || []).map((sale) => ({
      ...sale,
      viewPremium: this.calculateViewPremium(sale),
      adjustedPrice: sale.sale_price - this.calculateViewPremium(sale),
    }));
  }

  calculateViewPremium(sale) {
    // Placeholder - will need actual view attribute data from sale
    return sale.view_value || 0;
  }

  get averageViewPremium() {
    if (this.salesData.length === 0) return 0;
    const sum = this.salesData.reduce((total, s) => total + s.viewPremium, 0);
    return sum / this.salesData.length;
  }
}
