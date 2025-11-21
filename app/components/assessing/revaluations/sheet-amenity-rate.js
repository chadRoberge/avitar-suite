import Component from '@glimmer/component';

export default class AssessingRevaluationsSheetAmenityRateComponent extends Component {
  // Args:
  // @sheet - The analysis sheet object
  // @sales - Array of sales with adjustments for this sheet
  // @globalSettings - Global revaluation settings

  get salesData() {
    return (this.args.sales || []).map((sale) => ({
      ...sale,
      amenityValue: this.calculateAmenityValue(sale),
      adjustedPrice: sale.sale_price - this.calculateAmenityValue(sale),
    }));
  }

  calculateAmenityValue(sale) {
    // Placeholder - will need actual amenity data
    return sale.amenity_value || 0;
  }

  get averageAmenityValue() {
    if (this.salesData.length === 0) return 0;
    const sum = this.salesData.reduce((total, s) => total + s.amenityValue, 0);
    return sum / this.salesData.length;
  }
}
