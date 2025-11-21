import Controller from '@ember/controller';
import { tracked } from '@glimmer/tracking';

export default class MunicipalityAssessingRevaluationController extends Controller {
  // Track current sheet ID for sidebar highlighting
  @tracked currentSheetId = null;
}
