import Component from '@glimmer/component';

export default class AssessingRevaluationsSheetDevelopedLandComponent extends Component {
  // Args:
  // @sheet - The analysis sheet object
  // @sales - Array of sales with adjustments for this sheet
  // @globalSettings - Global revaluation settings

  get salesData() {
    return (this.args.sales || []).map((sale) => ({
      ...sale,
      landValue: sale.land_assessment || 0,
      buildingValue: sale.building_assessment || 0,
      totalAssessment: (sale.land_assessment || 0) + (sale.building_assessment || 0),
      landRatio: sale.sale_price > 0 ? (sale.land_assessment || 0) / sale.sale_price : 0,
    }));
  }
}
