import Component from '@glimmer/component';

export default class AssessingRevaluationsSheetWaterfrontBaseRateComponent extends Component {
  // Args:
  // @sheet - The analysis sheet object
  // @sales - Array of sales with adjustments for this sheet
  // @globalSettings - Global revaluation settings

  get salesData() {
    return (this.args.sales || []).map((sale) => ({
      ...sale,
      pricePerFrontFoot:
        sale.water_frontage > 0 ? sale.sale_price / sale.water_frontage : 0,
      waterfrontPremium: this.calculateWaterfrontPremium(sale),
    }));
  }

  calculateWaterfrontPremium(sale) {
    // Placeholder - will need actual waterfront attribute data
    return sale.waterfront_value || 0;
  }

  get averagePricePerFrontFoot() {
    const validSales = this.salesData.filter((s) => s.pricePerFrontFoot > 0);
    if (validSales.length === 0) return 0;
    const sum = validSales.reduce((total, s) => total + s.pricePerFrontFoot, 0);
    return sum / validSales.length;
  }
}
