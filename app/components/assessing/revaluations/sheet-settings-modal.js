import Component from '@glimmer/component';
import { action } from '@ember/object';

export default class AssessingRevaluationsSheetSettingsModalComponent extends Component {
  // Args:
  // @isOpen - Boolean to show/hide modal
  // @sheetName - Sheet name
  // @sheetType - Sheet type
  // @depreciationRate - Depreciation rate (for building_rate sheets)
  // @buildableSiteValue - Buildable site value (for building_rate sheets)
  // @siteAcreage - Site acreage (for building_rate sheets)
  // @excessFootFrontage - Excess foot frontage value (for building_rate sheets)
  // @excessAcreageValue - Excess acreage value (for building_rate sheets)
  // @baseDate - Base date for time adjustments
  // @annualTrend - Annual trend percentage
  // @isSaving - Boolean for loading state
  // @onClose - Action to close modal
  // @onSave - Action to save settings
  // @onUpdateSheetName - Action to update sheet name
  // @onUpdateDepreciationRate - Action to update depreciation rate
  // @onUpdateBuildableSiteValue - Action to update buildable site value
  // @onUpdateSiteAcreage - Action to update site acreage
  // @onUpdateExcessFootFrontage - Action to update excess foot frontage
  // @onUpdateExcessAcreageValue - Action to update excess acreage value
  // @onUpdateBaseDate - Action to update base date
  // @onUpdateAnnualTrend - Action to update annual trend

  get canSave() {
    return this.args.sheetName && !this.args.isSaving;
  }

  @action
  stopPropagation(event) {
    event.stopPropagation();
  }
}
