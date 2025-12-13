import Component from '@glimmer/component';
import { inject as service } from '@ember/service';
import { tracked } from '@glimmer/tracking';
import BuildingAssessmentCalculator from 'avitar-suite/utils/building-assessment-calculator';

export default class AssessingRevaluationsPrintBuildingRateComponent extends Component {
  @service api;

  // Args:
  // @sheet - The analysis sheet object
  // @revaluation - Revaluation object
  // @municipality - Municipality object
  // @pageNumber - Current page number
  // @totalPages - Total number of pages

  @tracked sales = [];
  @tracked isLoading = true;

  // Configurable: rows per page for pagination
  SALES_PER_PAGE = 10;

  constructor() {
    super(...arguments);
    this.loadSalesData();
  }

  async loadSalesData() {
    this.isLoading = true;
    try {
      const revaluationId = this.args.revaluation._id;
      const sheetId = this.args.sheet._id;
      const response = await this.api.get(
        `/revaluations/${revaluationId}/sheets/${sheetId}/sales`,
      );
      this.sales = response.sales || [];
    } catch (error) {
      console.error('Error loading sales data for print:', error);
      this.sales = [];
    } finally {
      this.isLoading = false;
    }
  }

  get settings() {
    return this.args.sheet?.sheet_settings || {};
  }

  get baseYear() {
    return (
      this.args.revaluation?.global_settings?.base_year ||
      new Date().getFullYear()
    );
  }

  get depreciationRate() {
    return this.settings.depreciation_rate || 1.25;
  }

  get siteAcreage() {
    return this.settings.site_acreage || 2.0;
  }

  get buildableSiteValue() {
    return this.settings.buildable_site_value || 290000;
  }

  get excessFootFrontage() {
    return this.settings.excess_foot_frontage || 160;
  }

  get excessAcreageValue() {
    return this.settings.excess_acreage_value || 10000;
  }

  get minAcreage() {
    return this.settings.min_acreage || 10.0;
  }

  get maxAcreage() {
    return this.settings.max_acreage || 500.0;
  }

  get maxDiscountPercent() {
    return this.settings.max_discount_percent || 50.0;
  }

  get annualTrendDisplay() {
    const trend = this.settings.annual_trend || 0.144;
    const trendPercent = (trend * 100).toFixed(2);
    const baseDate = this.settings.base_date || new Date();
    const formattedDate = new Date(baseDate).toLocaleDateString('en-US', {
      month: '2-digit',
      day: '2-digit',
      year: '2-digit',
    });
    return `${trendPercent}% < ${formattedDate} > 0.00%`;
  }

