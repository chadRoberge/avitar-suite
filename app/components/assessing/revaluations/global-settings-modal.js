import Component from '@glimmer/component';
import { action } from '@ember/object';

export default class AssessingRevaluationsGlobalSettingsModalComponent extends Component {
  // Args:
  // @isOpen - Boolean to show/hide modal
  // @baseYear - Current base year value
  // @timeTrendEntries - Array of time trend entries
  // @currentUseMaxAcreage - Max acreage for current use
  // @isSaving - Boolean for loading state
  // @onClose - Action to close modal
  // @onSave - Action to save settings
  // @onUpdateBaseYear - Action to update base year
  // @onUpdateCurrentUseMaxAcreage - Action to update current use max acreage
  // @onAddTimeTrendEntry - Action to add new time trend entry
  // @onRemoveTimeTrendEntry - Action to remove time trend entry
  // @onUpdateTimeTrendEntry - Action to update time trend entry

  get canSave() {
    return this.args.baseYear && !this.args.isSaving;
  }

  @action
  stopPropagation(event) {
    event.stopPropagation();
  }
}
