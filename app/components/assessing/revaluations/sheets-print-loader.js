import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { inject as service } from '@ember/service';

export default class AssessingRevaluationsSheetsPrintLoaderComponent extends Component {
  @service api;

  // Args:
  // @sheets - Array of sheet objects OR array of sheet IDs
  // @revaluation - Revaluation object
  // @municipality - Municipality object

  @tracked sheetsData = [];
  @tracked isLoading = true;

  constructor() {
    super(...arguments);
    this.loadSheetsData();
  }

  async loadSheetsData() {
    this.isLoading = true;
    const sheets = this.args.sheets || [];
    const revaluationId = this.args.revaluation._id;

    try {
      // Load sales for each sheet
      const sheetsWithSales = await Promise.all(
        sheets.map(async (sheet) => {
          // If sheet is just an ID string, we need to fetch the sheet first
          const sheetId = typeof sheet === 'string' ? sheet : sheet._id;

          // Fetch sales for this sheet
          const salesResponse = await this.api.get(
            `/revaluations/${revaluationId}/sheets/${sheetId}/sales`,
          );

          return {
            sheet: typeof sheet === 'string' ? { _id: sheetId } : sheet,
            sales: salesResponse.sales || [],
          };
        }),
      );

      this.sheetsData = sheetsWithSales;
    } catch (error) {
      console.error('Error loading sheets data for print:', error);
      this.sheetsData = [];
    } finally {
      this.isLoading = false;
    }
  }
}