  get salesData() {
    const baseDate = this.settings.base_date || new Date();
    const annualTrend = this.settings.annual_trend || 0.144; // 14.4%

    return (this.sales || []).map((sale) => {
      // Calculate days from base date
      const saleDate = new Date(sale.sale_date);
      const baseDateObj = new Date(baseDate);
      const daysDiff = Math.floor(
        (baseDateObj - saleDate) / (1000 * 60 * 60 * 24),
      );

      // Calculate adjusted price
      const adjustedPrice =
        sale.sale_price * (1 + (daysDiff * annualTrend) / 365);

      // Adjustment factors (these would come from the sale data or sheet settings)
      const zoneAdj = sale.adjustments?.zone || 1.0;
      const neighborhoodAdj = sale.adjustments?.neighborhood || 1.0;
      const siteAdj = sale.adjustments?.site || 1.0;
      const drivewayAdj = sale.adjustments?.driveway || 1.0;
      const roadAdj = sale.adjustments?.road || 1.0;
      const topoAdj = sale.adjustments?.topo || 1.0;
      const condAdj = sale.adjustments?.condition || 1.0;

      // Calculate adjusted site value
      const adjSiteValue =
        this.buildableSiteValue *
        neighborhoodAdj *
        siteAdj *
        drivewayAdj *
        roadAdj *
        condAdj;

      // Calculate excess values
      const excessAcres = Math.max(0, (sale.acreage || 0) - this.siteAcreage);
      const excessAcValue = excessAcres * this.excessAcreageValue;
      const excessFFValue =
        (sale.excess_frontage || 0) * this.excessFootFrontage;

      // Features value (would come from property features)
      const featuresValue = sale.features_value || 0;

      // Building residual value
      const buildingResidualValue =
        adjustedPrice -
        adjSiteValue -
        featuresValue -
        excessAcValue -
        excessFFValue;

      // Building rate (from property data)
      const buildingRate = sale.building_rate || 1.0;

      // Calculate age and depreciation using the centralized calculator
      const ageInYears = sale.building_year_built
        ? this.baseYear - sale.building_year_built
        : 0;

      // Map numeric condition factor to description for the calculator
      const conditionFactorToDescription = {
        1.0: 'Excellent',
        1.5: 'Very Good',
        2.0: 'Good',
        2.5: 'Average',
        3.0: 'Fair',
        3.5: 'Poor',
        4.0: 'Very Poor',
        5.0: 'Very Poor',
      };

      const buildingCondFactor = sale.building_condition || 2.0;
      const conditionDescription =
        conditionFactorToDescription[buildingCondFactor] || 'Average';

      // Use the centralized calculator for age depreciation (single source of truth)
      const calculator = new BuildingAssessmentCalculator();
      const buildingData = {
        depreciation: {
          normal: {
            description: conditionDescription,
          },
        },
      };

      // Calculate age depreciation using the official calculation
      const ageDepreciation =
        calculator.calculateNormalDepreciation(
          buildingData,
          ageInYears,
          this.depreciationRate,
        ) * 100; // Convert decimal to percentage

      const otherDepreciation = sale.other_depreciation || 0;
      const totalDepreciation = ageDepreciation + otherDepreciation;

      // Calculate indicated sq ft value
      const indicatedSqFtValue =
        sale.building_sf > 0
          ? buildingResidualValue /
            buildingRate /
            (1 - totalDepreciation / 100) /
            sale.building_sf
          : 0;

      return {
        ...sale,
        daysFromBaseDate: daysDiff,
        adjustedPrice,
        zone: zoneAdj.toFixed(2),
        neighborhood: neighborhoodAdj.toFixed(2),
        siteAdjustment: siteAdj.toFixed(2),
        drivewayAdjustment: drivewayAdj.toFixed(2),
        roadAdjustment: roadAdj.toFixed(2),
        topoAdjustment: topoAdj.toFixed(2),
        condAdjustment: condAdj.toFixed(2),
        adjSiteValue,
        featuresValue,
        excessAcValue,
        excessFFValue,
        buildingResidualValue,
        buildingRate: buildingRate.toFixed(4),
        buildingCond: buildingCondFactor.toFixed(2),
        age: ageDepreciation.toFixed(2), // Age depreciation percentage
        otherDepreciation,
        totalDepreciation,
        indicatedSqFtValue,
      };
    });
  }

  get averageRate() {
    if (this.salesData.length === 0) return 0;
    const sum = this.salesData.reduce(
      (total, s) => total + s.indicatedSqFtValue,
      0,
    );
    return sum / this.salesData.length;
  }

  get medianRate() {
    if (this.salesData.length === 0) return 0;
    const sorted = [...this.salesData]
      .map((s) => s.indicatedSqFtValue)
      .sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0
      ? (sorted[mid - 1] + sorted[mid]) / 2
      : sorted[mid];
  }

  get totalPages() {
    return Math.ceil(this.salesData.length / this.SALES_PER_PAGE);
  }

  get paginatedSales() {
    const sales = this.salesData;
    const pages = [];

    for (let i = 0; i < sales.length; i += this.SALES_PER_PAGE) {
      pages.push({
        pageNumber: Math.floor(i / this.SALES_PER_PAGE) + 1,
        sales: sales.slice(i, i + this.SALES_PER_PAGE),
      });
    }

    return pages;
  }

  get printDate() {
    return new Date().toLocaleString('en-US', {
      month: '2-digit',
      day: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
    });
  }
}
