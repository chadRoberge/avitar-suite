import Component from '@glimmer/component';

export default class AssessingRevaluationsSheetVacantLandComponent extends Component {
  // Args:
  // @sheet - The analysis sheet object
  // @sales - Array of sales with adjustments for this sheet
  // @globalSettings - Global revaluation settings

  get salesData() {
    return (this.args.sales || []).map((sale) => ({
      ...sale,
      pricePerAcre: sale.acreage > 0 ? sale.sale_price / sale.acreage : 0,
      pricePerFrontFoot:
        sale.frontage > 0 ? sale.sale_price / sale.frontage : 0,
    }));
  }

  get statistics() {
    const sales = this.salesData;
    if (sales.length === 0) {
      return {
        count: 0,
        avgPrice: 0,
        avgPricePerAcre: 0,
        medianPricePerAcre: 0,
      };
    }

    const pricesPerAcre = sales
      .map((s) => s.pricePerAcre)
      .filter((p) => p > 0)
      .sort((a, b) => a - b);

    return {
      count: sales.length,
      avgPrice: sales.reduce((sum, s) => sum + s.sale_price, 0) / sales.length,
      avgPricePerAcre:
        pricesPerAcre.reduce((sum, p) => sum + p, 0) / pricesPerAcre.length,
      medianPricePerAcre:
        pricesPerAcre[Math.floor(pricesPerAcre.length / 2)] || 0,
    };
  }
}
