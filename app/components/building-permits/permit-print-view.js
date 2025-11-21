import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';

export default class PermitPrintViewComponent extends Component {
  @tracked currentDate = new Date();
}
