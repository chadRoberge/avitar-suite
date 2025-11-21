import Component from '@glimmer/component';
import { action } from '@ember/object';

export default class AssessingRevaluationsCreateSheetModalComponent extends Component {
  // Args:
  // @isOpen - Boolean to show/hide modal
  // @sheetTypeOptions - Array of sheet type options
  // @buildingCodes - Array of building codes (for building rate sheets)
  // @newSheetName - Current sheet name value
  // @newSheetType - Current sheet type value
  // @newSheetDepreciationRate - Current depreciation rate value
  // @newSheetMinAcreage - Current min acreage value
  // @newSheetBuildingCodeId - Current building code ID value
  // @selectedSalesCount - Number of selected sales
  // @isCreating - Boolean for loading state
  // @onClose - Action to close modal
  // @onCreate - Action to create sheet
  // @onUpdateName - Action to update name
  // @onUpdateType - Action to update type
  // @onUpdateDepreciationRate - Action to update depreciation rate
  // @onUpdateMinAcreage - Action to update min acreage
  // @onUpdateBuildingCodeId - Action to update building code

  get canCreate() {
    return (
      this.args.newSheetName &&
      this.args.newSheetType &&
      this.args.selectedSalesCount > 0 &&
      !this.args.isCreating
    );
  }

  get showDepreciationRate() {
    return this.args.newSheetType === 'building_rate';
  }

  get showMinAcreage() {
    return (
      this.args.newSheetType === 'excess_acreage' ||
      this.args.newSheetType === 'vacant_land'
    );
  }

  get showBuildingCode() {
    return this.args.newSheetType === 'building_rate';
  }

  get showLandUseCode() {
    return (
      this.args.newSheetType === 'vacant_land' ||
      this.args.newSheetType === 'developed_land'
    );
  }

  @action
  stopPropagation(event) {
    event.stopPropagation();
  }
}
